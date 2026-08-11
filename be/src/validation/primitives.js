const { ValidationError } = require('../errors');

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanText(value, { max, field, label }) {
  if (value == null) return null;
  if (typeof value !== 'string') throw new ValidationError(`Pole ${label} musí být text.`, field);

  const trimmed = value.replace(/\r\n/g, '\n').replace(CONTROL_CHARS, '').trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new ValidationError(`${label} je moc dlouhý – maximum je ${max} znaků.`, field);
  }
  return trimmed;
}

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

function requireDeviceId(body) {
  const id = typeof body?.device_id === 'string' ? body.device_id.trim() : '';
  if (id.length < 8 || id.length > 100) {
    throw new ValidationError('Nepodařilo se rozpoznat zařízení. Zkuste aplikaci restartovat.', 'device_id');
  }
  return id;
}

function requireOneOf(value, allowed, { field, message }) {
  const picked = typeof value === 'string' ? value.trim() : '';
  if (!allowed.includes(picked)) throw new ValidationError(message, field);
  return picked;
}

function optionalNumber(value) {
  return value === '' || value == null ? null : Number(value);
}

module.exports = { cleanText, parseId, parseStationId, requireDeviceId, requireOneOf, optionalNumber };
