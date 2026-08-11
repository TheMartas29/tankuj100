#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const { isInCzechia } = require('../src/geo');
const { parseArgs } = require('./lib/cli');
const { dbPath, requireDatabaseFile, requireFile, backupDatabase } = require('./lib/database');
const { blank, printSummary, printCounts } = require('./lib/log');
const { isYes, featureToStation } = require('./lib/osm-station');

const USAGE = `
Přestavba databáze benzínek z OpenStreetMap (data/osm-premium-cz.geojson).

POZOR: není to přírůstkový import, ale kompletní přestavba. Stanice se smažou
a s nimi i uživatelský obsah (hodnocení, hlášení, hlasy o palivu), který na nich
visel – jinak by z něj byli sirotci. Proto skript bez --yes nic nemění.

  node scripts/import-osm.js                  jen vypíše, co by udělal
  node scripts/import-osm.js --verbose        vypíše všechny stanice
  node scripts/import-osm.js --yes            provede přestavbu (předtím zálohuje)
`;

const { yes: confirmed, verbose } = parseArgs({ usage: USAGE, flags: ['yes', 'verbose'] });

const GEOJSON_PATH = process.env.OSM_GEOJSON
  ? path.resolve(process.env.OSM_GEOJSON)
  : path.join(__dirname, '..', '..', 'data', 'osm-premium-cz.geojson');

const ATTRIBUTION = 'OpenStreetMap (ODbL)';
const PREMIUM_TAGS = ['fuel:octane_98', 'fuel:octane_100'];
const SAMPLE_SIZE = 15;
const TOP_BRANDS = 12;

const STATION_COLUMNS = `id, lat, lon, brand_name, brand_id, name, city, address, zip,
                         phone, worktime, services, payments, note, station_id,
                         foursquare_id, wikimapia_id, status, error, osm_id, data_source`;
const STATION_VALUES = `@id, @lat, @lon, @brand_name, NULL, @name, @city, @address, @zip,
                        @phone, @worktime, @services, @payments, NULL, NULL,
                        NULL, NULL, 'OK', NULL, @osm_id, @data_source`;

const TABLES_TO_CLEAR = ['fuel_vote', 'report', 'review', 'station_tag', 'station_fuel', 'station'];

function loadFeatures() {
  const geojson = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf8'));
  return geojson.features || [];
}

function hasPremiumFuel(tags) {
  return PREMIUM_TAGS.some((tag) => isYes(tags[tag]));
}

function hasUsableCoordinates(geometry) {
  if (geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates)) return false;
  const [lon, lat] = geometry.coordinates;
  return Number.isFinite(lat) && Number.isFinite(lon);
}

function collectStations(features) {
  const skipped = { bezPremia: 0, spatneSouradnice: 0, bezOsmId: 0 };
  const rows = [];
  const seenOsmIds = new Set();
  let mimoCR = 0;

  for (const feature of features) {
    if (!hasPremiumFuel(feature.properties || {})) {
      skipped.bezPremia += 1;
      continue;
    }
    if (!hasUsableCoordinates(feature.geometry)) {
      skipped.spatneSouradnice += 1;
      continue;
    }

    const row = featureToStation(feature);
    if (!row.osm_id || seenOsmIds.has(row.osm_id)) {
      skipped.bezOsmId += 1;
      continue;
    }
    seenOsmIds.add(row.osm_id);

    // Hranice ČR v geo.js je zjednodušená (~200 m), tak jen počítáme – nechceme přijít
    // o legitimní pumpu kousek od hranice.
    if (!isInCzechia(row.lat, row.lon)) mimoCR += 1;
    rows.push(row);
  }

  // Determinismus mezi běhy – pořadí rozhoduje o přidělených `id`.
  rows.sort((a, b) => a.osm_id.localeCompare(b.osm_id));
  return { rows, skipped, mimoCR };
}

// Co už v DB pod daným OSM bodem bylo, si podrží své `id` – jinak by uživatelský obsah
// po přestavbě ukazoval na jinou stanici. Zbytek dostane nejnižší volné.
function assignIds(db, rows) {
  const previous = new Map(
    db
      .prepare('SELECT id, osm_id FROM station WHERE osm_id IS NOT NULL')
      .all()
      .map((row) => [row.osm_id, row.id])
  );
  const taken = new Set(previous.values());
  let nextFree = 1;
  let reused = 0;

  for (const row of rows) {
    const known = previous.get(row.osm_id);
    if (known != null) {
      row.id = known;
      reused += 1;
      continue;
    }
    while (taken.has(nextFree)) nextFree += 1;
    row.id = nextFree;
    taken.add(nextFree);
  }
  return reused;
}

const countBy = (rows, keyOf) => {
  const counts = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (key != null) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
};

function printPlan({ db, rows, skipped, mimoCR, reused, features }) {
  const countRows = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  const withFuel = (key) => rows.filter((r) => r.fuels.includes(key)).length;
  const filled = (field) => rows.filter((r) => r[field]).length;

  printSummary([
    null,
    ['Zdroj', GEOJSON_PATH],
    ['Databáze', dbPath],
    null,
    ['Bodů v GeoJSONu', features.length],
    ['  přeskočeno bez 98/100', skipped.bezPremia],
    ['  přeskočeno bez souřadnic', skipped.spatneSouradnice],
    ['  přeskočeno bez/duplicitní OSM id', skipped.bezOsmId],
    ['  mimo zjednodušenou hranici ČR (jen upozornění)', mimoCR],
    null,
    ['Stanic v DB teď', `${countRows('station')}  (všechny se smažou)`],
    [
      'Uživatelský obsah ke smazání',
      `hodnocení ${countRows('review')}, hlášení ${countRows('report')}, ` +
        `hlasů o palivu ${countRows('fuel_vote')}`,
    ],
    ['Vloží se stanic', `${rows.length}  (z toho ${reused} si podrží dosavadní id)`],
    null,
    ['  se značkou', filled('brand_name')],
    ['  s názvem', filled('name')],
    ['  s adresou', filled('address')],
    ['  s městem', filled('city')],
    ['  s PSČ', filled('zip')],
    ['  s telefonem', filled('phone')],
    ['  s otevírací dobou', filled('worktime')],
    null,
    ['  s 98 oktany', withFuel('octane_98')],
    ['  se 100 oktany', withFuel('octane_100')],
    ['  s obojím', rows.filter((r) => r.fuels.includes('octane_98') && r.fuels.includes('octane_100')).length],
    ['Řádků do station_fuel', rows.reduce((n, r) => n + r.fuels.length, 0)],
    ['Řádků do station_tag', rows.reduce((n, r) => n + r.tags.length, 0)],
    null,
  ]);

  const sample = verbose ? rows : rows.slice(0, SAMPLE_SIZE);
  console.log(`Ukázka vkládaných stanic${verbose ? '' : ` (prvních ${SAMPLE_SIZE})`}:`);
  for (const row of sample) {
    const octane = row.fuels.filter((f) => f.startsWith('octane_')).join('+');
    const place = [row.address, row.zip, row.city].filter(Boolean).join(' ') || '–';
    console.log(`  #${row.id} ${row.osm_id} | ${row.brand_name || '?'} | ${row.name || '–'} | ${place} | ${octane || '–'}`);
  }
  blank();

  const renamed = countBy(
    rows.filter((r) => r.brand_raw && r.brand_name && r.brand_raw !== r.brand_name),
    (r) => `${r.brand_raw} → ${r.brand_name}`
  );
  printCounts(
    `Normalizace značek (${renamed.length} různých převodů):`,
    renamed.map(([pair, count]) => [pair, `${count}×`])
  );
  blank();

  const brands = countBy(rows, (r) => r.brand_name || '?');
  printCounts(`Značek po normalizaci: ${brands.length}. Nejčastější:`, brands.slice(0, TOP_BRANDS));
  blank();
}

function rebuild(db, rows) {
  const insertStation = db.prepare(
    `INSERT INTO station (${STATION_COLUMNS}) VALUES (${STATION_VALUES})`
  );
  const insertFuel = db.prepare('INSERT INTO station_fuel (station_id, fuel_key) VALUES (?, ?)');
  const insertTag = db.prepare('INSERT INTO station_tag (station_id, tag_key, tag_value) VALUES (?, ?, ?)');

  db.transaction(() => {
    for (const table of TABLES_TO_CLEAR) db.exec(`DELETE FROM ${table}`);
    for (const row of rows) {
      insertStation.run({ ...row, data_source: ATTRIBUTION });
      for (const fuel of row.fuels) insertFuel.run(row.id, fuel);
      for (const tag of row.tags) insertTag.run(row.id, tag.tag_key, tag.tag_value);
    }
  })();

  db.exec('VACUUM');
}

function main() {
  requireDatabaseFile();
  requireFile(GEOJSON_PATH, 'zdrojová data');

  const features = loadFeatures();
  const { rows, skipped, mimoCR } = collectStations(features);

  // Až tady, ať se na databázi nesáhne dřív, než projdou kontroly výš. Připojení
  // přes src/db zároveň pustí migrace, takže schéma sedí i na čerstvém seedu.
  const { db } = require('../src/db');

  const reused = assignIds(db, rows);
  printPlan({ db, rows, skipped, mimoCR, reused, features });

  if (!confirmed) {
    console.log('Zkušební běh – v databázi se nic nezměnilo.');
    console.log('Přestavbu spustíš přidáním přepínače --yes.');
    return;
  }
  if (!rows.length) {
    console.error('CHYBA: ze zdroje nevzešla ani jedna stanice – nepřestavuji DB naprázdno.');
    process.exit(1);
  }

  console.log(`Záloha: ${backupDatabase('osm-import')}`);
  rebuild(db, rows);

  const total = db.prepare('SELECT COUNT(*) AS c FROM station').get().c;
  const premium = db
    .prepare(
      "SELECT COUNT(DISTINCT station_id) AS c FROM station_fuel WHERE fuel_key IN ('octane_98','octane_100')"
    )
    .get().c;
  console.log(`\nHotovo ✔  V databázi je ${total} stanic, z toho ${premium} s prémiovým benzínem.`);
}

main();
