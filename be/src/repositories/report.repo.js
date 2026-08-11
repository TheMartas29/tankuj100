const { db, nowISO } = require('../db');
const { statusCondition } = require('./fragments');

const OPEN_STATUSES = ['new', 'in_review'];
const RESOLVED_STATUSES = ['resolved', 'rejected'];

function create({ stationId, deviceId, type, fuelName, note, reviewId }) {
  // `claimed_price` zůstal po hlášení špatné ceny – ceny už neřešíme, takže se do něj
  // nic nezapisuje, ale starým řádkům ho nemažeme.
  const info = db
    .prepare(
      `INSERT INTO report (station_id, device_id, type, fuel_name, note, review_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`
    )
    .run(stationId, deviceId, type, fuelName ?? null, note ?? null, reviewId ?? null, nowISO());

  return db.prepare('SELECT * FROM report WHERE id = ?').get(info.lastInsertRowid);
}

const countRecentForDevice = (stationId, deviceId) =>
  db
    .prepare(
      `SELECT COUNT(*) AS c FROM report
        WHERE station_id = ? AND device_id = ?
          AND datetime(created_at) > datetime('now', '-1 day')`
    )
    .get(stationId, deviceId).c;

const countOpenForStation = (stationId) =>
  db
    .prepare(
      `SELECT COUNT(*) AS c FROM report
        WHERE station_id = ? AND status IN (${OPEN_STATUSES.map(() => '?').join(',')})`
    )
    .get(stationId, ...OPEN_STATUSES).c;

function listForAdmin({ status, limit = 200 }) {
  const { where, params } = statusCondition(status);
  return db
    .prepare(
      `SELECT r.*, s.brand_name, s.name AS station_name, s.city, s.address, s.zip, s.lat, s.lon,
              rev.comment AS reported_comment, rev.author AS reported_author,
              rev.rating AS reported_rating, rev.status AS reported_status
         FROM report r
         LEFT JOIN station s   ON s.id = r.station_id
         LEFT JOIN review  rev ON rev.id = r.review_id
         ${where}
        ORDER BY datetime(r.created_at) DESC LIMIT ?`
    )
    .all(...params, limit);
}

const setStatus = (id, status, adminNote) =>
  db
    .prepare(
      'UPDATE report SET status = ?, admin_note = COALESCE(?, admin_note), resolved_at = ? WHERE id = ?'
    )
    .run(status, adminNote ?? null, RESOLVED_STATUSES.includes(status) ? nowISO() : null, id);

const remove = (id) => db.prepare('DELETE FROM report WHERE id = ?').run(id);

module.exports = { create, countRecentForDevice, countOpenForStation, listForAdmin, setStatus, remove };
