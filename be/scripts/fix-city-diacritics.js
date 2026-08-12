#!/usr/bin/env node
const { parseArgs } = require('./lib/cli');
const { openDatabase, backupDatabase } = require('./lib/database');
const { blank, printSummary, heading } = require('./lib/log');
const { searchSettlement, sleep, MIN_INTERVAL_MS } = require('./lib/nominatim');

const USAGE = `
Doplní diakritiku do názvů obcí. Zdroje značek (hlavně MOL) posílají obce bez háčků
a čárek – „Ceska Kubice“, „Litomysl“ – a v aplikaci to vypadá jako rozbitá data.

Nejdřív se správný zápis hledá mezi obcemi, které už v databázi jsou (zdarma, hned).
Zbylé názvy dohledá Nominatim, jeden dotaz na název (ne na stanici). Výsledek se
přijme, jen když se od původního liší POUZE diakritikou – nikdy tím nemůže dojít
k záměně obce.

  node scripts/fix-city-diacritics.js --dry-run
  node scripts/fix-city-diacritics.js --limit 20
  node scripts/fix-city-diacritics.js
`;

const { dryRun, limit } = parseArgs({ usage: USAGE, flags: ['dry-run'], numbers: ['limit'] });

const fold = (value) => value.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
const lacksDiacritics = (value) => fold(value) === value.toLowerCase();

function loadStations(db) {
  return db
    .prepare(
      `SELECT id, city FROM station
        WHERE city IS NOT NULL AND TRIM(city) <> ''
        ORDER BY id`,
    )
    .all();
}

/** Obce, které už někde v databázi máme zapsané s diakritikou. */
function knownSpellings(stations) {
  const byFolded = new Map();
  for (const { city } of stations) {
    if (lacksDiacritics(city)) continue;
    const key = fold(city);
    if (!byFolded.has(key)) byFolded.set(key, city);
  }
  return byFolded;
}

async function lookupMissing(names, spellings, counts) {
  let previousRequest = 0;

  for (const name of names) {
    const wait = MIN_INTERVAL_MS - (Date.now() - previousRequest);
    if (wait > 0) await sleep(wait);
    previousRequest = Date.now();

    let found;
    try {
      found = await searchSettlement(name);
    } catch (err) {
      console.log(`  ${name}: ${err.message}`);
      counts.failed += 1;
      continue;
    }

    // Jiná obec, ne jen jiný zápis – necháváme být.
    if (!found || fold(found) !== fold(name) || found === name) {
      counts.unchanged += 1;
      continue;
    }

    console.log(`  ${name} → ${found}`);
    spellings.set(fold(name), found);
    counts.lookedUp += 1;
  }
}

function collectChanges(stations, spellings) {
  const changes = [];
  for (const station of stations) {
    if (!lacksDiacritics(station.city)) continue;
    const known = spellings.get(fold(station.city));
    if (known && known !== station.city) changes.push({ station, city: known });
  }
  return changes;
}

async function main() {
  const db = openDatabase({ readonly: dryRun });
  const stations = loadStations(db);
  const spellings = knownSpellings(stations);

  const fromDatabase = collectChanges(stations, spellings);

  const missing = [
    ...new Set(
      stations
        .map((station) => station.city)
        .filter((city) => lacksDiacritics(city) && !spellings.has(fold(city))),
    ),
  ].sort();
  const planned = limit ? missing.slice(0, limit) : missing;

  heading('Stav');
  printSummary([
    ['Stanic s obcí', stations.length],
    ['Opraví se podle databáze', fromDatabase.length],
    ['Názvů k dohledání', planned.length],
  ]);

  const counts = { lookedUp: 0, unchanged: 0, failed: 0 };
  if (planned.length) {
    heading('Dohledávám v Nominatimu');
    await lookupMissing(planned, spellings, counts);
  }

  const changes = collectChanges(stations, spellings);

  heading('Opravy');
  for (const { station, city } of changes) {
    console.log(`  #${station.id} ${station.city} → ${city}`);
  }

  if (!dryRun && changes.length) {
    backupDatabase('city-diacritics');
    const update = db.prepare('UPDATE station SET city = ? WHERE id = ?');
    db.transaction(() => {
      for (const { station, city } of changes) update.run(city, station.id);
    })();
  }

  blank();
  heading('Celkem');
  printSummary([
    [dryRun ? 'Opravilo by se stanic' : 'Opraveno stanic', changes.length],
    ['Názvů dohledáno', counts.lookedUp],
    ['Názvů je správně / jiná obec', counts.unchanged],
    ['Nepodařilo se dohledat', counts.failed],
  ]);
  if (dryRun) console.log('\nZkušební běh – nic se nezapsalo.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
