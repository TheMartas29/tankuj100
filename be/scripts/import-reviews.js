#!/usr/bin/env node
/*
 * Import scrapnutých hodnocení ze staging (data/reviews-staging/*.json) do DB.
 *
 * Bezpečnostní brzda: bez --commit skript nic nezapíše, jen vypíše, co by udělal
 * (schvalovací krok). Špatný match zamítneš prostě smazáním jeho staging souboru.
 *
 * Scrapnuté recenze dostávají source='gmaps' a syntetické device_id
 * 'gmaps:<reviewId>', aby se vešly do UNIQUE(station_id, device_id) a daly se
 * v administraci odlišit od uživatelských (source='user') i hromadně smazat:
 *   DELETE FROM review WHERE source='gmaps';
 *
 *   node scripts/import-reviews.js                    jen výpis (nic nezapíše)
 *   node scripts/import-reviews.js --min-confidence 0.6   přísnější práh
 *   node scripts/import-reviews.js --commit           zapíše (předtím zálohuje)
 */
const fs = require('fs');
const path = require('path');

const { db, nowISO } = require('../src/db');
const { parseArgs } = require('./lib/cli');
const { backupDatabase } = require('./lib/database');
const { blank, printSummary } = require('./lib/log');

const USAGE = `
Import scrapnutých hodnocení ze staging do databáze.

  node scripts/import-reviews.js                       jen výpis, nic nezapíše
  node scripts/import-reviews.js --min-confidence 0.6  jen matche s dostatečnou shodou
  node scripts/import-reviews.js --commit              provede import (předtím zálohuje)

Zamítnutí matche: smaž jeho soubor v data/reviews-staging/ a spusť znovu.
`;

const args = parseArgs({ usage: USAGE, flags: ['commit'], texts: ['min-confidence'] });
const MIN_CONFIDENCE = args.minConfidence != null ? Number(args.minConfidence) : 0.5;
const STAGING_DIR = path.join(__dirname, '..', 'data', 'reviews-staging');

function loadStaging() {
  if (!fs.existsSync(STAGING_DIR)) {
    console.error(`CHYBA: staging ${STAGING_DIR} neexistuje. Nejdřív spusť scrape-reviews.js.`);
    process.exit(1);
  }
  return fs
    .readdirSync(STAGING_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(STAGING_DIR, f), 'utf8')));
}

const stationExists = db.prepare('SELECT 1 FROM station WHERE id = ?');
const clampRating = (r) => Math.max(1, Math.min(5, Math.round(Number(r))));

const upsert = db.prepare(
  `INSERT INTO review (station_id, device_id, rating, comment, author, source, status, created_at, updated_at)
   VALUES (@stationId, @deviceId, @rating, @comment, @author, 'gmaps', 'published', @ts, @ts)
   ON CONFLICT(station_id, device_id) DO UPDATE SET
     rating = @rating, comment = @comment, author = @author, updated_at = @ts`
);

function main() {
  const files = loadStaging();
  if (!files.length) {
    console.error('Staging je prázdný.');
    process.exit(1);
  }

  const accepted = [];
  const rejected = [];
  for (const file of files) {
    const reason =
      !stationExists.get(file.stationId) ? 'stanice v DB neexistuje'
        : (file.confidence || 0) < MIN_CONFIDENCE ? `nízká shoda (${file.confidence})`
        : !file.reviewCount ? 'žádné recenze'
        : null;
    if (reason) rejected.push({ file, reason });
    else accepted.push(file);
  }

  console.log(`Práh shody: ${MIN_CONFIDENCE}   (změň přes --min-confidence)\n`);
  for (const file of accepted) {
    console.log(`✓ #${file.stationId} „${file.station?.name || ''}" → „${file.placeTitle}" (shoda ${file.confidence}, ${file.reviewCount} recenzí)`);
    for (const r of file.reviews.slice(0, 2)) {
      const snippet = (r.text || '').replace(/\s+/g, ' ').slice(0, 70);
      console.log(`    ${r.rating}★ ${r.author || '?'}: ${snippet}${snippet.length >= 70 ? '…' : ''}`);
    }
  }
  if (rejected.length) {
    blank();
    for (const { file, reason } of rejected) {
      console.log(`✗ #${file.stationId} „${file.placeTitle || file.station?.name || '?'}" – ${reason}`);
    }
  }

  const totalReviews = accepted.reduce((sum, f) => sum + f.reviewCount, 0);
  blank();
  printSummary([
    ['Staging souborů', files.length],
    ['Ke schválení', accepted.length],
    ['Zamítnuto', rejected.length],
    ['Recenzí k importu', totalReviews],
  ]);

  if (!args.commit) {
    console.log('\nToto byl jen náhled. Zkontrola: smaž špatné soubory v data/reviews-staging/.');
    console.log('Spusť s --commit pro skutečný import.');
    return;
  }

  const backup = backupDatabase('import-reviews');
  console.log(`\nZáloha: ${backup}`);

  let inserted = 0;
  let skipped = 0;
  const ts = nowISO();
  const run = db.transaction((rows) => {
    for (const file of rows) {
      for (const r of file.reviews) {
        if (!r.rating || !r.reviewId) { skipped += 1; continue; }
        upsert.run({
          stationId: file.stationId,
          deviceId: `gmaps:${r.reviewId}`,
          rating: clampRating(r.rating),
          comment: r.text || null,
          author: r.author || null,
          ts,
        });
        inserted += 1;
      }
    }
  });
  run(accepted);

  printSummary([['Zapsáno recenzí', inserted], ['Přeskočeno (bez ratingu/id)', skipped]]);
}

main();
