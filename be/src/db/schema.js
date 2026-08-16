const TABLES = `
  CREATE TABLE IF NOT EXISTS review (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id  INTEGER NOT NULL,
    device_id   TEXT    NOT NULL,
    rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    author      TEXT,
    status      TEXT    NOT NULL DEFAULT 'published',
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    UNIQUE (station_id, device_id)
  );
  CREATE INDEX IF NOT EXISTS idx_review_station ON review (station_id, status);

  CREATE TABLE IF NOT EXISTS report (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id    INTEGER NOT NULL,
    device_id     TEXT    NOT NULL,
    type          TEXT    NOT NULL,
    fuel_name     TEXT,
    claimed_price REAL,
    note          TEXT,
    status        TEXT    NOT NULL DEFAULT 'new',
    admin_note    TEXT,
    created_at    TEXT    NOT NULL,
    resolved_at   TEXT,
    review_id     INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_report_status ON report (status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_report_station ON report (station_id);

  -- 'unknown' je zrušená volba ze starší verze aplikace. CHECK ji pořád povoluje,
  -- aby historické řádky prošly, ale nikde se nepočítá ani nezapisuje.
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

  -- Cizí klíče na station schválně nedeklarujeme ani tady, ani u review / report /
  -- fuel_vote: import z OSM se chová jako flush + insert a s kaskádami by neprošel.
  -- Osiřelé řádky uklízí scripts/cleanup-db.js.
  CREATE TABLE IF NOT EXISTS station_fuel (
    station_id  INTEGER NOT NULL,
    fuel_key    TEXT    NOT NULL,
    PRIMARY KEY (station_id, fuel_key)
  );
  CREATE INDEX IF NOT EXISTS idx_station_fuel_key ON station_fuel (fuel_key);

  -- Vazba stanice na její záznam u značky (scripts/sync-brands.js). Drží identitu
  -- mezi běhy, aby se stanice nepárovaly jen podle vzdálenosti.
  CREATE TABLE IF NOT EXISTS station_source (
    station_id    INTEGER NOT NULL,
    source        TEXT    NOT NULL,
    external_id   TEXT    NOT NULL,
    last_seen_at  TEXT,
    PRIMARY KEY (source, external_id)
  );
  CREATE INDEX IF NOT EXISTS idx_station_source_station ON station_source (station_id);

  -- Žádost uživatele o přidání benzínky. Stanice nevzniká odesláním, ale až
  -- schválením v administraci – do té doby je řádek jediné, co o ní existuje.
  -- Sloupec admin_note slouží dvěma věcem naráz: u zamítnutí je to text pro
  -- uživatele, jinde interní poznámka. Kdo ho vyplňuje, musí vědět, že u zamítnutí
  -- půjde ven. Paliva jsou JSON pole klíčů z fuel-flags.js.
  CREATE TABLE IF NOT EXISTS station_request (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT    NOT NULL,
    lat         REAL    NOT NULL,
    lon         REAL    NOT NULL,
    brand_name  TEXT,
    name        TEXT,
    city        TEXT,
    address     TEXT,
    fuels       TEXT    NOT NULL,
    note        TEXT,
    status      TEXT    NOT NULL DEFAULT 'new',
    admin_note  TEXT,
    created_at  TEXT    NOT NULL,
    resolved_at TEXT,
    station_id  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_station_request_status ON station_request (status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_station_request_device ON station_request (device_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS station_tag (
    station_id  INTEGER NOT NULL,
    tag_key     TEXT    NOT NULL,
    tag_value   TEXT,
    PRIMARY KEY (station_id, tag_key)
  );
  CREATE INDEX IF NOT EXISTS idx_station_tag_key ON station_tag (tag_key);
`;

const ADDED_COLUMNS = [
  ['report', 'review_id', 'INTEGER'],
  ['station', 'osm_id', 'TEXT'],
  ['station', 'data_source', 'TEXT'],
];

function addColumnIfMissing(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`[db] přidán sloupec ${table}.${column}`);
}

function migrate(db) {
  db.exec(TABLES);
  for (const [table, column, definition] of ADDED_COLUMNS) {
    addColumnIfMissing(db, table, column, definition);
  }
  // SQLite neumí `ALTER TABLE ... ADD COLUMN ... UNIQUE`, unikátnost proto zařídí až
  // index. Stanicím bez OSM původu nevadí – NULL hodnoty jsou v SQLite navzájem různé.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_station_osm_id ON station (osm_id)');
}

module.exports = { migrate };
