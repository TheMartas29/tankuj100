#!/usr/bin/env node
const { parseArgs } = require('./lib/cli');
const { dbPath, openDatabase, backupDatabase } = require('./lib/database');
const { blank, printSummary, heading } = require('./lib/log');
const { isEmpty } = require('./lib/values');
const {
  reverseWithRetry,
  addressOf,
  cityOf,
  zipOf,
  sleep,
  MIN_INTERVAL_MS,
  MAX_ATTEMPTS,
} = require('./lib/nominatim');

const USAGE = `
Doplní chybějící adresy, města a PSČ reverzním geokódováním přes Nominatim.
Co stanice už má z OSM, se nikdy nepřepisuje. Běh je přerušitelný – každá stanice se
ukládá zvlášť, takže Ctrl+C ani výpadek sítě o nic nepřipraví a další spuštění naváže.

  node scripts/geocode-stations.js --dry-run --limit 5   jen vypíše, co by udělal
  node scripts/geocode-stations.js --limit 20            ostře, jen prvních 20
  node scripts/geocode-stations.js                       ostře, všechny zbývající
`;

const { dryRun, limit } = parseArgs({ usage: USAGE, flags: ['dry-run'], numbers: ['limit'] });

const GEOCODE_TAG = { key: 'geocoded', value: 'nominatim' };

const FILL_STATS_SQL = `
  SELECT COUNT(*) AS total,
         SUM(address IS NOT NULL AND TRIM(address) <> '') AS s_address,
         SUM(city    IS NOT NULL AND TRIM(city)    <> '') AS s_city,
         SUM(zip     IS NOT NULL AND TRIM(zip)     <> '') AS s_zip
    FROM station`;

// Řazení podle id drží pořadí mezi běhy, takže po přerušení navazujeme tam, kde jsme byli.
const PENDING_SQL = `
  SELECT id, lat, lon, brand_name, name, address, city, zip
    FROM station
   WHERE (address IS NULL OR TRIM(address) = '')
     AND lat IS NOT NULL AND lon IS NOT NULL
   ORDER BY id`;

function createWriter(db) {
  if (dryRun) return () => {};

  const updateStation = db.prepare('UPDATE station SET address = ?, city = ?, zip = ? WHERE id = ?');
  const markGeocoded = db.prepare(
    'INSERT OR REPLACE INTO station_tag (station_id, tag_key, tag_value) VALUES (?, ?, ?)'
  );

  // Zápis jedné stanice = jedna transakce. Commit po každé stanici je pomalejší, ale při
  // jednom dotazu za sekundu na tom nezáleží a po Ctrl+C je v DB vždy jen dokončená práce.
  return db.transaction((id, address, city, zip) => {
    updateStation.run(address, city, zip, id);
    markGeocoded.run(id, GEOCODE_TAG.key, GEOCODE_TAG.value);
  });
}

function stationLabel(station, index, total) {
  const position = String(index).padStart(String(total).length);
  const branch = station.name && station.name !== station.brand_name ? ` (${station.name})` : '';
  return `[${position}/${total}] #${station.id} ${station.brand_name || '?'}${branch}`;
}

function missingFields(station, address) {
  return {
    address: isEmpty(station.address) ? addressOf(address) : null,
    city: isEmpty(station.city) ? cityOf(address) : null,
    zip: isEmpty(station.zip) ? zipOf(address) : null,
  };
}

const describeFilled = (filled) =>
  [filled.address && `adresa: ${filled.address}`, filled.city && `město: ${filled.city}`, filled.zip && `PSČ: ${filled.zip}`]
    .filter(Boolean)
    .join(' | ');

function watchForInterrupt(state) {
  const onSignal = () => {
    if (state.interrupted) process.exit(130);
    state.interrupted = true;
    console.log('\nPřerušeno – dokončuji rozdělanou stanici a končím…');
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  return () => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  };
}

async function processQueue(queue, save) {
  const stats = { doplneno: 0, prazdne: 0, selhalo: 0 };
  const state = { interrupted: false };
  const stopWatching = watchForInterrupt(state);

  let lastRequestAt = 0;
  let index = 0;

  for (const station of queue) {
    if (state.interrupted) break;
    index += 1;
    const label = stationLabel(station, index, queue.length);

    const waitFor = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (waitFor > 0) await sleep(waitFor);
    lastRequestAt = Date.now();

    let address;
    try {
      address = await reverseWithRetry(station.lat, station.lon, (err, attempt, wait) => {
        console.log(`${label} … ${err.message}, pokus ${attempt}/${MAX_ATTEMPTS}, čekám ${wait / 1000} s`);
        // Po couvnutí se hodiny limitu posunou – další dotaz jde až po čekání.
        lastRequestAt = Date.now() + wait;
      });
    } catch (err) {
      stats.selhalo += 1;
      console.log(`${label} — CHYBA: ${err.message} (přeskakuji)`);
      continue;
    }

    if (!address) {
      stats.prazdne += 1;
      console.log(`${label} — bez odpovědi (${station.lat}, ${station.lon}), nic neukládám`);
      continue;
    }

    const filled = missingFields(station, address);
    if (!filled.address && !filled.city && !filled.zip) {
      stats.prazdne += 1;
      console.log(`${label} — v odpovědi není ulice ani obec, nic neukládám`);
      continue;
    }

    if (dryRun) {
      stats.doplneno += 1;
      console.log(`${label} — doplnil bych  ${describeFilled(filled)}`);
      continue;
    }

    try {
      save(station.id, filled.address ?? station.address, filled.city ?? station.city, filled.zip ?? station.zip);
      stats.doplneno += 1;
      console.log(`${label} — uloženo  ${describeFilled(filled)}`);
    } catch (err) {
      // Transakce se sama vrátila zpět, databáze zůstala celá – jen jdeme dál.
      stats.selhalo += 1;
      console.log(`${label} — CHYBA při zápisu: ${err.message} (přeskakuji)`);
    }
  }

  stopWatching();
  return { stats, processed: index, interrupted: state.interrupted };
}

const duration = (seconds) => `${Math.floor(seconds / 60)} min ${seconds % 60} s`;

async function main() {
  const db = openDatabase({ readonly: dryRun });
  const fillStats = () => db.prepare(FILL_STATS_SQL).get();

  const before = fillStats();
  const pending = db.prepare(PENDING_SQL).all();
  const queue = limit ? pending.slice(0, limit) : pending;

  printSummary([
    null,
    ['Databáze', dbPath],
    ['Režim', dryRun ? 'zkušební (--dry-run, nic se nezapíše)' : 'ostrý zápis'],
    ['Stanic celkem', before.total],
    ['  s adresou', before.s_address],
    ['  s městem', before.s_city],
    ['  s PSČ', before.s_zip],
    ['Bez adresy', pending.length],
    ['Ke zpracování teď', `${queue.length}${limit ? `  (--limit ${limit})` : ''}`],
    ...(queue.length
      ? [['Odhad trvání', `~${duration(Math.ceil((queue.length * MIN_INTERVAL_MS) / 1000))}  (1 dotaz/s)`]]
      : []),
    null,
  ]);

  if (!queue.length) {
    console.log('Není co doplňovat.');
    db.close();
    return;
  }

  if (!dryRun) {
    console.log(`Záloha: ${backupDatabase('geocode')}`);
    blank();
  }

  const startedAt = Date.now();
  const { stats, processed, interrupted } = await processQueue(queue, createWriter(db));
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  const after = fillStats();

  heading('souhrn');
  printSummary([
    ['Zpracováno stanic', `${processed} z ${queue.length}${interrupted ? '  (přerušeno)' : ''}`],
    ['  doplněno', stats.doplneno],
    ['  bez použitelné odpovědi', stats.prazdne],
    ['  selhalo', stats.selhalo],
    ['Trvalo', duration(elapsed)],
    null,
    ['Stanic s adresou', `${before.s_address} → ${after.s_address}`],
    ['Stanic s městem', `${before.s_city} → ${after.s_city}`],
    ['Stanic s PSČ', `${before.s_zip} → ${after.s_zip}`],
    ['Zbývá bez adresy', pending.length - stats.doplneno],
  ]);

  if (dryRun) console.log('\n--dry-run: v databázi se nic nezměnilo.');
  db.close();
}

main().catch((err) => {
  console.error(`\nCHYBA: ${err.stack || err.message}`);
  process.exit(1);
});
