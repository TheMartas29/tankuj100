const { getJson, mapSequential } = require('./lib/http');
const { makeRecord, titleCaseIfShouting } = require('./lib/record');

const BASE = 'https://www.orlen.cz/cs-CZ/api/stations';
const HEADERS = { Referer: 'https://www.orlen.cz/stanice' };

// Endpoint vrací 400 („The filters field is required“), když kterýkoliv z parametrů
// chybí – i prázdné se musí poslat.
const LIST_PARAMS = {
  topN: '0',
  now: 'false',
  nonstop: 'false',
  fuelTypes: '',
  accessoryTypes: '',
  gastroTypes: '',
  paymentTypes: '',
  carWashTypes: '',
  stationTypes: '',
  countries: '',
};

const FUEL_BY_ICON = {
  'verva-100': 'octane_100',
  'verva-95': 'octane_95',
  'efecta-95': 'octane_95',
  'verva-diesel': 'diesel',
  'efecta-diesel': 'diesel',
  lpg: 'lpg',
  cng: 'cng',
};

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

const iconName = (icon) => {
  const match = String(icon || '').match(/\/([^/?]+)\.(?:png|svg|jpg)/i);
  return match ? match[1].toLowerCase() : null;
};

// Část ikon má místo kódu paliva jméno grafického souboru z kampaně
// („ben_2023-0007_1_grafika_web_ikona-hvo100diesel-2_79x79px_02tm“), proto se
// AdBlue a HVO hledají podřetězcem.
function fuelFromIcon(icon) {
  if (FUEL_BY_ICON[icon]) return FUEL_BY_ICON[icon];
  if (icon.startsWith('adblue')) return 'adblue';
  if (icon.includes('hvo100')) return 'diesel';
  return null;
}

function worktimeFrom(openingHours = []) {
  const parts = openingHours
    .filter((slot) => slot && slot.from && slot.to)
    .map((slot) => {
      const from = DAYS[slot.weekdayFrom] || '';
      const to = DAYS[slot.weekdayTo] || '';
      const days = from === to ? from : `${from}–${to}`;
      return `${days} ${slot.from}–${slot.to}`.trim();
    });
  return parts.length ? parts.join(', ') : null;
}

const LIST_URL = `${BASE}/list?${new URLSearchParams(LIST_PARAMS).toString()}`;

async function fetchStations({ limit = null } = {}) {
  const list = await getJson(LIST_URL, { headers: HEADERS });
  const stations = (list.stations || []).filter((row) => row?.id?.country === 'CZ');
  const wanted = limit ? stations.slice(0, limit) : stations;

  return mapSequential(wanted, async (row) => {
    const stationId = row.id.stationId;
    const detail = (await getJson(`${BASE}/CZ/${stationId}`, { headers: HEADERS })).station || {};
    const icons = (detail.icons || []).map(iconName).filter(Boolean);

    return makeRecord({
      externalId: stationId,
      name: titleCaseIfShouting(detail.name),
      lat: row.location?.lat,
      lon: row.location?.lng,
      address: titleCaseIfShouting(detail.address?.streetAndNumber),
      city: titleCaseIfShouting(detail.address?.city),
      phone: (detail.contacts || []).map((contact) => contact?.phone).find(Boolean),
      worktime: worktimeFrom(detail.openingHours),
      fuels: icons.map(fuelFromIcon).filter(Boolean),
    });
  });
}

module.exports = { slug: 'orlen', brand: 'Orlen', attribution: 'Orlen (orlen.cz)', fetchStations };
