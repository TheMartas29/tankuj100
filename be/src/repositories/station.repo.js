const { db } = require('../db');
const { PREMIUM_FUEL_COLUMNS, publishedReviewAggregate, FUEL_ORDER } = require('./fragments');

const COLUMNS = [
  'id', 'lat', 'lon', 'brand_name', 'brand_id', 'name',
  'city', 'address', 'zip', 'phone', 'worktime',
  'services', 'payments', 'foursquare_id',
  'wikimapia_id', 'status', 'error',
];

const upsertStatement = db.prepare(
  `INSERT INTO station (${COLUMNS.join(', ')})
   VALUES (${COLUMNS.map((c) => `@${c}`).join(', ')})
   ON CONFLICT(id) DO UPDATE SET
     ${COLUMNS.filter((c) => c !== 'id').map((c) => `${c}=@${c}`).join(', ')}`
);

const listAll = () =>
  db
    .prepare(
      `SELECT s.*, ${PREMIUM_FUEL_COLUMNS}
         FROM station s
        ORDER BY s.brand_name, s.city`
    )
    .all();

const listForMap = () =>
  db
    .prepare(
      `SELECT s.id, s.lat, s.lon, s.brand_name, s.worktime,
              ${publishedReviewAggregate('ROUND(AVG(r.rating), 2)')} AS rating_avg,
              ${publishedReviewAggregate('COUNT(*)')}                AS rating_count,
              ${PREMIUM_FUEL_COLUMNS}
         FROM station s`
    )
    .all();

// Paliva a služby všech stanic naráz, ne poddotazem na každý řádek. Při stotisíci
// stanicích je rozdíl mezi dvěma průchody tabulkou a stotisíci dotazy zásadní.
const allFuelKeys = () => db.prepare('SELECT station_id, fuel_key FROM station_fuel').all();

const FILTERABLE_TAGS = ['shop', 'car_wash', 'toilets'];

const allServiceTags = () =>
  db
    .prepare(
      `SELECT station_id, tag_key FROM station_tag
        WHERE tag_key IN (${FILTERABLE_TAGS.map(() => '?').join(',')})`
    )
    .all(...FILTERABLE_TAGS);

const findById = (id) => db.prepare('SELECT * FROM station WHERE id = ?').get(id);

const listFuelKeys = (id) =>
  db
    .prepare(`SELECT fuel_key FROM station_fuel WHERE station_id = ? ORDER BY ${FUEL_ORDER}`)
    .all(id)
    .map((row) => row.fuel_key);

const listServiceTags = (id) =>
  db
    .prepare(
      // Otevírací doba jde ven zvlášť jako `worktime`; kdyby zůstala i mezi službami,
      // aplikace by ji vypsala dvakrát. Interní tagy `osm:*` uživateli nepatří –
      // a stejně tak `geocoded`, kam si skript zapisuje, odkud stanici dohledal
      // adresu. Ten se sem propsal a aplikace ho vypisovala jako službu
      // „Geocoded – Nominatim“ (ve vzorku 60 stanic u 13 z nich).
      `SELECT tag_key AS key, tag_value AS value FROM station_tag
        WHERE station_id = ? AND tag_key NOT LIKE 'osm:%'
          AND tag_key NOT IN ('opening_hours', 'geocoded')
        ORDER BY tag_key`
    )
    .all(id);

const remove = (id) => db.prepare('DELETE FROM station WHERE id = ?').run(id);

const upsert = (row) => upsertStatement.run(row);

module.exports = {
  listAll,
  listForMap,
  allFuelKeys,
  allServiceTags,
  findById,
  listFuelKeys,
  listServiceTags,
  remove,
  upsert,
};
