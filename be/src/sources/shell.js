const { getJson, mapSequential } = require('./lib/http');
const { makeRecord, titleCaseIfShouting } = require('./lib/record');

const BASE = 'https://shellretaillocator.geoapp.me/api/v2/locations';
const CZ_BOUNDS = { sw: [48.5, 12.0], ne: [51.1, 18.9] };
const MAX_DEPTH = 12;

const FUEL_BY_KEY = {
  super_premium_gasoline: 'octane_100',
  premium_gasoline: 'octane_95',
  fuelsave_midgrade_gasoline: 'octane_95',
  regular_gasoline: 'octane_95',
  premium_diesel: 'diesel',
  fuelsave_regular_diesel: 'diesel',
  regular_diesel: 'diesel',
  diesel: 'diesel',
  lpg: 'lpg',
  autogas: 'lpg',
  cng: 'cng',
  adblue: 'adblue',
};

const SERVICE_BY_AMENITY = {
  carwash: 'car_wash',
  jetwash: 'car_wash',
  selectshop: 'shop',
  shop: 'shop',
  standard_toilet: 'toilets',
  disabled_toilet: 'toilets',
  air_and_water: 'compressed_air',
  disabled_facilities: 'wheelchair',
};

const PAYMENT_BY_AMENITY = {
  apple_pay: 'apple_pay',
  google_pay: 'google_pay',
  credit_card: 'credit_cards',
  credit_card_general: 'credit_cards',
  mobile_payment_visa: 'visa',
  mobile_payment_mastercard: 'mastercard',
  mobile_payment_maestro: 'maestro',
  mobile_payment_amex: 'american_express',
  mobile_payment_diners: 'diners_club',
  b2b_shell_card_ota: 'euroshell',
  fuel_card: 'fuel_cards',
};

const ADBLUE_AMENITIES = new Set(['adblue_pack', 'adblue_pump', 'adblue_dispenser']);

const DAY_LABELS = { Mon: 'Po', Tue: 'Út', Wed: 'St', Thu: 'Čt', Fri: 'Pá', Sat: 'So', Sun: 'Ne' };

const boundsUrl = ({ sw, ne }) =>
  `${BASE}/within_bounds?${new URLSearchParams([
    ['sw[]', sw[0]],
    ['sw[]', sw[1]],
    ['ne[]', ne[0]],
    ['ne[]', ne[1]],
    ['locale', 'cs_CZ'],
    ['format', 'json'],
    ['driving_distances', 'false'],
  ]).toString()}`;

// Když je výřez moc velký, API místo stanic vrátí shluky – jediná cesta ke kompletní
// síti je zanořovat se do jejich `bounds`, dokud nezačnou chodit stanice.
async function collectLocations(bounds, found, depth = 0) {
  const page = await getJson(boundsUrl(bounds));
  for (const location of page.locations || []) found.set(location.id, location);

  if (depth >= MAX_DEPTH) return;
  for (const cluster of page.clusters || []) {
    if (cluster?.bounds?.sw && cluster?.bounds?.ne) {
      await collectLocations(cluster.bounds, found, depth + 1);
    }
  }
}

function worktimeFrom(openingHours = []) {
  const parts = openingHours
    .map((slot) => {
      const days = (slot.days || []).map((day) => DAY_LABELS[day] || day);
      const hours = (slot.hours || []).map(([from, to]) => `${from}–${to}`).join(', ');
      if (!hours) return null;
      if (hours === '00:00–24:00' && days.length >= 2) return 'nonstop';
      return `${days.join('–')} ${hours}`.trim();
    })
    .filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : null;
}

async function fetchStations({ limit = null } = {}) {
  const found = new Map();
  await collectLocations(CZ_BOUNDS, found);

  const czech = [...found.values()].filter(
    (location) => location.country_code === 'CZ' && !location.inactive
  );
  czech.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const wanted = limit ? czech.slice(0, limit) : czech;

  return mapSequential(wanted, async (location) => {
    const detail = await getJson(`${BASE}/${location.id}?locale=cs_CZ&format=json`);
    const amenities = detail.amenities || location.amenities || [];

    return makeRecord({
      externalId: location.id,
      // Název začíná interním číslem stanice („8001 TŘEBÍČ“), uživateli neříká nic.
      name: titleCaseIfShouting(String(location.name || '').replace(/^\d{3,6}\s+/, '')),
      lat: location.lat,
      lon: location.lng,
      address: titleCaseIfShouting(location.address),
      city: titleCaseIfShouting(location.city),
      zip: location.postcode,
      phone: location.telephone,
      worktime: worktimeFrom(detail.opening_hours),
      fuels: [
        ...(detail.fuels || []).map((fuel) => FUEL_BY_KEY[fuel]).filter(Boolean),
        ...(amenities.some((amenity) => ADBLUE_AMENITIES.has(amenity)) ? ['adblue'] : []),
      ],
      services: [
        ...amenities.map((amenity) => SERVICE_BY_AMENITY[amenity]).filter(Boolean).map((key) => ({ key, value: 'yes' })),
        ...amenities
          .map((amenity) => PAYMENT_BY_AMENITY[amenity])
          .filter(Boolean)
          .map((method) => ({ key: `payment:${method}`, value: 'yes' })),
      ],
    });
  });
}

module.exports = { slug: 'shell', brand: 'Shell', attribution: 'Shell (shell.cz)', fetchStations };
