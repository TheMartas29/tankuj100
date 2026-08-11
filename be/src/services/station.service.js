const stationRepo = require('../repositories/station.repo');
const { MissingStationError, NotFoundError, ValidationError } = require('../errors');
const { optionalNumber } = require('../validation/primitives');

function requireStation(stationId) {
  const station = stationRepo.findById(stationId);
  if (!station) throw new MissingStationError();
  return station;
}

const mapMarkers = () =>
  stationRepo.listForMap().map((row) => ({
    id: row.id,
    lat: row.lat,
    lon: row.lon,
    brand_name: row.brand_name,
    rating_avg: row.rating_count ? row.rating_avg : null,
    rating_count: row.rating_count || 0,
    has_98: row.has_98,
    has_100: row.has_100,
  }));

function detail(stationId) {
  const station = requireStation(stationId);
  return {
    ...station,
    // `services` je i starý textový sloupec po fuelo.net (dnes prázdný). Schválně ho
    // přepisujeme strukturovanými daty z OSM, ať aplikace čte jen jedno místo –
    // způsoby placení jsou mezi nimi jako klíče `payment:*`.
    fuels: stationRepo.listFuelKeys(stationId),
    services: stationRepo.listServiceTags(stationId),
  };
}

const listForAdmin = () => stationRepo.listAll();

const NUMERIC_FIELDS = ['lat', 'lon', 'brand_id', 'wikimapia_id'];
const TEXT_FIELDS = [
  'brand_name', 'name', 'city', 'address', 'zip', 'phone',
  'worktime', 'services', 'payments', 'foursquare_id', 'status', 'error',
];

/**
 * Ruční úprava stanice z adminu. Zapisují se jen pole editovatelná v UI – `osm_id`,
 * `data_source` ani vazby na paliva patří importu z OSM (scripts/import-osm.js).
 */
function save(body = {}) {
  if (body.id == null || body.id === '') throw new ValidationError('Stanice musí mít ID.', 'id');

  const row = { id: Number(body.id) };
  if (!Number.isFinite(row.id)) throw new ValidationError('ID musí být číslo.', 'id');

  for (const field of NUMERIC_FIELDS) row[field] = optionalNumber(body[field]);
  for (const field of TEXT_FIELDS) row[field] = body[field] ?? null;

  stationRepo.upsert(row);
}

function remove(stationId) {
  if (stationRepo.remove(stationId).changes === 0) {
    throw new NotFoundError('Stanice nenalezena.');
  }
}

module.exports = { requireStation, mapMarkers, detail, listForAdmin, save, remove };
