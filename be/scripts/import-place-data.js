#!/usr/bin/env node
/*
 * Z place-data-staging vyrobí SQL pro doplnění dat o benzínce do DB.
 *
 * Pravidla (dohodnuto s uživatelem):
 *  - Data z Google mají přednost před OSM u SKALÁRŮ (telefon, adresa, otevírací
 *    doba) – přepíšou je, ale JEN když je Google má (chybí-li, necháme původní).
 *  - Vybavení (myčka, WC, obchod, kompresor, bezbariérovost) se jen PŘIDÁVÁ do
 *    station_tag – absence na Googlu neznamená, že tam služba není, takže nic
 *    nemažeme.
 *  - Typy paliv se z Googlu NEBEROU (zůstávají z OSM) – station_fuel se netýká.
 *  - Web (Google ho má, DB sloupec ne) ukládáme do station_tag key='website'.
 *  - Kategorie a Google hodnocení ukládáme jako gmaps:* tagy pro přehled.
 *
 * Nic nemaže z původních dat kromě přepisu skalárů. Výstup je idempotentní SQL,
 * které se pak aplikuje na (test) DB přes sqlite3.
 *
 *   node scripts/import-place-data.js               vyrobí place-data-import.sql + souhrn
 *   node scripts/import-place-data.js --out /cesta.sql
 */
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('./lib/cli');

const args = parseArgs({ usage: 'node scripts/import-place-data.js [--out soubor.sql]', texts: ['out'] });
const STAGING = path.join(__dirname, '..', 'data', 'place-data-staging');
const OUT = args.out || path.join(__dirname, '..', 'data', 'place-data-import.sql');

const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

// Google (české) popisky vybavení → klíče station_tag, které app zná. Jen ADITIVNÍ.
const AMENITY_MAP = [
  [/automyčk|myčk/i, 'car_wash'],
  [/toalet|\bwc\b/i, 'toilets'],
  [/bezbariér|vozíčk|invalidn/i, 'wheelchair'],
  [/obchod|potravin|market|shop/i, 'shop'],
  [/kompresor|vzduch/i, 'compressed_air'],
];

/** Google „5–23" → „05:00-23:00"; „Otevřeno 24 hodin" → 24h; „Zavřeno" → off. */
function dayHours(text) {
  if (!text) return null;
  const t = text.trim();
  if (/24 hodin|nonstop/i.test(t)) return '24';
  if (/zavřeno|closed/i.test(t)) return 'off';
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  const pad = (h, mm) => `${String(h).padStart(2, '0')}:${mm || '00'}`;
  return `${pad(m[1], m[2])}-${pad(m[3], m[4])}`;
}

const DAY_CODE = { pondělí: 'Mo', úterý: 'Tu', středa: 'We', čtvrtek: 'Th', pátek: 'Fr', sobota: 'Sa', neděle: 'Su' };
const DAY_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Z Google hodin (pole {day,hours}) udělá worktime string ve stylu OSM / „nonstop". */
function worktimeFrom(hours) {
  if (!Array.isArray(hours) || !hours.length) return null;
  const byCode = {};
  for (const h of hours) {
    const code = DAY_CODE[(h.day || '').toLowerCase()];
    const val = dayHours(h.hours);
    if (code && val) byCode[code] = val;
  }
  const codes = DAY_ORDER.filter((c) => byCode[c]);
  if (codes.length < 7) {
    // Neúplné – vyjmenuj po dnech, co máme.
    return codes.map((c) => (byCode[c] === '24' ? `${c} 00:00-24:00` : byCode[c] === 'off' ? `${c} off` : `${c} ${byCode[c]}`)).join('; ') || null;
  }
  const allSame = codes.every((c) => byCode[c] === byCode['Mo']);
  if (allSame) {
    if (byCode['Mo'] === '24') return 'nonstop';
    if (byCode['Mo'] === 'off') return null;
    return `Mo-Su ${byCode['Mo']}`;
  }
  return DAY_ORDER.map((c) => (byCode[c] === '24' ? `${c} 00:00-24:00` : byCode[c] === 'off' ? `${c} off` : `${c} ${byCode[c]}`)).join('; ');
}

function tagUpsert(stationId, key, value) {
  return (
    `INSERT INTO station_tag (station_id, tag_key, tag_value) VALUES (${stationId}, ${q(key)}, ${q(value)}) ` +
    `ON CONFLICT(station_id, tag_key) DO UPDATE SET tag_value=excluded.tag_value;`
  );
}

function main() {
  if (!fs.existsSync(STAGING)) { console.error('Staging neexistuje – nejdřív spusť scrape-place-data.js.'); process.exit(1); }
  const files = fs.readdirSync(STAGING).filter((f) => f.endsWith('.json'));

  const lines = ['PRAGMA busy_timeout=20000;', 'BEGIN;'];
  const stats = { resolved: 0, phone: 0, address: 0, worktime: 0, website: 0, amenities: 0, rating: 0, unresolved: 0 };

  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(STAGING, f), 'utf8'));
    if (!d.resolved || !d.data) { stats.unresolved += 1; continue; }
    stats.resolved += 1;
    const id = d.stationId;
    const data = d.data;

    // Skaláry: Google > OSM (jen když Google hodnotu má).
    const sets = [];
    if (data.phone) { sets.push(`phone = ${q(data.phone.replace(/\s+/g, ' ').trim())}`); stats.phone += 1; }
    if (data.address) { sets.push(`address = ${q(data.address)}`); stats.address += 1; }
    const wt = worktimeFrom(data.hours);
    if (wt) { sets.push(`worktime = ${q(wt)}`); stats.worktime += 1; }
    if (sets.length) lines.push(`UPDATE station SET ${sets.join(', ')} WHERE id = ${id};`);

    // Web → station_tag.
    if (data.website) { lines.push(tagUpsert(id, 'website', data.website)); stats.website += 1; }

    // Vybavení – jen přidat, co Google potvrdí.
    const seen = new Set();
    for (const attr of data.about || []) {
      for (const [re, key] of AMENITY_MAP) {
        if (re.test(attr) && !seen.has(key)) { seen.add(key); lines.push(tagUpsert(id, key, 'yes')); }
      }
    }
    if (seen.size) stats.amenities += 1;

    // Přehledové gmaps:* tagy.
    if (data.category) lines.push(tagUpsert(id, 'gmaps:category', data.category));
    if (data.ratingAvg != null) { lines.push(tagUpsert(id, 'gmaps:rating', String(data.ratingAvg))); stats.rating += 1; }
    if (data.ratingCount != null) lines.push(tagUpsert(id, 'gmaps:rating_count', String(data.ratingCount)));
  }

  lines.push('COMMIT;');
  fs.writeFileSync(OUT, lines.join('\n') + '\n');

  console.log('Vygenerováno SQL:', OUT);
  console.log('Staging resolved/unresolved:', stats.resolved, '/', stats.unresolved);
  console.log('Přepíše telefon:', stats.phone, '| adresu:', stats.address, '| otevírací dobu:', stats.worktime);
  console.log('Doplní web:', stats.website, '| vybavení u stanic:', stats.amenities, '| Google rating:', stats.rating);
}

main();
