const { db } = require('../db');

const STATION_FIELDS = [
  'id', 'lat', 'lon', 'brand_name', 'name', 'city', 'address', 'zip',
  'phone', 'worktime', 'services', 'payments', 'data_source',
];

// Tagy, které nepatří značce: původ z OSM, otevírací doba (drží ji sloupec worktime)
// a značka od geokodéru. Zbytek stanice přebírá ze zdroje.
const KEPT_TAG_KEYS = "tag_key LIKE 'osm:%' OR tag_key IN ('opening_hours', 'geocoded')";

const listStations = () =>
  db.prepare(`SELECT ${STATION_FIELDS.join(', ')} FROM station`).all();

const listLinks = (source) =>
  db.prepare('SELECT station_id, external_id FROM station_source WHERE source = ?').all(source);

const countLinks = (source) =>
  db.prepare('SELECT COUNT(*) AS count FROM station_source WHERE source = ?').get(source).count;

const listFuels = () => db.prepare('SELECT station_id, fuel_key FROM station_fuel').all();

const listTags = () => db.prepare('SELECT station_id, tag_key, tag_value FROM station_tag').all();

const INSERT_FIELDS = STATION_FIELDS.filter((field) => field !== 'id');

const insertStatement = db.prepare(
  `INSERT INTO station (${INSERT_FIELDS.join(', ')}, status)
   VALUES (${INSERT_FIELDS.map((field) => `@${field}`).join(', ')}, 'OK')`
);

const insertStation = (row) => Number(insertStatement.run(row).lastInsertRowid);

function updateStation(id, changes) {
  const fields = Object.keys(changes);
  if (!fields.length) return;
  db.prepare(`UPDATE station SET ${fields.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id`).run({
    ...changes,
    id,
  });
}

const deleteFuels = db.prepare('DELETE FROM station_fuel WHERE station_id = ?');
const insertFuel = db.prepare('INSERT INTO station_fuel (station_id, fuel_key) VALUES (?, ?)');

function replaceFuels(stationId, fuels) {
  deleteFuels.run(stationId);
  for (const fuel of fuels) insertFuel.run(stationId, fuel);
}

const deleteTags = db.prepare(
  `DELETE FROM station_tag WHERE station_id = ? AND NOT (${KEPT_TAG_KEYS})`
);
const insertTag = db.prepare(
  'INSERT INTO station_tag (station_id, tag_key, tag_value) VALUES (?, ?, ?)'
);

function replaceServiceTags(stationId, tags) {
  deleteTags.run(stationId);
  for (const tag of tags) insertTag.run(stationId, tag.key, tag.value);
}

const upsertLinkStatement = db.prepare(
  `INSERT INTO station_source (station_id, source, external_id, last_seen_at)
   VALUES (@station_id, @source, @external_id, @last_seen_at)
   ON CONFLICT(source, external_id)
   DO UPDATE SET station_id = @station_id, last_seen_at = @last_seen_at`
);

const upsertLink = (link) => upsertLinkStatement.run(link);

const inTransaction = (work) => db.transaction(work)();

module.exports = {
  listStations,
  listLinks,
  countLinks,
  listFuels,
  listTags,
  insertStation,
  updateStation,
  replaceFuels,
  replaceServiceTags,
  upsertLink,
  inTransaction,
};
