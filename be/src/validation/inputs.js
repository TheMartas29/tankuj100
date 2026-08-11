const { ValidationError } = require('../errors');
const { cleanText, parseId, requireDeviceId, requireOneOf } = require('./primitives');
const { checkContent } = require('./content');

// `content` = uživatel nahlásil cizí komentář jako nevhodný. Bez téhle možnosti by
// Apple aplikaci s veřejnými komentáři nepustil (App Review Guideline 1.2).
const REPORT_TYPES = ['closed', 'fuel', 'location', 'content', 'other'];
const FUEL_KINDS = ['e5', 'e10'];
const REVIEW_STATUSES = ['published', 'hidden'];
const REPORT_STATUSES = ['new', 'in_review', 'resolved', 'rejected'];

const LIMITS = {
  comment: 1000,
  author: 40,
  note: 1000,
  fuelName: 60,
  adminNote: 1000,
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
  parseStatusUpdate,
  parseStatusFilter,
  REVIEW_STATUSES,
  REPORT_STATUSES,
};
