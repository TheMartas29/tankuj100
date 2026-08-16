const stationRequestRepo = require('../repositories/station-request.repo');
const { AppError, NotFoundError, TooManyRequestsError, ValidationError } = require('../errors');
const { distanceMeters } = require('../geo');
const { FUEL_BITS } = require('../fuel-flags');
const { notifyNewStationRequest } = require('../mailer');
const { parseAdminNote } = require('../validation/inputs');
const mapCache = require('./map-cache');

const MAX_PER_DEVICE_PER_DAY = 3;
// Sto padesát metrů je zhruba dvojnásobek areálu pumpy: co je blíž, je skoro jistě
// ta samá stanice zaměřená z druhé strany parkoviště.
const DUPLICATE_RADIUS_M = 150;
const METERS_PER_DEGREE_LAT = 111320;

/**
 * Obdélník kolem bodu, do kterého se vejde celý kruh o poloměru `radiusMeters`.
 * Stupeň zeměpisné délky je u nás krátký (asi 71 km), takže se musí dělit kosinem –
 * s pevnými ±0,002° by kontrola duplicit na severu část okolí minula.
 */
function boundingBox(lat, lon, radiusMeters) {
  const dLat = radiusMeters / METERS_PER_DEGREE_LAT;
  const dLon = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}

/** Nejbližší kandidát do `DUPLICATE_RADIUS_M`, nebo `null`. */
function nearest(candidates, lat, lon) {
  let best = null;
  for (const candidate of candidates) {
    const distance = distanceMeters(lat, lon, candidate.lat, candidate.lon);
    if (distance <= DUPLICATE_RADIUS_M && (!best || distance < best.distance)) {
      best = { ...candidate, distance };
    }
  }
  return best;
}

const describe = (row) =>
  [row.brand_name, row.name, row.city].filter(Boolean).join(', ') || 'bez názvu';

const roundedDistance = (meters) => Math.max(1, Math.round(meters));

/**
 * Duplicita se hledá proti stanicím i proti nevyřízeným žádostem. Bez druhé části
 * by po zveřejnění nové pumpy dorazilo deset stejných žádostí, než by je admin
 * stihl vyřídit.
 */
function findDuplicate(lat, lon) {
  const box = boundingBox(lat, lon, DUPLICATE_RADIUS_M);

  const station = nearest(stationRequestRepo.stationsInBox(box), lat, lon);
  if (station) {
    return new AppError(
      `Tuhle benzínku už v aplikaci máme – ${describe(station)} je jen ${roundedDistance(station.distance)} m od zadaného místa. ` +
        'Pokud u ní něco nesedí, dejte nám prosím vědět přes hlášení nesrovnalosti.',
      { status: 409, code: 'duplicate_station' }
    );
  }

  const pending = nearest(stationRequestRepo.pendingInBox(box), lat, lon);
  if (pending) {
    return new AppError(
      `Stejnou benzínku už někdo navrhl – ${describe(pending)}, ${roundedDistance(pending.distance)} m od zadaného místa. ` +
        'Žádost čeká na schválení, přidáme ji, jakmile ji ověříme.',
      { status: 409, code: 'duplicate_station' }
    );
  }
  return null;
}

function submit(input) {
  if (stationRequestRepo.countRecentForDevice(input.deviceId) >= MAX_PER_DEVICE_PER_DAY) {
    throw new TooManyRequestsError(
      'Dnes jste poslali už tři návrhy. Zkuste to prosím zítra – všechny procházíme ručně.',
      'too_many_station_requests'
    );
  }

  const duplicate = findDuplicate(input.lat, input.lon);
  if (duplicate) throw duplicate;

  const request = stationRequestRepo.create(input);
  notifyNewStationRequest({ request }).catch(() => {});
  return request;
}

const listForDevice = (deviceId) => stationRequestRepo.listForDevice(deviceId);

/** Uložený JSON paliv; co mezitím z číselníku vypadlo, se zahodí. */
function fuelsOf(request) {
  try {
    const parsed = JSON.parse(request.fuels || '[]');
    return Array.isArray(parsed) ? parsed.filter((key) => FUEL_BITS[key] !== undefined) : [];
  } catch {
    return [];
  }
}

const listForAdmin = (status) =>
  stationRequestRepo.listForAdmin({ status }).map((row) => ({ ...row, fuels: fuelsOf(row) }));

function requireRequest(id) {
  const request = stationRequestRepo.findById(id);
  if (!request) throw new NotFoundError('Žádost nenalezena.');
  return request;
}

function approve(request, adminNote) {
  if (request.station_id) {
    throw new AppError('Tahle žádost už schválená je, stanice z ní vznikla dřív.', {
      status: 409,
      code: 'already_approved',
    });
  }

  const fuels = fuelsOf(request);
  if (!fuels.length) {
    throw new ValidationError('Žádost nemá ani jedno známé palivo, takhle stanici založit nejde.', 'fuels');
  }

  const stationId = stationRequestRepo.approve(request, fuels, adminNote);
  // Nová stanice musí být v mapě hned – jinak by ji uživatel po schválení ještě
  // minutu nenašel a admin by si myslel, že se přidání nepovedlo.
  mapCache.invalidate();
  return stationId;
}

/**
 * Změna stavu žádosti z administrace. Zamítnutí bez důvodu neprojde: `admin_note`
 * je u něj jediné, co se uživatel v aplikaci dozví.
 */
function setStatus(id, status, rawAdminNote) {
  const request = requireRequest(id);
  const adminNote = parseAdminNote(rawAdminNote);

  if (status === 'rejected' && !adminNote) {
    throw new ValidationError(
      'Napište prosím důvod zamítnutí – uvidí ho v aplikaci ten, kdo žádost poslal.',
      'admin_note'
    );
  }
  if (status === 'approved') return { status, station_id: approve(request, adminNote) };

  stationRequestRepo.setStatus(id, status, adminNote);
  return { status, station_id: request.station_id };
}

function remove(id) {
  if (stationRequestRepo.remove(id).changes === 0) {
    throw new NotFoundError('Žádost nenalezena.');
  }
}

module.exports = { submit, listForDevice, listForAdmin, setStatus, remove };
