#!/usr/bin/env node
// Úklid dat o benzínkách.
//
// Data z fuelo.net obsahují i stanice v Německu, Rakousku a Polsku a u části záznamů
// je místo značky bulharské slovo „Бензиностанция“ (= čerpací stanice). Tohle je
// vyčistí:
//
//   1) smaže stanice mimo území ČR (point-in-polygon proti hranici z OpenStreetMap),
//   2) u zbylých stanic s azbukou v `brand_name` dohledá skutečnou značku z názvu
//      (např. „ONO ČS Cheb“ → ONO, „Cerpaci Stanice EuroOil“ → EuroOil);
//      když se značku dohledat nepodaří, záznam smaže,
//   3) smaže stanice bez použitelných souřadnic.
//
// Skript je idempotentní – druhé spuštění už nic nezmění.
//
// Použití:
//   node scripts/cleanup-db.js --dry-run     # jen vypíše, co by udělal
//   node scripts/cleanup-db.js               # provede úklid (předtím udělá zálohu)

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { isInCzechia } = require('../src/geo');

const DRY_RUN = process.argv.includes('--dry-run');
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'db', 'tankuj100db.sqlite');

// Známé značky, které se schovávají v poli `name`, když je `brand_name` nesmysl.
// Pořadí rozhoduje – delší/specifičtější názvy musí být dřív.
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

const hasCyrillic = (s) => typeof s === 'string' && /[Ѐ-ӿ]/.test(s);

// Obecné přívlastky, které v názvu značky nechceme („TOP TANK Station“ → „TOP TANK“).
const GENERIC_SUFFIXES = /\s*(Station|Tankstelle|ČS|CS|Čerpací stanice|Cerpaci Stanice)\s*$/i;

function brandFromName(name) {
  if (!name) return null;
  for (const [re, brand] of BRAND_PATTERNS) {
    if (re.test(name)) return brand;
  }
  // Neznámá (často nezávislá) pumpa – použijeme aspoň očištěný název, ať uživatel
  // v aplikaci nevidí azbuku. Delší popisy neberem, to už není značka.
  const cleaned = name.replace(GENERIC_SUFFIXES, '').trim();
  if (cleaned && cleaned.length <= 30) return cleaned;
  return null;
}

function backup(dbPath) {
  const dir = path.join(path.dirname(dbPath), '_backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `pre-cleanup-${stamp}.sqlite`);
  fs.copyFileSync(dbPath, target);
  return target;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`CHYBA: databáze ${DB_PATH} neexistuje.`);
    process.exit(1);
  }

  if (!DRY_RUN) {
    console.log(`Záloha: ${backup(DB_PATH)}`);
  }

  const db = new Database(DB_PATH);
  const rows = db.prepare('SELECT id, lat, lon, brand_name, name, city, zip FROM station').all();

  const toDelete = [];
  const toRebrand = [];

  for (const row of rows) {
    if (row.lat == null || row.lon == null || !isInCzechia(row.lat, row.lon)) {
      toDelete.push({ ...row, reason: row.lat == null ? 'chybí souřadnice' : 'mimo ČR' });
      continue;
    }
    if (hasCyrillic(row.brand_name)) {
      const brand = brandFromName(row.name);
      if (brand) toRebrand.push({ ...row, brand });
      else toDelete.push({ ...row, reason: 'azbuka ve značce a nelze určit značku' });
    }
  }

  console.log('');
  console.log(`Celkem stanic:            ${rows.length}`);
  console.log(`Ke smazání:               ${toDelete.length}`);
  console.log(`K opravě značky:          ${toRebrand.length}`);
  console.log(`Zůstane:                  ${rows.length - toDelete.length}`);
  console.log('');

  const byReason = toDelete.reduce((acc, r) => ({ ...acc, [r.reason]: (acc[r.reason] || 0) + 1 }), {});
  for (const [reason, count] of Object.entries(byReason)) {
    console.log(`  smazat – ${reason}: ${count}`);
  }
  const byBrand = toRebrand.reduce((acc, r) => ({ ...acc, [r.brand]: (acc[r.brand] || 0) + 1 }), {});
  for (const [brand, count] of Object.entries(byBrand)) {
    console.log(`  značka → ${brand}: ${count}`);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: nic se nezměnilo.');
    if (toDelete.length) {
      console.log('\nUkázka mazaných:');
      for (const r of toDelete.slice(0, 10)) {
        console.log(`  #${r.id} ${r.brand_name} | ${r.name} | ${r.city} (${r.reason})`);
      }
    }
    return;
  }

  const delStation = db.prepare('DELETE FROM station WHERE id = ?');
  const setBrand = db.prepare('UPDATE station SET brand_name = ? WHERE id = ?');

  // Uživatelský obsah smazané stanice by jinak zůstal jako sirotek. Tabulky ale
  // vznikají až při startu serveru, takže na čerstvém seedu ještě nemusí existovat.
  const hasTable = (name) =>
    Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name));
  const childDeletes = ['review', 'report', 'fuel_vote']
    .filter(hasTable)
    .map((t) => db.prepare(`DELETE FROM ${t} WHERE station_id = ?`));

  const run = db.transaction(() => {
    for (const r of toDelete) {
      for (const stmt of childDeletes) stmt.run(r.id);
      delStation.run(r.id);
    }
    for (const r of toRebrand) setBrand.run(r.brand, r.id);
  });
  run();

  db.exec('VACUUM');
  const left = db.prepare('SELECT COUNT(*) AS c FROM station').get().c;
  console.log(`\nHotovo ✔  V databázi zůstalo ${left} stanic v ČR.`);
}

main();
