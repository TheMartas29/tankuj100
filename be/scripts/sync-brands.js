#!/usr/bin/env node
const { SOURCES, bySlug } = require('../src/sources');
const { parseArgs } = require('./lib/cli');
const { dbPath, requireDatabaseFile, backupDatabase } = require('./lib/database');
const { blank, printSummary, printCounts, heading } = require('./lib/log');

const USAGE = `
Synchronizace stanic z webů jednotlivých značek do databáze.

Stanice se nikdy nemažou – co zdroj přestal vracet, se jen vypíše v reportu.
Nová stanice vznikne jen tehdy, když čerpá 98 nebo 100 oktanů.

  node scripts/sync-brands.js --dry-run          nic nezapíše, jen vypíše plán
  node scripts/sync-brands.js                    provede synchronizaci (předtím zálohuje)
  node scripts/sync-brands.js --source=orlen     jen jedna značka
  node scripts/sync-brands.js --limit 20         jen prvních 20 stanic ze zdroje (ladění)

Zdroje: ${SOURCES.map((source) => source.slug).join(', ')}
`;

const { dryRun, source: onlySlug, limit } = parseArgs({
  usage: USAGE,
  flags: ['dry-run'],
  numbers: ['limit'],
  texts: ['source'],
});

const SAMPLE_SIZE = 10;

function selectSources() {
  if (!onlySlug) return SOURCES;
  const source = bySlug(onlySlug);
  if (!source) {
    console.error(`CHYBA: zdroj „${onlySlug}“ neznám. Vyber z: ${SOURCES.map((s) => s.slug).join(', ')}`);
    process.exit(1);
  }
  return [source];
}

const countReasons = (unmatched) => {
  const counts = new Map();
  for (const item of unmatched) counts.set(item.reason, (counts.get(item.reason) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

function printSourceReport(report) {
  heading(`${report.brand} (${report.slug})`);

  if (report.error) {
    console.log(`CHYBA zdroje: ${report.error}`);
    console.log('Databáze zůstala beze změny, pokračuji dalším zdrojem.');
    return;
  }

  const reasons = countReasons(report.details.unmatched)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(', ');
  const fields = report.fieldCounts.map(([field, count]) => `${field} ${count}`).join(', ');

  printSummary([
    ['Zdroj vrátil stanic', `${report.fetched}  (spárovaných z minulých běhů ${report.previous})`],
    ['Nových stanic', report.created],
    ['Aktualizováno', `${report.updated}${fields ? `  (${fields})` : ''}`],
    ['Beze změny', report.unchanged],
    ['Zdroj přestal vracet', report.missing],
    ['V DB, ale zdroj o nich neví', report.orphans],
    ['Nespárováno', `${report.unmatched}${reasons ? `  (${reasons})` : ''}`],
  ]);

  if (report.skippedReason) console.log(`\n⚠  ${report.skippedReason}`);
  else if (!report.applied) console.log('\nZkušební běh – nic se nezapsalo.');

  const created = report.details.created.slice(0, SAMPLE_SIZE);
  if (created.length) {
    printCounts(
      `\nNové stanice${report.details.created.length > SAMPLE_SIZE ? ` (prvních ${SAMPLE_SIZE} z ${report.details.created.length})` : ''}:`,
      created.map((item) => [item.row.name || '–', [item.row.city, item.fuels.join('+')].filter(Boolean).join(' | ')])
    );
  }

  const missing = report.details.missing.slice(0, SAMPLE_SIZE);
  if (missing.length) {
    printCounts(
      `\nMožná zrušené (zdroj je přestal vracet, v DB zůstávají)${report.details.missing.length > SAMPLE_SIZE ? ` – prvních ${SAMPLE_SIZE} z ${report.details.missing.length}` : ''}:`,
      missing.map((item) => [
        `#${item.station?.id ?? '?'} ${item.station?.name || '(stanice už v DB není)'}`,
        `id u značky ${item.externalId}`,
      ])
    );
  }

  const orphans = report.details.orphans.slice(0, SAMPLE_SIZE);
  if (orphans.length) {
    printCounts(
      `\nV DB pod touto značkou, ale zdroj je nezná${report.details.orphans.length > SAMPLE_SIZE ? ` – prvních ${SAMPLE_SIZE} z ${report.details.orphans.length}` : ''}:`,
      orphans.map((item) => [`#${item.station.id} ${item.station.name || '–'}`, item.station.city || '–'])
    );
  }
}

function printTotals(reports) {
  heading('Celkem');
  const sum = (field) => reports.reduce((total, report) => total + (report[field] || 0), 0);
  const failed = reports.filter((report) => report.error);

  printSummary([
    ['Zdrojů', `${reports.length}  (nedostupných ${failed.length})`],
    ['Stanic ze zdrojů', sum('fetched')],
    ['Nových stanic', sum('created')],
    ['Aktualizovaných', sum('updated')],
    ['Beze změny', sum('unchanged')],
    ['Možná zrušených', sum('missing')],
    ['V DB, ale zdroj o nich neví', sum('orphans')],
    ['Nespárovaných záznamů', sum('unmatched')],
  ]);

  if (failed.length) {
    printCounts('\nNedostupné zdroje:', failed.map((report) => [report.slug, report.error]));
  }
}

async function main() {
  requireDatabaseFile();
  const sources = selectSources();

  console.log(`Databáze: ${dbPath}`);
  console.log(`Zdroje: ${sources.map((source) => source.slug).join(', ')}`);
  if (limit) console.log(`Omezení: jen prvních ${limit} stanic z každého zdroje (kontrola propadu se přeskočí)`);
  if (dryRun) console.log('Režim: zkušební běh, do databáze se nezapisuje.');
  else console.log(`Záloha: ${backupDatabase('sync-brands')}`);

  // Až po záloze – připojení k DB pustí migrace.
  const { syncSource } = require('../src/services/station-sync');

  const reports = [];
  for (const source of sources) {
    try {
      const records = await source.fetchStations({ limit });
      reports.push(syncSource(source, records, { dryRun, partial: Boolean(limit) }));
    } catch (error) {
      // Výpadek jednoho webu nesmí shodit celý běh.
      reports.push({ slug: source.slug, brand: source.brand, error: error.message });
    }
    // Průběžně, ne až na konci – plný běh trvá minuty a stahuje se sekvenčně.
    printSourceReport(reports[reports.length - 1]);
  }

  printTotals(reports);
  blank();
}

main().catch((error) => {
  console.error('CHYBA:', error);
  process.exit(1);
});
