const { cleanValue, normalizeZip, normalizePhone } = require('../../values');

const FUEL_KEYS = new Set([
  'octane_100',
  'octane_98',
  'octane_95',
  'octane_91',
  'diesel',
  'lpg',
  'cng',
  'adblue',
  'e85',
  'biodiesel',
]);

// Klíče, které aplikace umí pojmenovat (ios ServiceCatalog). Cokoliv jiného by
// se uživateli ukázalo jako holý anglický název sloupce, takže to zahazujeme.
const SERVICE_KEYS = new Set([
  'shop',
  'car_wash',
  'toilets',
  'compressed_air',
  'wheelchair',
  'self_service',
]);

const PAYMENT_PREFIX = 'payment:';

function toCoordinate(raw) {
  if (raw == null || raw === '') return null;
  const value = Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

const normalizeFuels = (fuels = []) =>
  [...new Set(fuels.filter((key) => FUEL_KEYS.has(key)))].sort();

function normalizeServices(services = []) {
  const byKey = new Map();
  for (const service of services) {
    const key = cleanValue(service?.key);
    const value = cleanValue(service?.value) || 'yes';
    if (!key || value === 'no') continue;
    if (!SERVICE_KEYS.has(key) && !key.startsWith(PAYMENT_PREFIX)) continue;
    byKey.set(key, value);
  }
  return [...byKey].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, value }));
}

const oneLine = (raw) => {
  const text = cleanValue(raw);
  return text ? text.replace(/\s+/g, ' ') : null;
};

const LOWERCASE_WORDS = new Set([
  'u', 'v', 've', 'na', 'nad', 'pod', 'za', 'k', 'ke', 'do', 's', 'se', 'a', 'i', 'km', 'ul.',
]);

/**
 * Orlen i Shell posílají názvy verzálkami („CHODOV U KARLOVÝCH VARŮ“). V aplikaci
 * to vypadá jako křik, tak je převedeme na běžné psaní. Tokeny s číslicí („D1“,
 * „8001“) zůstávají, ty se verzálkami píšou správně.
 */
function titleCaseIfShouting(raw) {
  const text = oneLine(raw);
  if (!text || /\p{Ll}/u.test(text) || !/\p{Lu}{3}/u.test(text)) return text;

  const capitalize = (word) => word.charAt(0).toLocaleUpperCase('cs') + word.slice(1);

  return text
    .split(' ')
    .map((token, index) => {
      if (/\d/.test(token)) return token;
      const lower = token.toLocaleLowerCase('cs');
      if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      // Velké písmeno patří i za spojovník a lomítko („Brno-Heršpická“).
      return lower.replace(/(^|[-/])(\p{L})/gu, (_, prefix, letter) => prefix + capitalize(letter));
    })
    .join(' ');
}

/** Sjednotí, co adaptér posbírá, do tvaru, se kterým počítá station-sync. */
function makeRecord({
  externalId,
  brand = null,
  name = null,
  lat = null,
  lon = null,
  address = null,
  city = null,
  zip = null,
  phone = null,
  worktime = null,
  fuels = [],
  services = [],
}) {
  return {
    externalId: String(externalId),
    brand: cleanValue(brand),
    name: oneLine(name),
    lat: toCoordinate(lat),
    lon: toCoordinate(lon),
    address: oneLine(address),
    city: oneLine(city),
    zip: normalizeZip(zip),
    phone: normalizePhone(phone),
    worktime: oneLine(worktime),
    fuels: normalizeFuels(fuels),
    services: normalizeServices(services),
  };
}

const flag = (value) => value === 1 || value === '1' || value === true;

module.exports = {
  makeRecord,
  toCoordinate,
  oneLine,
  titleCaseIfShouting,
  flag,
  FUEL_KEYS,
  SERVICE_KEYS,
};
