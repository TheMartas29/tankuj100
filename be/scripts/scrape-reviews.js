#!/usr/bin/env node
/*
 * Scraper hodnocení z Google Maps → staging (data/reviews-staging/<id>.json).
 *
 * POZOR: scrapování Google Maps je proti jejich podmínkám. Pouštěj to lokálně,
 * pomalu a v malých dávkách, ne z produkčního serveru. Skript NIC nezapisuje do
 * databáze – jen skládá staging soubory, které se pak ručně zkontrolují a teprve
 * potom naimportují (scripts/import-reviews.js).
 *
 * Playwright je záměrně mimo package.json, ať produkční deploy netahá Chromium.
 * Před prvním během lokálně:
 *   npm install playwright   (uvnitř be/)
 *   npx playwright install chromium
 *
 *   node scripts/scrape-reviews.js --limit 1              zkouška na jedné stanici
 *   node scripts/scrape-reviews.js --brand Shell --city Brno
 *   node scripts/scrape-reviews.js --id 42 --headful     vidět, co prohlížeč dělá
 *   node scripts/scrape-reviews.js                        všechny (dlouhé!)
 */
const fs = require('fs');
const path = require('path');

const { parseArgs } = require('./lib/cli');
const { openDatabase } = require('./lib/database');
const { blank, printSummary } = require('./lib/log');

const USAGE = `
Scraper hodnocení z Google Maps do staging souborů (bez zápisu do DB).

  node scripts/scrape-reviews.js --limit 1          zkouška na jedné stanici
  node scripts/scrape-reviews.js --brand Shell      jen jedna značka
  node scripts/scrape-reviews.js --city Brno        jen jedno město
  node scripts/scrape-reviews.js --id 42            jedna konkrétní stanice
  node scripts/scrape-reviews.js --headful          zobrazit prohlížeč
  node scripts/scrape-reviews.js --force            přepsat i hotové staging soubory
  node scripts/scrape-reviews.js --top 3            jen 3 nejrelevantnější s textem, bez scrollu
  node scripts/scrape-reviews.js                    všechny stanice (dlouhé, riziko blocku)

Volitelně: --top N (nejrelevantnější s textem, bez scrollu), --max-reviews N (default 20),
--delay MS základní pauza mezi stanicemi (default 4000; reálně se náhodně prodlouží kvůli blocku).
`;

const args = parseArgs({
  usage: USAGE,
  flags: ['headful', 'force'],
  numbers: ['limit', 'max-reviews', 'delay', 'radius', 'top'],
  texts: ['brand', 'city', 'id'],
});

// Režim --top: vezmi jen N nejrelevantnějších recenzí s textem (Google řadí ve
// výchozím stavu podle relevance), bez scrollování – rychlejší a menší stopa.
const TOP = args.top || null;
const MAX_REVIEWS = TOP || args.maxReviews || 20;
const DELAY_MS = args.delay || 4000;
const MAX_RADIUS_M = args.radius || 200; // dál od stanice už výsledek nepovažujeme za shodu
const STAGING_DIR = path.join(__dirname, '..', 'data', 'reviews-staging');

// POI, které se tváří jako značka, ale nejsou to samotná stanice (nechceme recenze myčky).
const NON_STATION = /(myck|mycka|myčk|car ?wash|wash|shop|trafik|restau|hotel)/i;

// --- pomůcky ---------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Náhodná pauza base..base*2.5 – proti detekci robota od Googlu. */
const jitter = (base) => base + Math.floor(Math.random() * base * 1.5);

/** Rozpozná blokační stránku Googlu (captcha / „neobvyklý provoz"). */
async function isBlocked(page) {
  if (/\/sorry\/|consent\.google\.com\/.*sorry/.test(page.url())) return true;
  const body = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  return /unusual traffic|neobvyklý provoz|nejsem robot|not a robot|captcha/i.test(body);
}

/** Bez diakritiky, malými písmeny, jen slova – pro porovnání názvů. */
const normalize = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Vzdálenost dvou GPS bodů v metrech (haversine). */
function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Shoda podle vzdálenosti (hlavní signál) a značky (0–1). */
function confidenceFrom(distance, brandMatch) {
  let score = distance <= 50 ? 1.0
    : distance <= 100 ? 0.85
    : distance <= 150 ? 0.7
    : distance <= 250 ? 0.5
    : 0.3;
  if (!brandMatch) score *= 0.5; // jiná/neznámá značka poblíž – míň jistoty
  return Number(score.toFixed(2));
}

/** Souřadnice místa z URL (search skončí občas rovnou na místě, bez seznamu odkazů). */
function coordsFromUrl(url) {
  const poi = url.match(/!3d(-?[0-9.]+)!4d(-?[0-9.]+)/);
  if (poi) return { lat: Number(poi[1]), lon: Number(poi[2]) };
  const at = url.match(/@(-?[0-9.]+),(-?[0-9.]+)/);
  if (at) return { lat: Number(at[1]), lon: Number(at[2]) };
  return null;
}

/** „Michala Bímová" → „M. B."; kvůli GDPR neukládáme plná jména. */
function anonymizeAuthor(name) {
  const parts = String(name || '')
    .trim()
    .split(/[\s_]+/)
    .filter(Boolean);
  if (!parts.length) return null;
  return parts.map((p) => `${p[0].toUpperCase()}.`).join(' ');
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
    .prepare(
      `SELECT id, brand_name, name, city, lat, lon
         FROM station
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY id`
    )
    .all(...params);
  db.close();
  return args.limit ? rows.slice(0, args.limit) : rows;
}

// --- Playwright ------------------------------------------------------------

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    console.error(
      'CHYBA: chybí Playwright. Nainstaluj lokálně (mimo produkci):\n' +
        '  npm install playwright\n' +
        '  npx playwright install chromium'
    );
    process.exit(1);
  }
}

/** Odklikne Google souhlas s cookies (různé jazyky/varianty), když se objeví. */
async function dismissConsent(page) {
  const url = page.url();
  if (!/consent\.google\.|\/consent/.test(url)) return;
  const labels = ['Odmítnout vše', 'Reject all', 'Odmítnout všechny', 'Nesouhlasím', 'Zamítnout vše'];
  for (const label of labels) {
    const button = page.locator(`button:has-text("${label}"), [aria-label="${label}"]`).first();
    if (await button.count().catch(() => 0)) {
      await button.click().catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return;
    }
  }
}

/**
 * Vybere ze seznamu výsledků to místo, které je stanici geograficky nejblíž
 * (souřadnice jsou přímo v href jako !3d<lat>!4d<lon>). Vrací i vzdálenost a
 * jestli sedí značka – to je pro nás spolehlivější než porovnávání názvů.
 */
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
    candidates.push({ label: r.label, href: r.href, distance, brandMatch, isPoi: NON_STATION.test(r.label) });
  }

  const within = candidates.filter((c) => c.distance <= MAX_RADIUS_M);
  const pool = within.length ? within : candidates;
  // Nejdřív shody značky, které nejsou myčka/shop; pak podle vzdálenosti.
  pool.sort((a, b) => {
    if (a.brandMatch !== b.brandMatch) return a.brandMatch ? -1 : 1;
    if (a.isPoi !== b.isPoi) return a.isPoi ? 1 : -1;
    return a.distance - b.distance;
  });
  return pool[0] || null;
}

/**
 * Přepne na záložku „Recenze" (je to [role=tab], jehož aria-label je „Recenze: <název>").
 * Bez toho panel ukazuje jen ~3 recenze z přehledu místa. Pak zkusí řadit od nejnovějších.
 */
async function openReviews(page) {
  const tab = page.getByRole('tab', { name: /Recenze/i }).first();
  if (await tab.count().catch(() => 0)) {
    await tab.click().catch(() => {});
    await page.waitForSelector('div[data-review-id]', { timeout: 8000 }).catch(() => {});
    await sleep(1200);
  }
  // V režimu --top chceme Googlem řazenou relevanci (výchozí), tak nepřepínáme.
  if (TOP) return;
  // Řazení „Nejnovější" – nemusí existovat, tak neblokujeme.
  const sortButton = page.locator('button[aria-label*="Seřadit"], button[aria-label*="Řadit"], button[aria-label*="Sort"]').first();
  if (await sortButton.count().catch(() => 0)) {
    await sortButton.click().catch(() => {});
    await sleep(700);
    const newest = page.locator('[role="menuitemradio"]:has-text("Nejnovější"), [role="menuitem"]:has-text("Nejnovější")').first();
    if (await newest.count().catch(() => 0)) {
      await newest.click().catch(() => {});
      await sleep(1500);
    }
  }
}

/** Roluje skutečným scrollovacím kontejnerem recenzí, dokud nenačte dost nebo se počet nezastaví. */
async function scrollReviews(page, target) {
  let stable = 0;
  let last = 0;
  for (let i = 0; i < 60 && stable < 5; i += 1) {
    const count = await page.locator('div[data-review-id]').count().catch(() => 0);
    if (count >= target) break;
    if (count === last) stable += 1;
    else stable = 0;
    last = count;

    await page.evaluate(() => {
      // Najdi scrollovatelného předka recenze (overflowY auto/scroll a reálná výška).
      const node = document.querySelector('div[data-review-id]');
      let el = node;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (el.scrollHeight > el.clientHeight + 100 && /(auto|scroll)/.test(s.overflowY)) break;
        el = el.parentElement;
      }
      if (el) el.scrollBy(0, el.clientHeight * 2);
    }).catch(() => {});
    await sleep(900);
  }
}

/** Rozbalí zkrácené texty („Více") a vytáhne recenze přímo z DOMu. */
async function extractReviews(page, limit) {
  await page.locator('button[aria-label="Více"], button:has-text("Více")').all().then(async (buttons) => {
    for (const b of buttons.slice(0, limit)) await b.click().catch(() => {});
  }).catch(() => {});
  await sleep(400);

  const raw = await page.evaluate((max) => {
    const parseRating = (node) => {
      const star = node.querySelector('span[role="img"][aria-label], [aria-label*="hvěz"], [aria-label*="star"]');
      const label = star?.getAttribute('aria-label') || '';
      const m = label.match(/([1-5])/); // „5 hvězdiček", „1 hvězdička", „5 stars"…
      if (m) return Number(m[1]);
      const filled = node.querySelectorAll('.hCCjke.google-symbols.NhBTye.elGi1d').length;
      return filled || null;
    };
    const text = (el) => (el ? el.textContent.trim() : '');

    // Dedup: Google občas vykreslí stejnou recenzi dvakrát (stejné data-review-id).
    const seen = new Set();
    const out = [];
    for (const node of document.querySelectorAll('div[data-review-id]')) {
      const reviewId = node.getAttribute('data-review-id');
      if (!reviewId || seen.has(reviewId)) continue;
      seen.add(reviewId);
      out.push({
        reviewId,
        author: text(node.querySelector('.d4r55, [class*="d4r55"]')) || null,
        rating: parseRating(node),
        text: text(node.querySelector('.wiI7pd, [class*="wiI7pd"]')) || null,
        relativeTime: text(node.querySelector('.rsqaWe, [class*="rsqaWe"]')) || null,
      });
      if (out.length >= max) break;
    }
    return out;
  }, limit);

  return raw.filter((r) => r.reviewId && (r.rating || r.text));
}

async function scrapeStation(page, station) {
  const query = [station.brand_name, station.name, station.city].filter(Boolean).join(' ');
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${station.lat},${station.lon},16z?hl=cs&gl=CZ`;

  await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await dismissConsent(page);
  await sleep(1500);
  if (await isBlocked(page)) throw new Error('BLOCKED');
  // Počkej, než se výsledky (odkazy na místa) nebo rovnou místo načtou.
  await page
    .waitForFunction(
      () => location.href.includes('/maps/place/') || document.querySelector('a[href*="/maps/place/"]'),
      { timeout: 10000 }
    )
    .catch(() => {});

  // Když search skončí rovnou na jednom místě, seznam odkazů nebude – dopočítáme z URL.
  const best = await pickBestPlace(page, station);
  if (best) {
    await page.goto(best.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);
  }
  const placeUrl = page.url();
  const onPlace = placeUrl.includes('/maps/place/');

  let placeTitle;
  let distance;
  let confidence;
  if (best) {
    placeTitle = best.label;
    distance = best.distance;
    confidence = confidenceFrom(best.distance, best.brandMatch);
  } else if (onPlace) {
    // Přímé přistání na místě: název z H1, vzdálenost ze souřadnic v URL místa.
    placeTitle = await page.locator('h1').first().textContent().catch(() => null);
    const coords = coordsFromUrl(placeUrl);
    distance = coords ? distanceM(station.lat, station.lon, coords.lat, coords.lon) : null;
    const brandTokens = normalize(station.brand_name).split(' ').filter((w) => w.length > 1);
    const brandMatch = brandTokens.length ? brandTokens.some((t) => normalize(placeTitle).includes(t)) : true;
    confidence = distance != null ? confidenceFrom(distance, brandMatch) : 0;
  } else {
    // Nepodařilo se otevřít žádné místo (jen výsledková stránka) – žádná falešná shoda.
    placeTitle = null;
    distance = null;
    confidence = 0;
  }

  await openReviews(page);
  // V top režimu nescrollujeme – bereme Googlem relevanci seřazené první recenze.
  if (!TOP) await scrollReviews(page, MAX_REVIEWS);
  const rawReviews = await extractReviews(page, TOP ? Math.max(MAX_REVIEWS, 12) : MAX_REVIEWS);

  // Bez jmen (GDPR): autor se zahazuje. V top režimu jen N nejrelevantnějších S TEXTEM.
  let picked = rawReviews;
  if (TOP) picked = rawReviews.filter((r) => r.text && r.text.trim()).slice(0, TOP);
  const reviews = picked.map((r) => ({ reviewId: r.reviewId, rating: r.rating, text: r.text, relativeTime: r.relativeTime, author: null }));

  return {
    stationId: station.id,
    station: { brand: station.brand_name, name: station.name, city: station.city },
    query,
    mapsUrl,
    placeUrl,
    placeTitle: placeTitle ? placeTitle.trim() : null,
    distanceM: distance,
    confidence,
    scrapedAt: new Date().toISOString(),
    reviewCount: reviews.length,
    reviews,
  };
}

// --- běh -------------------------------------------------------------------

async function main() {
  const stations = loadStations();
  if (!stations.length) {
    console.error('Žádné stanice neodpovídají filtru.');
    process.exit(1);
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: !args.headful });
  const context = await browser.newContext({
    locale: 'cs-CZ',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });
  const page = await context.newPage();

  let ok = 0;
  let empty = 0;
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
        if (result.reviewCount) ok += 1;
        else empty += 1;
        console.log(`${result.reviewCount} recenzí, ${result.distanceM ?? '?'} m, match ${result.confidence} → „${result.placeTitle || '?'}"`);
        done = true;
      } catch (err) {
        if (err.message === 'BLOCKED') {
          blockStrikes += 1;
          // Exponenciální backoff: 10, 20, 40 min… Google nás detekoval, dáme mu klid.
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
    // Každých ~50 stanic delší „lidská" pauza – další pojistka proti detekci.
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
    ['S recenzemi', ok],
    ['Bez recenzí', empty],
    ['Chyby', failed],
    ['Staging', STAGING_DIR],
  ]);
  console.log('\nDalší krok: node scripts/import-reviews.js  (napřed jen výpis, pak --commit)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
