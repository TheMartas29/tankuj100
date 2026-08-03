// Připojení k SQLite + migrace schématu.
//
// Tabulka `station` vzniká seedem (be/db/seed.sqlite), zbytek (hodnocení, reporty,
// hlasování o typu paliva) si vytvoříme sami při startu. Migrace jsou idempotentní –
// server se dá restartovat kolikrát chce.

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'db', 'tankuj100db.sqlite');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function migrate() {
  db.exec(`
    -- Hodnocení benzínky: 1–5 hvězdiček + volitelný komentář.
    -- Jedno zařízení = jedno hodnocení na stanici (jde přepsat), proto UNIQUE.
    CREATE TABLE IF NOT EXISTS review (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id  INTEGER NOT NULL,
      device_id   TEXT    NOT NULL,
      rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment     TEXT,
      author      TEXT,
      status      TEXT    NOT NULL DEFAULT 'published',  -- published | hidden
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL,
      UNIQUE (station_id, device_id)
    );
    CREATE INDEX IF NOT EXISTS idx_review_station ON review (station_id, status);

    -- Nahlášená nesrovnalost (špatná cena, zavřeno, chybí palivo, …).
    CREATE TABLE IF NOT EXISTS report (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id    INTEGER NOT NULL,
      device_id     TEXT    NOT NULL,
      type          TEXT    NOT NULL,   -- price | closed | fuel | location | other
      fuel_name     TEXT,               -- u type=price: kterého paliva se cena týká
      claimed_price REAL,               -- u type=price: cena podle uživatele
      note          TEXT,
      status        TEXT    NOT NULL DEFAULT 'new',  -- new | in_review | resolved | rejected
      admin_note    TEXT,
      created_at    TEXT    NOT NULL,
      resolved_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_report_status ON report (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_report_station ON report (station_id);

    -- Crowdsourced typ benzínu (E5 vs E10) – kvůli starším autům, což je smysl appky.
    -- Z API se to spolehlivě zjistit nedá, tak to hlásí uživatelé u pumpy.
    CREATE TABLE IF NOT EXISTS fuel_vote (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id  INTEGER NOT NULL,
      device_id   TEXT    NOT NULL,
      fuel_kind   TEXT    NOT NULL CHECK (fuel_kind IN ('e5', 'e10', 'unknown')),
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL,
      UNIQUE (station_id, device_id)
    );
    CREATE INDEX IF NOT EXISTS idx_fuel_vote_station ON fuel_vote (station_id);
  `);
}

migrate();

module.exports = { db, DB_PATH };
