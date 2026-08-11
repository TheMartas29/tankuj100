const { db, nowISO } = require('../db');

function countsForStation(stationId) {
  // Zrušená volba „nevím“ (`unknown`) v databázi po starší verzi aplikace pořád leží.
  // Do součtů se nezapočítává, ať se kvůli ní nic nerozbije.
  const row = db
    .prepare(
      `SELECT SUM(fuel_kind = 'e5') AS e5, SUM(fuel_kind = 'e10') AS e10
         FROM fuel_vote WHERE station_id = ?`
    )
    .get(stationId);

  return { e5: row.e5 || 0, e10: row.e10 || 0 };
}

const findByDevice = (stationId, deviceId) =>
  db
    .prepare(
      "SELECT fuel_kind FROM fuel_vote WHERE station_id = ? AND device_id = ? AND fuel_kind IN ('e5','e10')"
    )
    .get(stationId, deviceId) || null;

function upsert({ stationId, deviceId, fuelKind }) {
  const ts = nowISO();
  db.prepare(
    `INSERT INTO fuel_vote (station_id, device_id, fuel_kind, created_at, updated_at)
     VALUES (@stationId, @deviceId, @fuelKind, @ts, @ts)
     ON CONFLICT(station_id, device_id) DO UPDATE SET fuel_kind = @fuelKind, updated_at = @ts`
  ).run({ stationId, deviceId, fuelKind, ts });
}

module.exports = { countsForStation, findByDevice, upsert };
