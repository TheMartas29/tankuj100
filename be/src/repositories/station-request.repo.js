const { db, nowISO } = require('../db');
const { statusCondition } = require('./fragments');

// Co vidí uživatel o svých žádostech. Schválně ne `SELECT *` – `device_id` ani
// interní poznámky k cizím žádostem ven nepatří.
const MINE_COLUMNS = `id, lat, lon, brand_name, city, status, admin_note,
                      created_at, resolved_at, station_id`;

const RESOLVED_STATUSES = ['approved', 'rejected'];

const insertStatement = db.prepare(
  `INSERT INTO station_request
     (device_id, lat, lon, brand_name, name, city, address, fuels, note, status, created_at)
   VALUES (@device_id, @lat, @lon, @brand_name, @name, @city, @address, @fuels, @note, 'new', @created_at)`
);

const findById = (id) => db.prepare('SELECT * FROM station_request WHERE id = ?').get(id);

function create({ deviceId, lat, lon, brandName, name, city, address, fuels, note }) {
  // Paliva jako JSON pole: dokud žádost není schválená, žádná stanice neexistuje,
  // takže se nemají na co navázat v `station_fuel`.
  const info = insertStatement.run({
    device_id: deviceId,
    lat,
    lon,
    brand_name: brandName ?? null,
    name: name ?? null,
    city: city ?? null,
    address: address ?? null,
    fuels: JSON.stringify(fuels),
    note: note ?? null,
    created_at: nowISO(),
  });

  return findById(info.lastInsertRowid);
}

const countRecentForDevice = (deviceId) =>
  db
    .prepare(
      `SELECT COUNT(*) AS c FROM station_request
        WHERE device_id = ? AND datetime(created_at) > datetime('now', '-1 day')`
    )
    .get(deviceId).c;

const listForDevice = (deviceId, limit = 20) =>
  db
    .prepare(
      `SELECT ${MINE_COLUMNS} FROM station_request
        WHERE device_id = ?
        ORDER BY datetime(created_at) DESC LIMIT ?`
    )
    .all(deviceId, limit);

function listForAdmin({ status, limit = 200 }) {
  const { where, params } = statusCondition(status);
  return db
    .prepare(
      `SELECT r.*, s.brand_name AS station_brand_name, s.city AS station_city
         FROM station_request r
         LEFT JOIN station s ON s.id = r.station_id
         ${where}
        ORDER BY datetime(r.created_at) DESC LIMIT ?`
    )
    .all(...params, limit);
}

/**
 * Kandidáti na duplicitu z obdélníku kolem bodu. Přesnou vzdálenost počítá až
 * volající – tady jde o to, aby se z tabulky vytáhla hrstka řádků a ne všechno.
 * Při stotisíci stanicích by haversine nad celou tabulkou stál každé odeslané
 * žádosti stotisíc výpočtů.
 */
const stationsInBox = (box) =>
  db
    .prepare(
      `SELECT id, lat, lon, brand_name, name, city FROM station
        WHERE lat BETWEEN @minLat AND @maxLat AND lon BETWEEN @minLon AND @maxLon`
    )
    .all(box);

const pendingInBox = (box) =>
  db
    .prepare(
      `SELECT id, lat, lon, brand_name, name, city FROM station_request
        WHERE status = 'new' AND lat BETWEEN @minLat AND @maxLat AND lon BETWEEN @minLon AND @maxLon`
    )
    .all(box);

const insertStation = db.prepare(
  `INSERT INTO station (id, lat, lon, brand_name, name, city, address, status, osm_id, data_source)
   VALUES (@id, @lat, @lon, @brand_name, @name, @city, @address, 'OK', NULL, 'user')`
);
const insertFuel = db.prepare('INSERT INTO station_fuel (station_id, fuel_key) VALUES (?, ?)');
const resolveStatement = db.prepare(
  `UPDATE station_request
      SET status = 'approved', admin_note = COALESCE(?, admin_note), station_id = ?, resolved_at = ?
    WHERE id = ?`
);

// Volné `id` bereme za posledním obsazeným, ne nejnižší volné: nejnižší volná čísla
// rozdává import z OSM novým pumpám a o kus výš je klid. Kolizi to vyloučit nestačí,
// proto import uživatelská `id` navíc považuje za obsazená (scripts/import-osm.js).
const nextStationId = () => db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM station').get().id;

/**
 * Schválení. Všechno v jedné transakci – stanice bez paliv nebo žádost bez
 * `station_id` by byla horší než neschválená žádost.
 */
const approve = db.transaction((request, fuels, adminNote) => {
  const stationId = nextStationId();

  insertStation.run({
    id: stationId,
    lat: request.lat,
    lon: request.lon,
    brand_name: request.brand_name,
    name: request.name,
    city: request.city,
    address: request.address,
  });
  for (const fuel of fuels) insertFuel.run(stationId, fuel);
  resolveStatement.run(adminNote ?? null, stationId, nowISO(), request.id);

  return stationId;
});

const setStatus = (id, status, adminNote) =>
  db
    .prepare(
      `UPDATE station_request
          SET status = ?, admin_note = COALESCE(?, admin_note), resolved_at = ?
        WHERE id = ?`
    )
    .run(status, adminNote ?? null, RESOLVED_STATUSES.includes(status) ? nowISO() : null, id);

const remove = (id) => db.prepare('DELETE FROM station_request WHERE id = ?').run(id);

module.exports = {
  create,
  findById,
  countRecentForDevice,
  listForDevice,
  listForAdmin,
  stationsInBox,
  pendingInBox,
  approve,
  setStatus,
  remove,
};
