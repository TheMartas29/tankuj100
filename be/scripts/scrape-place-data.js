#!/usr/bin/env node
/*
 * Scraper DALŠÍCH dat o benzínce z Google Maps → staging (data/place-data-staging/<id>.json).
 *
 * Doplněk k scrape-reviews.js: kde ten tahá recenze, tenhle tahá vše ostatní, co by
 * pro tankuj100 mohlo být užitečné – otevírací dobu, telefon, web, adresu, kategorii,
 * hodnocení (počet+průměr), atributy z „O podniku" (služby/vybavení/platby) a pokus
 * o ceny paliv, když je Google ukazuje. Je to PRŮZKUM: co půjde, uloží; ať je vidět,
 * co všechno se dá získat, a teprve pak se rozhodne, co nasadit do DB.
 *
 * POZOR: proti podmínkám Googlu. Pouštět lokálně, pomalu, NE souběžně s jiným
 * scraperem (riziko banu). Nic nezapisuje do DB – jen staging soubory.
 *
 * Šetří requesty: když existuje data/reviews-staging/<id>.json s placeUrl, jde rovnou
 * na to místo (bez vyhledávání). Bez toho zkusí najít místo přes hledání podle GPS.
 *
 *   node scripts/scrape-place-data.js --id 98 --headful     zkouška na jedné
 *   node scripts/scrape-place-data.js --limit 20            prvních 20
 *   node scripts/scrape-place-data.js                       všechny (dlouhé)
 *
 * Volitelně: --delay MS (default 6000, náhodně se prodlouží), --force přepíše hotové.
 */
const fs = require('fs');
const path = require('path');

const { parseArgs } = require('./lib/cli');
const { openDatabase } = require('./lib/database');
const { blank, printSummary } = require('./lib/log');

const USAGE = `
Scraper dalších dat o benzínce z Google Maps do staging (bez zápisu do DB).

  node scripts/scrape-place-data.js --id 98 --headful   zkouška na jedné stanici
  node scripts/scrape-place-data.js --limit 20          prvních 20
  node scripts/scrape-place-data.js --brand Shell       jen jedna značka
  node scripts/scrape-place-data.js                     všechny (dlouhé, riziko blocku)

Volitelně: --delay MS základní pauza (default 6000, náhodně se prodlouží), --force.
`;

const args = parseArgs({
  usage: USAGE,
  flags: ['headful', 'force'],
  numbers: ['limit', 'delay', 'radius'],
  texts: ['brand', 'city', 'id'],
});

const DELAY_MS = args.delay || 6000;
const MAX_RADIUS_M = args.radius || 200;
const REVIEWS_STAGING = path.join(__dirname, '..', 'data', 'reviews-staging');
const STAGING_DIR = path.join(__dirname, '..', 'data', 'place-data-staging');
const NON_STATION = /(myck|mycka|myčk|car ?wash|wash|shop|trafik|restau|hotel)/i;

// --- pomůcky (sdílené s scrape-reviews.js) --------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (base) => base + Math.floor(Math.random() * base * 1.5);

const normalize = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function coordsFromUrl(url) {
  const poi = url.match(/!3d(-?[0-9.]+)!4d(-?[0-9.]+)/);
  if (poi) return { lat: Number(poi[1]), lon: Number(poi[2]) };
  const at = url.match(/@(-?[0-9.]+),(-?[0-9.]+)/);
  if (at) return { lat: Number(at[1]), lon: Number(at[2]) };
  return null;
}

/** place_id z URL (…!1s0x…:0x…! nebo /data=…). */
function placeIdFromUrl(url) {
  const m = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  return m ? m[1] : null;
}

async function isBlocked(page) {
  if (/\/sorry\/|consent\.google\.com\/.*sorry/.test(page.url())) return true;
  const body = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  return /unusual traffic|neobvyklý provoz|nejsem robot|not a robot|captcha/i.test(body);
}

async function dismissConsent(page) {
  if (!/consent\.google\.|\/consent/.test(page.url())) return;
  for (const label of ['Odmítnout vše', 'Reject all', 'Odmítnout všechny', 'Nesouhlasím']) {
    const button = page.locator(`button:has-text("${label}"), [aria-label="${label}"]`).first();
    if (await button.count().catch(() => 0)) {
      await button.click().catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return;
    }
  }
}

// Když nemáme placeUrl z recenzí, najdeme místo přes hledání podle GPS (jako v reviews).
async function pickBestPlace(page, station) {
  const results = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).map((a) => ({
      label: a.getAttribute('aria-label') || '',
      href: a.href,
    }))
  );
  const brandTokens = normalize(station.brand_name).split(' ').filter((w) => w.length > 1);
  const candidates = [];
  for (const r of results) {
    const m = r.href.match(/!3d(-?[0-9.]+)!4d(-?[0-9.]+)/);
    if (!m) continue;
    const distance = distanceM(station.lat, station.lon, Number(m[1]), Number(m[2]));
    const label = normalize(r.label);
    const brandMatch = brandTokens.length ? brandTokens.some((t) => label.includes(t)) : true;
    candidates.push({ href: r.href, distance, brandMatch, isPoi: NON_STATION.test(r.label) });
  }
  const within = candidates.filter((c) => c.distance <= MAX_RADIUS_M);
  const pool = within.length ? within : candidates;
  pool.sort((a, b) => {
    if (a.brandMatch !== b.brandMatch) return a.brandMatch ? -1 : 1;
    if (a.isPoi !== b.isPoi) return a.isPoi ? 1 : -1;
    return a.distance - b.distance;
  });
  return pool[0] || null;
}

// --- extrakce dat o místě --------------------------------------------------

/** Rozklikne otevírací dobu, ať se do DOMu načte týdenní tabulka. */
async function expandHours(page) {
  const toggle = page
    .locator('button[aria-label*="Otevírací dobu"], button[data-item-id="oh"], img[aria-label*="Otevírací"]')
    .first();
  if (await toggle.count().catch(() => 0)) {
    await toggle.click().catch(() => {});
    await sleep(600);
  }
}

/** Přepne na záložku „O podniku"/„Informace", ať se načtou atributy. */
async function openAbout(page) {
  const tab = page.getByRole('tab', { name: /O tomto|O podniku|Informace|About/i }).first();
  if (await tab.count().catch(() => 0)) {
    await tab.click().catch(() => {});
    await sleep(1000);
  }
}

async function extractPlace(page) {
  return page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim() || null;

    // Info řádky mají stabilní data-item-id + aria-label „Adresa: …" apod.
    const itemLabel = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const al = el.getAttribute('aria-label') || el.textContent || '';
      return clean(al.replace(/^[^:]*:\s*/, ''));
    };

    const title = clean(document.querySelector('h1')?.textContent);
    const category = clean(document.querySelector('button[jsaction*="category"]')?.textContent);
    const address = itemLabel('button[data-item-id="address"]');
    const phone = itemLabel('button[data-item-id^="phone"]');
    const website =
      document.querySelector('a[data-item-id="authority"]')?.href ||
      itemLabel('a[data-item-id="authority"]');
    const plusCode = itemLabel('button[data-item-id="oloc"]');

    // Hodnocení: průměr + počet (z různých míst, ať to vydrží drobné změny DOMu).
    let ratingAvg = null;
    let ratingCount = null;
    const avgEl = document.querySelector('div.fontDisplayLarge, span[aria-hidden="true"].ceNzKf');
    if (avgEl) {
      const m = clean(avgEl.textContent)?.match(/([1-5](?:[.,]\d)?)/);
      if (m) ratingAvg = Number(m[1].replace(',', '.'));
    }
    const cntLabel = Array.from(document.querySelectorAll('button, span, [aria-label]'))
      .map((e) => e.getAttribute('aria-label') || e.textContent || '')
      .find((t) => /recenz|reviews/i.test(t) && /\d/.test(t));
    if (cntLabel) {
      const m = cntLabel.replace(/\s| /g, '').match(/([\d]{1,6})recenz/i) || cntLabel.match(/(\d[\d\s ]*)/);
      if (m) ratingCount = Number(m[1].replace(/[\s ]/g, ''));
    }

    // Otevírací doba: řádky tabulky (den → hodiny).
    const hours = [];
    for (const row of document.querySelectorAll('table tr, [role="row"]')) {
      const cells = Array.from(row.querySelectorAll('th, td, [role="cell"], [role="gridcell"]'))
        .map((c) => clean(c.textContent))
        .filter(Boolean);
      if (cells.length >= 2 && /po|út|st|čt|pá|so|ne|mon|tue|wed|thu|fri|sat|sun/i.test(cells[0])) {
        hours.push({ day: cells[0], hours: cells.slice(1).join(' ') });
      }
    }

    // Atributy z „O podniku": všechny položky seznamů v panelu (služby/vybavení/platby…).
    const about = [];
    for (const li of document.querySelectorAll('div[role="region"] li, div[aria-label*="Informace"] li, .iP2t7d li')) {
      const t = clean(li.textContent);
      if (t) about.push(t);
    }

    // Pokus o ceny paliv: elementy, jejichž text obsahuje palivo + cenu.
    const fuelPrices = [];
    for (const el of document.querySelectorAll('div, span, td')) {
      const t = clean(el.textContent);
      if (t && t.length < 40 && /(natural|diesel|nafta|benz|lpg|cng|adblue|e5|e10|95|98|100)/i.test(t) && /(kč|czk|€|\d[.,]\d{2})/i.test(t)) {
        fuelPrices.push(t);
      }
    }

    return {
      title,
      category,
      address,
      phone,
      website,
      plusCode,
      ratingAvg,
      ratingCount,
      hours,
      about: [...new Set(about)].slice(0, 60),
      fuelPrices: [...new Set(fuelPrices)].slice(0, 20),
    };
  });
}

// --- načtení stanic + placeUrl z recenzí -----------------------------------

function reviewsPlaceUrl(stationId) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(REVIEWS_STAGING, `${stationId}.json`), 'utf8'));
    // Jen když recenzní scrape našel skutečné místo (má shodu).
    if (d.placeUrl && d.placeUrl.includes('/maps/place/') && (d.confidence || 0) >= 0.5) return d.placeUrl;
  } catch {}
  return null;
}

function loadStations() {
  const db = openDatabase({ readonly: true });
  const where = [];
  const params = [];
  if (args.brand) { where.push('LOWER(brand_name) LIKE ?'); params.push(`%${args.brand.toLowerCase()}%`); }
  if (args.city) { where.push('LOWER(city) LIKE ?'); params.push(`%${args.city.toLowerCase()}%`); }
  if (args.id) {
    const ids = args.id.split(',').map((x) => Number(x.trim())).filter(Number.isInteger);
    where.push(`id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }
  const rows = db
    .prepare(`SELECT id, brand_name, name, city, lat, lon FROM station ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`)
    .all(...params);
  db.close();
  return args.limit ? rows.slice(0, args.limit) : rows;
}

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    console.error('CHYBA: chybí Playwright. Lokálně: npm install playwright && npx playwright install chromium');
    process.exit(1);
  }
}

async function scrapeStation(page, station) {
  let placeUrl = reviewsPlaceUrl(station.id);
  let reused = Boolean(placeUrl);

  if (placeUrl) {
    await page.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await dismissConsent(page);
    await sleep(1500);
    if (await isBlocked(page)) throw new Error('BLOCKED');
  } else {
    // Fallback: hledání podle GPS.
    const query = [station.brand_name, station.name, station.city].filter(Boolean).join(' ');
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${station.lat},${station.lon},16z?hl=cs&gl=CZ`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await dismissConsent(page);
    await sleep(1500);
    if (await isBlocked(page)) throw new Error('BLOCKED');
    await page.waitForFunction(
      () => location.href.includes('/maps/place/') || document.querySelector('a[href*="/maps/place/"]'),
      { timeout: 10000 }
    ).catch(() => {});
    const best = await pickBestPlace(page, station);
    if (best) { await page.goto(best.href, { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(1500); }
    placeUrl = page.url();
  }

  if (!placeUrl.includes('/maps/place/')) {
    return { stationId: station.id, station: { brand: station.brand_name, name: station.name, city: station.city }, placeUrl, reusedReviewsUrl: reused, resolved: false, scrapedAt: new Date().toISOString(), data: null };
  }

  await expandHours(page);
  const base = await extractPlace(page);
  await openAbout(page);
  const about = await extractPlace(page); // po otevření „O podniku" bývá atributů víc
  const data = { ...base, about: [...new Set([...(base.about || []), ...(about.about || [])])].slice(0, 80) };

  const coords = coordsFromUrl(placeUrl);
  return {
    stationId: station.id,
    station: { brand: station.brand_name, name: station.name, city: station.city },
    placeUrl,
    placeId: placeIdFromUrl(placeUrl),
    coords,
    reusedReviewsUrl: reused,
    resolved: true,
    scrapedAt: new Date().toISOString(),
    data,
  };
}

async function main() {
  const stations = loadStations();
  if (!stations.length) { console.error('Žádné stanice neodpovídají filtru.'); process.exit(1); }
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: !args.headful });
  const context = await browser.newContext({
    locale: 'cs-CZ',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });
  const page = await context.newPage();

  let ok = 0;
  let unresolved = 0;
  let failed = 0;

  for (const [index, station] of stations.entries()) {
    const target = path.join(STAGING_DIR, `${station.id}.json`);
    if (!args.force && fs.existsSync(target)) {
      console.log(`[${index + 1}/${stations.length}] #${station.id} přeskočeno (staging existuje)`);
      continue;
    }
    process.stdout.write(`[${index + 1}/${stations.length}] #${station.id} ${station.brand_name || ''} ${station.name || ''} … `);

    let done = false;
    let blockStrikes = 0;
    while (!done) {
      try {
        const result = await scrapeStation(page, station);
        fs.writeFileSync(target, JSON.stringify(result, null, 2));
        if (result.resolved) { ok += 1; const d = result.data; console.log(`OK ${result.reusedReviewsUrl ? '(reuse)' : ''} – hodin:${d.hours.length} atrib:${d.about.length} ceny:${d.fuelPrices.length} tel:${d.phone ? 'ano' : 'ne'} web:${d.website ? 'ano' : 'ne'}`); }
        else { unresolved += 1; console.log('nenalezeno místo'); }
        done = true;
      } catch (err) {
        if (err.message === 'BLOCKED') {
          blockStrikes += 1;
          const waitMs = Math.min(60, 10 * 2 ** (blockStrikes - 1)) * 60 * 1000;
          console.log(`BLOCK od Googlu (${blockStrikes}×) → pauza ${Math.round(waitMs / 60000)} min`);
          await sleep(waitMs);
          if (blockStrikes >= 5) { failed += 1; console.log('  vzdávám tuto stanici'); done = true; }
        } else {
          failed += 1;
          console.log(`CHYBA: ${err.message}`);
          done = true;
        }
      }
    }

    if (index < stations.length - 1) await sleep(jitter(DELAY_MS));
    if ((index + 1) % 50 === 0) {
      const breakMs = jitter(120000);
      console.log(`  … přestávka ${Math.round(breakMs / 60000)} min (${index + 1} hotovo)`);
      await sleep(breakMs);
    }
  }

  await browser.close();
  blank();
  printSummary([
    ['Stanic zpracováno', stations.length],
    ['Získáno dat', ok],
    ['Místo nenalezeno', unresolved],
    ['Chyby', failed],
    ['Staging', STAGING_DIR],
  ]);
}

main().catch((err) => { console.error(err); process.exit(1); });
