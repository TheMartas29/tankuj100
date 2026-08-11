const { db, nowISO } = require('../db');
const { statusCondition } = require('./fragments');

const listPublished = (stationId, limit = 50) =>
  db
    .prepare(
      `SELECT id, rating, comment, author, created_at
         FROM review
        WHERE station_id = ? AND status = 'published'
        ORDER BY datetime(created_at) DESC
        LIMIT ?`
    )
    .all(stationId, limit);

function summary(stationId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count, AVG(rating) AS average,
              SUM(rating = 1) AS s1, SUM(rating = 2) AS s2, SUM(rating = 3) AS s3,
              SUM(rating = 4) AS s4, SUM(rating = 5) AS s5
         FROM review WHERE station_id = ? AND status = 'published'`
    )
    .get(stationId);

  return {
    count: row.count || 0,
    average: row.count ? Number(row.average.toFixed(2)) : null,
    distribution: { 1: row.s1 || 0, 2: row.s2 || 0, 3: row.s3 || 0, 4: row.s4 || 0, 5: row.s5 || 0 },
  };
}

const findByDevice = (stationId, deviceId) =>
  db
    .prepare(
      `SELECT id, rating, comment, author, status, created_at
         FROM review WHERE station_id = ? AND device_id = ?`
    )
    .get(stationId, deviceId);

function upsert({ stationId, deviceId, rating, comment, author }) {
  const ts = nowISO();
  db.prepare(
    `INSERT INTO review (station_id, device_id, rating, comment, author, status, created_at, updated_at)
     VALUES (@stationId, @deviceId, @rating, @comment, @author, 'published', @ts, @ts)
     ON CONFLICT(station_id, device_id) DO UPDATE SET
       rating = @rating, comment = @comment, author = @author, updated_at = @ts`
  ).run({ stationId, deviceId, rating, comment, author, ts });

  return db
    .prepare('SELECT * FROM review WHERE station_id = ? AND device_id = ?')
    .get(stationId, deviceId);
}

const removeByDevice = (stationId, deviceId) =>
  db.prepare('DELETE FROM review WHERE station_id = ? AND device_id = ?').run(stationId, deviceId);

function listForAdmin({ status, limit = 200 }) {
  const { where, params } = statusCondition(status);
  return db
    .prepare(
      `SELECT r.*, s.brand_name, s.name AS station_name, s.city
         FROM review r LEFT JOIN station s ON s.id = r.station_id
         ${where}
        ORDER BY datetime(r.created_at) DESC LIMIT ?`
    )
    .all(...params, limit);
}

const setStatus = (id, status) =>
  db.prepare('UPDATE review SET status = ?, updated_at = ? WHERE id = ?').run(status, nowISO(), id);

const remove = (id) => db.prepare('DELETE FROM review WHERE id = ?').run(id);

module.exports = {
  listPublished,
  summary,
  findByDevice,
  upsert,
  removeByDevice,
  listForAdmin,
  setStatus,
  remove,
};
