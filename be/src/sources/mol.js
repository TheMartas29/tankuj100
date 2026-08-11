const { postJson } = require('./lib/http');
const { makeRecord } = require('./lib/record');

const API = 'https://cerpacistanice.molcesko.cz/api.php';

// Web vyhledávače si nechává jen stanice v provozu (1) a dočasně uzavřené (4);
// zbytek jsou zavřené a rozestavěné pumpy.
const OPEN_STATUSES = new Set(['1', '4']);

const FUEL_BY_ID = {
  EVO_100_PLUS: 'octane_100',
  EVO_100: 'octane_100',
  // EVO Racing 102 Plus je 102 oktanů; vlastní klíč nemáme a do „stovky“ patří spíš
  // než do devadesátek.
  EVO_RACING_102_PLUS: 'octane_100',
  EVO_95: 'octane_95',
  NATURAL_95: 'octane_95',
  EVO_DIESEL: 'diesel',
  EVO_DIESEL_PLUS: 'diesel',
  DIESEL: 'diesel',
  LPG: 'lpg',
  CNG: 'cng',
};

const FUEL_BY_SERVICE = {
  AD_BLUE: 'adblue',
  ADBLUE_DISPENSER_AVAILABLE: 'adblue',
};

const SERVICE_BY_ID = {
  SHOP: 'shop',
  AUTOMATIC_CAR_WASH_AVAILABLE: 'car_wash',
  JET_WASH_AVAILABLE: 'car_wash',
  DISABLED_TOILET: 'toilets',
  FAMILY_TOILET: 'toilets',
};

const PAYMENT_BY_CARD = {
  VISA: 'visa',
  VISA_ELECTRON: 'visa_electron',
  EUROCARD_MASTERCARD: 'mastercard',
  MASTERCARD_ELECTRONIC: 'mastercard_electronic',
  MAESTRO: 'maestro',
  CIRRUS_MAESTRO: 'maestro',
  AMEX: 'american_express',
  VPAY: 'v_pay',
  DINERS: 'diners_club',
  DKV_CARD: 'dkv',
  UTA_CARD: 'uta',
  CCS_CARD: 'ccs',
  E100_CARD: 'e100',
  EURO_OIL: 'eurooil',
  INA_CARD: 'ina',
  MOL_GOLD_CARD_CZ: 'mol',
  MOL_SILVER_CARD_CZ: 'mol',
  SLOVNAFT_GOLD_CARD_SK: 'slovnaft',
  EURO_WAG: 'wag',
};

const ids = (group) => ((group || {}).values || []).map((item) => item.id);

const DAY_LABELS = [
  ['openedSummerWeekDay', 'Po–Pá'],
  ['openedSummerSaturday', 'So'],
  ['openedSummerSunday', 'Ne'],
];

function worktimeFrom(opened = {}) {
  const slots = DAY_LABELS.map(([key, label]) => [label, (opened[key] || '').trim()]).filter(
    ([, hours]) => hours
  );
  if (!slots.length) return null;

  const unique = new Set(slots.map(([, hours]) => hours));
  if (slots.length === DAY_LABELS.length && unique.size === 1) {
    const hours = slots[0][1];
    return hours === '00:00-24:00' ? 'nonstop' : `Po–Ne ${hours}`;
  }
  return slots.map(([label, hours]) => `${label} ${hours}`).join(', ');
}

async function fetchStations({ limit = null } = {}) {
  const all = await postJson(API, { api: 'stations', mode: 'country', lang: 'cs', input: 'CZ' });
  const open = all.filter((station) => OPEN_STATUSES.has(String(station.stationStatus)));
  const wanted = limit ? open.slice(0, limit) : open;

  return wanted.map((station) => {
    const services = ids(station.services);
    const fuels = ids(station.fuelsAndAdditives)
      .map((id) => FUEL_BY_ID[id])
      .concat(services.map((id) => FUEL_BY_SERVICE[id]));

    return makeRecord({
      externalId: station.code,
      brand: station.brand,
      name: station.name,
      lat: station.gpsPosition?.latitude,
      lon: station.gpsPosition?.longitude,
      address: station.address,
      city: station.city,
      zip: station.postcode,
      phone: station.phoneNum,
      worktime: worktimeFrom(station.openedHours),
      fuels: fuels.filter(Boolean),
      services: [
        ...services.map((id) => SERVICE_BY_ID[id]).filter(Boolean).map((key) => ({ key, value: 'yes' })),
        ...ids(station.cards)
          .map((id) => PAYMENT_BY_CARD[id])
          .filter(Boolean)
          .map((method) => ({ key: `payment:${method}`, value: 'yes' })),
      ],
    });
  });
}

module.exports = { slug: 'mol', brand: 'MOL', attribution: 'MOL (molcesko.cz)', fetchStations };
