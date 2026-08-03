// Validace vstupů z aplikace. Bez knihoven – pravidel je málo a chceme mít
// plnou kontrolu nad českými chybovými hláškami, které se ukazují uživateli.

const REPORT_TYPES = ['price', 'closed', 'fuel', 'location', 'other'];
const FUEL_KINDS = ['e5', 'e10', 'unknown'];
const REVIEW_STATUSES = ['published', 'hidden'];
const REPORT_STATUSES = ['new', 'in_review', 'resolved', 'rejected'];

const MAX_COMMENT = 1000;
const MAX_AUTHOR = 40;
const MAX_NOTE = 1000;
const MAX_FUEL_NAME = 60;

/** Chyba s HTTP kódem a hláškou, kterou lze bez úprav zobrazit uživateli. */
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.field = field;
  }
}

/** Ořeže bílé znaky, prázdný string bere jako "nevyplněno" (null). */
function cleanText(value, { max, field, label }) {
  if (value == null) return null;
  if (typeof value !== 'string') throw new ValidationError(`Pole ${label} musí být text.`, field);
  // Sjednotíme konce řádků a zahodíme řídicí znaky, které nemají v textu co dělat.
  const trimmed = value
    .replace(/\r\n/g, '\n')
    // ponecháme jen \n a \t, ostatní řídicí znaky pryč
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new ValidationError(`${label} je moc dlouhý – maximum je ${max} znaků.`, field);
  }
  return trimmed;
}

function requireDeviceId(body) {
  const id = typeof body?.device_id === 'string' ? body.device_id.trim() : '';
  // iOS posílá UUID; nechceme z toho dělat vědu, ale nesmí to být prázdné ani obří.
  if (id.length < 8 || id.length > 100) {
    throw new ValidationError('Nepodařilo se rozpoznat zařízení. Zkus aplikaci restartovat.', 'device_id');
  }
  return id;
}

/** Kladné celé číslo z URL parametru (obecně – hlášení, hodnocení, …). */
function parseId(raw, label = 'ID') {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`Neplatné ${label}.`, 'id');
  }
  return id;
}

function parseStationId(raw) {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Neplatné ID benzínky.', 'station_id');
  }
  return id;
}

function parseReview(body) {
  const deviceId = requireDeviceId(body);
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ValidationError('Vyber prosím hodnocení od 1 do 5 hvězdiček.', 'rating');
  }
  return {
    deviceId,
    rating,
    comment: cleanText(body?.comment, { max: MAX_COMMENT, field: 'comment', label: 'Komentář' }),
    author: cleanText(body?.author, { max: MAX_AUTHOR, field: 'author', label: 'Přezdívka' }),
  };
}

function parseReport(body) {
  const deviceId = requireDeviceId(body);
  const type = typeof body?.type === 'string' ? body.type.trim() : '';
  if (!REPORT_TYPES.includes(type)) {
    throw new ValidationError('Vyber prosím, o jakou nesrovnalost jde.', 'type');
  }

  const note = cleanText(body?.note, { max: MAX_NOTE, field: 'note', label: 'Poznámka' });
  const fuelName = cleanText(body?.fuel_name, { max: MAX_FUEL_NAME, field: 'fuel_name', label: 'Palivo' });

  let claimedPrice = null;
  if (body?.claimed_price != null && body.claimed_price !== '') {
    claimedPrice = Number(body.claimed_price);
    if (!Number.isFinite(claimedPrice) || claimedPrice <= 0 || claimedPrice > 200) {
      throw new ValidationError('Cena musí být číslo v rozmezí 0–200 Kč/l.', 'claimed_price');
    }
    claimedPrice = Math.round(claimedPrice * 100) / 100;
  }

  // U "jiné nesrovnalosti" bez popisu bychom nevěděli, co kontrolovat.
  if (type === 'other' && !note) {
    throw new ValidationError('Napiš prosím krátce, co je špatně.', 'note');
  }
  if (type === 'price' && claimedPrice == null && !note) {
    throw new ValidationError('Doplň správnou cenu, nebo napiš poznámku.', 'claimed_price');
  }

  return { deviceId, type, fuelName, claimedPrice, note };
}

function parseFuelVote(body) {
  const deviceId = requireDeviceId(body);
  const fuelKind = typeof body?.fuel_kind === 'string' ? body.fuel_kind.trim() : '';
  if (!FUEL_KINDS.includes(fuelKind)) {
    throw new ValidationError('Neplatná odpověď – vyber E5, E10 nebo „nevím“.', 'fuel_kind');
  }
  return { deviceId, fuelKind };
}

module.exports = {
  ValidationError,
  parseId,
  parseStationId,
  parseReview,
  parseReport,
  parseFuelVote,
  requireDeviceId,
  cleanText,
  REPORT_TYPES,
  FUEL_KINDS,
  REVIEW_STATUSES,
  REPORT_STATUSES,
};
