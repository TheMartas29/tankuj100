#!/usr/bin/env node
const { isInCzechia } = require('../src/geo');
const { parseArgs } = require('./lib/cli');
const { openDatabase, backupDatabase } = require('./lib/database');
const { blank, printSummary, printCounts } = require('./lib/log');

const USAGE = `
Úklid dat o benzínkách po importu z fuelo.net: smaže stanice mimo ČR a bez souřadnic
a u stanic s azbukou ve značce dohledá skutečnou značku z názvu. Idempotentní.

  node scripts/cleanup-db.js --dry-run    jen vypíše, co by udělal
  node scripts/cleanup-db.js              provede úklid (předtím zálohuje)
`;

const { dryRun } = parseArgs({ usage: USAGE, flags: ['dry-run'] });

// Pořadí rozhoduje – delší a specifičtější názvy musí být dřív.
const BRAND_PATTERNS = [
  [/\bEuroOil\b/i, 'EuroOil'],
  [/\bONO\b/i, 'ONO'],
  [/\bPapOil\b/i, 'PapOil'],
  [/\bMOL\b/i, 'MOL'],
  [/\bOMV\b/i, 'OMV'],
  [/\bShell\b/i, 'Shell'],
  [/\bOrlen\b|\bBenzina\b/i, 'Orlen'],
  [/\bAgip\b|\bEni\b/i, 'Eni'],
  [/\bTank\s?ONO\b/i, 'ONO'],
  [/\bRobin\s?Oil\b/i, 'Robin Oil'],
  [/\bAvia\b/i, 'Avia'],
  [/\bPrim[ae]gas\b/i, 'Primagas'],
  [/\bČEPRO\b|\bCepro\b/i, 'ČEPRO'],
];

const GENERIC_SUFFIXES = /\s*(Station|Tankstelle|ČS|CS|Čerpací stanice|Cerpaci Stanice)\s*$/i;
const MAX_BRAND_LENGTH = 30;
const CHILD_TABLES = ['review', 'report', 'fuel_vote', 'station_fuel', 'station_tag'];
const SAMPLE_SIZE = 10;

const hasCyrillic = (text) => typeof text === 'string' && /[Ѐ-ӿ]/.test(text);

function brandFromName(name) {
  if (!name) return null;
  for (const [pattern, brand] of BRAND_PATTERNS) {
    if (pattern.test(name)) return brand;
  }

  const cleaned = name.replace(GENERIC_SUFFIXES, '').trim();
  return cleaned && cleaned.length <= MAX_BRAND_LENGTH ? cleaned : null;
}

function planCleanup(rows) {
  const toDelete = [];
  const toRebrand = [];

  for (const row of rows) {
    if (row.lat == null || row.lon == null || !isInCzechia(row.lat, row.lon)) {
      toDelete.push({ ...row, reason: row.lat == null ? 'chybí souřadnice' : 'mimo ČR' });
      continue;
    }
    if (!hasCyrillic(row.brand_name)) continue;

    const brand = brandFromName(row.name);
    if (brand) toRebrand.push({ ...row, brand });
    else toDelete.push({ ...row, reason: 'azbuka ve značce a nelze určit značku' });
  }

  return { toDelete, toRebrand };
}

const groupCount = (items, keyOf) => {
  const counts = new Map();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) || 0) + 1);
  return [...counts];
};

function apply(db, { toDelete, toRebrand }) {
  const deleteStation = db.prepare('DELETE FROM station WHERE id = ?');
  const setBrand = db.prepare('UPDATE station SET brand_name = ? WHERE id = ?');

  // Tabulky s uživatelským obsahem vznikají až při startu serveru, takže na čerstvém
  // seedu ještě nemusí existovat.
  const tableExists = (name) =>
    Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name));
  const deleteChildren = CHILD_TABLES.filter(tableExists).map((table) =>
    db.prepare(`DELETE FROM ${table} WHERE station_id = ?`)
  );

  db.transaction(() => {
    for (const row of toDelete) {
      for (const statement of deleteChildren) statement.run(row.id);
      deleteStation.run(row.id);
    }
    for (const row of toRebrand) setBrand.run(row.brand, row.id);
  })();

  db.exec('VACUUM');
}

function main() {
  if (!dryRun) console.log(`Záloha: ${backupDatabase('cleanup')}`);

  const db = openDatabase({ readonly: dryRun });
  const rows = db.prepare('SELECT id, lat, lon, brand_name, name, city, zip FROM station').all();
  const plan = planCleanup(rows);

  printSummary([
    null,
    ['Celkem stanic', rows.length],
    ['Ke smazání', plan.toDelete.length],
    ['K opravě značky', plan.toRebrand.length],
    ['Zůstane', rows.length - plan.toDelete.length],
    null,
  ]);

  for (const [reason, count] of groupCount(plan.toDelete, (r) => r.reason)) {
    console.log(`  smazat – ${reason}: ${count}`);
  }
  for (const [brand, count] of groupCount(plan.toRebrand, (r) => r.brand)) {
    console.log(`  značka → ${brand}: ${count}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: nic se nezměnilo.');
    if (plan.toDelete.length) {
      printCounts(
        '\nUkázka mazaných:',
        plan.toDelete
          .slice(0, SAMPLE_SIZE)
          .map((r) => [`#${r.id} ${r.brand_name} | ${r.name} | ${r.city}`, r.reason])
      );
    }
    return;
  }

  apply(db, plan);
  const left = db.prepare('SELECT COUNT(*) AS c FROM station').get().c;
  blank();
  console.log(`Hotovo ✔  V databázi zůstalo ${left} stanic v ČR.`);
}

main();
