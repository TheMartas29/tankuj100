const { ValidationError } = require('../errors');
const { FUEL_BITS } = require('../fuel-flags');
const { cleanText, parseId, requireDeviceId, requireOneOf } = require('./primitives');
const { checkContent } = require('./content');

// `content` = uživatel nahlásil cizí komentář jako nevhodný. Bez téhle možnosti by
// Apple aplikaci s veřejnými komentáři nepustil (App Review Guideline 1.2).
const REPORT_TYPES = ['closed', 'fuel', 'location', 'content', 'other'];
const FUEL_KINDS = ['e5', 'e10'];
const REVIEW_STATUSES = ['published', 'hidden'];
const REPORT_STATUSES = ['new', 'in_review', 'resolved', 'rejected'];
const STATION_REQUEST_STATUSES = ['new', 'approved', 'rejected'];

const LIMITS = {
  comment: 1000,
  author: 40,
  note: 1000,
  fuelName: 60,
  adminNote: 1000,
  brandName: 80,
  stationName: 120,
  city: 80,
  address: 160,
};

function cleanAndCheck(value, { max, field, label }) {
  return checkContent(cleanText(value, { max, field, label }), { field, label });
}

function parseReview(body) {
  const deviceId = requireDeviceId(body);
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ValidationError('Vyberte prosím hodnocení od 1 do 5 hvězdiček.', 'rating');
  }

  return {
    deviceId,
    rating,
    comment: cleanAndCheck(body?.comment, { max: LIMITS.comment, field: 'comment', label: 'Komentář' }),
    author: cleanAndCheck(body?.author, { max: LIMITS.author, field: 'author', label: 'Přezdívka' }),
  };
}

function parseReport(body) {
  const deviceId = requireDeviceId(body);
  const type = requireOneOf(body?.type, REPORT_TYPES, {
    field: 'type',
    message: 'Vyberte prosím, o jakou nesrovnalost jde.',
  });

  const note = cleanAndCheck(body?.note, { max: LIMITS.note, field: 'note', label: 'Poznámka' });
  const fuelName = cleanText(body?.fuel_name, { max: LIMITS.fuelName, field: 'fuel_name', label: 'Palivo' });
  const reviewId = type === 'content' ? parseId(body?.review_id, 'ID hodnocení') : null;

  if (type === 'other' && !note) {
    throw new ValidationError('Napište prosím krátce, co je špatně.', 'note');
  }

  return { deviceId, type, fuelName, note, reviewId };
}

function parseFuelVote(body) {
  return {
    deviceId: requireDeviceId(body),
    fuelKind: requireOneOf(body?.fuel_kind, FUEL_KINDS, {
      field: 'fuel_kind',
      message: 'Neplatná odpověď – vyberte E5 nebo E10.',
    }),
  };
}

function parseAdminNote(value) {
  return cleanText(value, { max: LIMITS.adminNote, field: 'admin_note', label: 'Poznámka' });
}

// Ručně editovatelné sloupce stanice a jejich maximální délky. `osm_id`, `data_source`
// ani vazby na paliva tu schválně nejsou – ty patří importu z OpenStreetMap.
const STATION_TEXT_FIELDS = {
  brand_name: 80,
  name: 120,
  city: 80,
  address: 160,
  zip: 20,
  phone: 40,
  worktime: 250,
  services: 500,
  payments: 500,
  foursquare_id: 60,
  status: 50,
  error: 250,
};

function parseCoordinate(raw, { limit, field }) {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  // Přes `Number()` samotné to nejde: `Number(null)`, `Number('')` i `Number([])`
  // je nula, takže by chybějící souřadnice prošla jako platný rovník.
  const value = text === '' ? NaN : Number(text.replace(',', '.'));

  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    throw new ValidationError(`Neplatná souřadnice ${field}.`, field);
  }
  return value;
}

function parseOptionalId(raw, field) {
  if (raw === '' || raw == null) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`Pole ${field} musí být celé kladné číslo.`, field);
  }
  return value;
}

/**
 * Ruční úprava stanice z administrace. Kontroluje se i to, co by přes UI přijít
 * nemělo: bez typové kontroly by objekt v poli spadl až na zápisu do SQLite (500)
 * a stanice bez souřadnic by rozbila mapu úplně všem – iOS aplikace `lat`/`lon`
 * dekóduje jako povinná čísla a jediný vadný záznam shodí celý seznam.
 */
function parseStationInput(body = {}) {
  const row = {
    id: parseId(body?.id, 'ID benzínky'),
    lat: parseCoordinate(body?.lat, { limit: 90, field: 'lat' }),
    lon: parseCoordinate(body?.lon, { limit: 180, field: 'lon' }),
    brand_id: parseOptionalId(body?.brand_id, 'brand_id'),
    wikimapia_id: parseOptionalId(body?.wikimapia_id, 'wikimapia_id'),
  };

  for (const [field, max] of Object.entries(STATION_TEXT_FIELDS)) {
    const raw = typeof body?.[field] === 'number' ? String(body[field]) : body?.[field];
    row[field] = cleanText(raw, { max, field, label: field });
  }
  return row;
}

/**
 * Paliva u žádosti. Číselník je jediný zdroj pravdy `fuel-flags.js` – co v něm není,
 * by se do bitové masky stejně nevešlo a v aplikaci by po schválení zmizelo.
 */
function parseFuelKeys(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError('Vyberte prosím aspoň jedno palivo, které tam čepují.', 'fuels');
  }

  const keys = [];
  for (const item of raw) {
    const key = typeof item === 'string' ? item.trim() : '';
    if (FUEL_BITS[key] === undefined) {
      throw new ValidationError('Některé z vybraných paliv neznáme. Zkuste aplikaci aktualizovat.', 'fuels');
    }
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * Žádost o přidání benzínky. Značka ani název povinné nejsou – uživatel u sjezdu
 * z dálnice často ví jen to, že tam pumpa je; dohledat ji je práce administrace.
 * Souřadnice povinné jsou, bez nich by žádost nešlo ani ověřit, ani schválit.
 */
function parseStationRequest(body = {}) {
  return {
    deviceId: requireDeviceId(body),
    lat: parseCoordinate(body?.lat, { limit: 90, field: 'lat' }),
    lon: parseCoordinate(body?.lon, { limit: 180, field: 'lon' }),
    brandName: cleanAndCheck(body?.brand_name, {
      max: LIMITS.brandName,
      field: 'brand_name',
      label: 'Značka',
    }),
    name: cleanAndCheck(body?.name, { max: LIMITS.stationName, field: 'name', label: 'Název' }),
    city: cleanAndCheck(body?.city, { max: LIMITS.city, field: 'city', label: 'Obec' }),
    address: cleanAndCheck(body?.address, { max: LIMITS.address, field: 'address', label: 'Adresa' }),
    fuels: parseFuelKeys(body?.fuels),
    note: cleanAndCheck(body?.note, { max: LIMITS.note, field: 'note', label: 'Poznámka' }),
  };
}

function parseStatusUpdate(body, allowed) {
  const status = body?.status;
  if (!allowed.includes(status)) {
    throw new ValidationError(`Stav musí být jeden z: ${allowed.join(', ')}.`, 'status');
  }
  return status;
}

/** Hodnota `status` z query stringu; `all` (i chybějící) znamená bez filtru. */
function parseStatusFilter(raw, allowed) {
  const status = typeof raw === 'string' ? raw : 'all';
  if (status !== 'all' && !allowed.includes(status)) return null;
  return status;
}

module.exports = {
  parseReview,
  parseReport,
  parseFuelVote,
  parseAdminNote,
  parseStationInput,
  parseStationRequest,
  parseStatusUpdate,
  parseStatusFilter,
  REVIEW_STATUSES,
  REPORT_STATUSES,
  STATION_REQUEST_STATUSES,
};
