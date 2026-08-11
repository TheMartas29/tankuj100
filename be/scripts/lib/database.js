const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const { dbPath } = require('../../src/config');

function requireDatabaseFile() {
  if (!fs.existsSync(dbPath)) {
    console.error(`CHYBA: databáze ${dbPath} neexistuje.`);
    process.exit(1);
  }
  return dbPath;
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`CHYBA: ${label} ${filePath} neexistuje.`);
    process.exit(1);
  }
  return filePath;
}

/** Samostatné připojení bez migrací – pro skripty, které do schématu nesahají. */
function openDatabase({ readonly = false } = {}) {
  return new Database(requireDatabaseFile(), { readonly });
}

function backupDatabase(label) {
  const dir = path.join(path.dirname(dbPath), '_backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `pre-${label}-${stamp}.sqlite`);

  // `sqlite3 .backup` sebere i rozepsaný WAL, prosté kopírování souboru ne.
  // Bez sqlite3 v systému kopírujeme aspoň všechny tři soubory najednou.
  try {
    execFileSync('sqlite3', [dbPath, `.backup '${target}'`], { stdio: 'pipe' });
  } catch {
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) fs.copyFileSync(dbPath + suffix, target + suffix);
    }
  }
  return target;
}

module.exports = { dbPath, requireDatabaseFile, requireFile, openDatabase, backupDatabase };
