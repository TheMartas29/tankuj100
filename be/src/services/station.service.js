const stationRepo = require('../repositories/station.repo');
const { MissingStationError, NotFoundError } = require('../errors');
const { parseStationInput } = require('../validation/inputs');
const { fuelMaskFor, serviceMaskFor } = require('../fuel-flags');
const mapCache = require('./map-cache');

function requireStation(stationId) {
  const station = stationRepo.findById(stationId);
  if (!station) throw new MissingStationError();
  return station;
}

/** Seskupí `[{station_id, x}]` na `Map<station_id, x[]>` jedním průchodem. */
function groupByStation(rows, valueOf) {
  const grouped = new Map();
  for (const row of rows) {
    const existing = grouped.get(row.station_id);
    if (existing) existing.push(valueOf(row));
    else grouped.set(row.station_id, [valueOf(row)]);
  }
  return grouped;
}

function buildMapMarkers() {
  const fuelsByStation = groupByStation(stationRepo.allFuelKeys(), (row) => row.fuel_key);
  const tagsByStation = groupByStation(stationRepo.allServiceTags(), (row) => row.tag_key);

  return stationRepo.listForMap().map((row) => ({
    id: row.id,
    lat: row.lat,
    lon: row.lon,
    brand_name: row.brand_name,
    rating_avg: row.rating_count ? row.rating_avg : null,
    rating_count: row.rating_count || 0,
    // `has_98` a `has_100` zůstávají kvůli verzi 1.0, která je v App Storu a nová
    // pole nezná. Odebrat je půjde, až vydané buildy bez `f` vymřou.
    has_98: row.has_98,
    has_100: row.has_100,
    f: fuelMaskFor(fuelsByStation.get(row.id) || []),
    s: serviceMaskFor(tagsByStation.get(row.id) || [], row.worktime),
  }));
}

/**
 * Rovnou jako řetězec, ne pole: uložený JSON se pak posílá tak, jak je, a nemusí
 * se při každém requestu skládat znovu.
 */
const mapMarkersJSON = () => mapCache.remember(() => JSON.stringify(buildMapMarkers()));

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

/** Ruční úprava stanice z adminu; co se smí měnit, hlídá `parseStationInput`. */
function save(body) {
  stationRepo.upsert(parseStationInput(body));
  mapCache.invalidate();
}

function remove(stationId) {
  if (stationRepo.remove(stationId).changes === 0) {
    throw new NotFoundError('Stanice nenalezena.');
  }
  mapCache.invalidate();
}

module.exports = { requireStation, mapMarkersJSON, detail, listForAdmin, save, remove };
