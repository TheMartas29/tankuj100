const { getText, mapSequential } = require('./lib/http');
const { makeRecord, flag } = require('./lib/record');

const MAP_PAGE = 'https://km-prona.cz/cerpaci-stanice/interaktivni-mapa';
const DETAIL_BASE = 'https://km-prona.cz/seznam-stanic/';

const FUEL_BY_IMAGE = {
  natural_98: 'octane_98',
  natural_95: 'octane_95',
  diesel_pro: 'diesel',
  dpro_plus: 'diesel',
  adblue: 'adblue',
  lpg: 'lpg',
};

const SERVICE_FLAGS = [
  ['washing', 'car_wash'],
  ['wash_line', 'car_wash'],
  ['refreshment', 'shop'],
];

const PAYMENT_FLAGS = [
  ['ccs', 'ccs'],
  ['dkv', 'dkv'],
  ['cards', 'cards'],
];

// `var stations = JSON.parse("…")` – nejdřív se rozbalí JS řetězec, teprve pak JSON.
function extractStations(html) {
  const match = html.match(/var\s+stations\s*=\s*JSON\.parse\(\s*("(?:\\.|[^"\\])*")\s*\)/);
  if (!match) throw new Error('v HTML se nenašlo pole stanic');
  return JSON.parse(JSON.parse(match[1]));
}

/** Adresa je jeden řetězec „ulice čp, obec PSČ“, PSČ ani obec zvlášť nejsou. */
function splitAddress(raw) {
  const text = String(raw || '').trim();
  if (!text) return { address: null, city: null, zip: null };

  const [street, rest] = text.includes(',') ? [text.slice(0, text.indexOf(',')), text.slice(text.indexOf(',') + 1)] : [text, ''];
  const tail = rest.trim();
  const zip = tail.match(/(\d{3}\s?\d{2})\s*$/);
  const city = zip ? tail.slice(0, zip.index).trim() : tail;

  return { address: street.trim() || null, city: city || null, zip: zip ? zip[1] : null };
}

function fuelsFromDetail(html) {
  const fuels = [];
  for (const match of html.matchAll(/\/base\/images\/fuels\/([a-z0-9_]+)\.(?:jpg|png|svg)/gi)) {
    const fuel = FUEL_BY_IMAGE[match[1].toLowerCase()];
    if (fuel) fuels.push(fuel);
  }
  return fuels;
}

async function fetchStations({ limit = null } = {}) {
  const all = extractStations(await getText(MAP_PAGE));
  const wanted = limit ? all.slice(0, limit) : all;

  return mapSequential(wanted, async (station) => {
    const slug = String(station.station_address || '').trim();
    const detail = slug ? await getText(DETAIL_BASE + encodeURIComponent(slug)) : '';
    const place = splitAddress(station.address);

    return makeRecord({
      externalId: station.idstation,
      name: station.station_name,
      // `Lon` chodí s mezerou na začátku, makeRecord si ji ořízne.
      lat: station.Lat,
      lon: station.Lon,
      address: place.address,
      city: place.city,
      zip: place.zip,
      phone: station.phone,
      worktime: station.operating_time,
      fuels: [...fuelsFromDetail(detail), ...(flag(station.lpg) ? ['lpg'] : [])],
      services: [
        ...SERVICE_FLAGS.filter(([field]) => flag(station[field])).map(([, key]) => ({ key, value: 'yes' })),
        ...PAYMENT_FLAGS.filter(([field]) => flag(station[field])).map(([, method]) => ({
          key: `payment:${method}`,
          value: 'yes',
        })),
      ],
    });
  });
}

module.exports = {
  slug: 'km-prona',
  brand: 'KM-PRONA',
  attribution: 'KM-PRONA (km-prona.cz)',
  fetchStations,
};
