#!/usr/bin/env node
const { canonicalBrand, canonicalStationName } = require('../src/brands');
const { db } = require('../src/db');
const { parseArgs } = require('./lib/cli');

const USAGE = `
Přepočítá \`brand_name\` a \`name\` u všech stanic podle pravidel v src/brands.js.
Používá se po změně normalizačních pravidel místo celého importu, který stanice maže
a přišli bychom o dopočtené adresy i uživatelský obsah navázaný na station.id.

  node scripts/normalize-brands.js --dry-run
  node scripts/normalize-brands.js
`;

const { dryRun } = parseArgs({ usage: USAGE, flags: ['dry-run'] });

function collectChanges(rows) {
  const changes = [];
  for (const row of rows) {
    const brandName = canonicalBrand(row.brand_name) || row.brand_name;
    const name = canonicalStationName(row.name, brandName) || row.name;
    if (brandName !== row.brand_name || name !== row.name) {
      changes.push({ id: row.id, from: row, to: { brand_name: brandName, name } });
    }
  }
  return changes;
}

function describe({ from, to }) {
  const parts = [];
  if (from.brand_name !== to.brand_name) parts.push(`značka ${from.brand_name} → ${to.brand_name}`);
  if (from.name !== to.name) parts.push(`název ${from.name} → ${to.name}`);
  return parts.join(', ');
}

function main() {
  const rows = db.prepare('SELECT id, brand_name, name FROM station').all();
  const changes = collectChanges(rows);

  for (const change of changes) console.log(`#${change.id}: ${describe(change)}`);

  if (!dryRun && changes.length) {
    const update = db.prepare('UPDATE station SET brand_name = ?, name = ? WHERE id = ?');
    db.transaction(() => {
      for (const change of changes) update.run(change.to.brand_name, change.to.name, change.id);
    })();
  }

  console.log(`\n${changes.length} stanic ${dryRun ? 'by se změnilo' : 'změněno'} (z ${rows.length}).`);
}

main();
