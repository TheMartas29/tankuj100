const { getText } = require('./lib/http');
const { makeRecord, flag } = require('./lib/record');

const PAGE = 'https://www.ceproas.cz/eurooil/cerpaci-stanice';
const MARKER = 'initMapbox();';

const BRAND_BY_TYPE = { 1: 'EuroOil', 2: 'RoBiN OIL' };

const FUEL_FLAGS = [
  ['ba98', 'octane_98'],
  ['ba95n', 'octane_95'],
  ['opt95e', 'octane_95'],
  ['ba91s', 'octane_91'],
  ['optdiesel', 'diesel'],
  ['optdieselplus', 'diesel'],
  ['ekodiesel', 'diesel'],
  ['hvo', 'diesel'],
  ['fame', 'biodiesel'],
  ['e85', 'e85'],
  ['lpg', 'lpg'],
  ['cng', 'cng'],
  ['adblue', 'adblue'],
];

const SERVICE_FLAGS = [
  ['myci_linka', 'car_wash'],
  ['myci_box', 'car_wash'],
];

/**
 * Data nejsou v API, ale v poli, které stránka předává do `flags([...])` těsně před
 * `initMapbox();`. Vnořené závorky vylučují regulární výraz, hledá se pozicemi.
 */
function extractStations(html) {
  const marker = html.indexOf(MARKER);
  if (marker === -1) throw new Error('v HTML chybí initMapbox() – stránka se změnila');

  const prefix = html.slice(0, marker);
  const start = prefix.lastIndexOf('([{');
  const end = prefix.indexOf('}]);', start);
  if (start === -1 || end === -1) throw new Error('v HTML se nenašlo pole stanic');

  return JSON.parse(prefix.slice(start + 1, end + 2));
}

function addressOf(station) {
  const number = [station.cislo_popisne, station.cislo_orientacni].filter(Boolean).join('/');
  const street = (station.ulice || '').trim();
  if (street) return [street, number].filter(Boolean).join(' ');
  return [station.obec, number].filter(Boolean).join(' ') || null;
}

function worktimeOf(station) {
  if (flag(station.nonstop)) return 'nonstop';
  const workdays = (station.provozni_doba || '').trim();
  const weekend = (station.provozni_doba_nd || '').trim();
  if (!workdays) return weekend || null;
  return weekend ? `${workdays}; ne a svátky ${weekend}` : workdays;
}

// Záznam obsahuje i jména, telefony, IČ a bydliště nájemců stanice. Bereme proto
// jmenovitě jen údaje o stanici – nic z toho se nesmí dostat do DB ani do logu.
async function fetchStations({ limit = null } = {}) {
  const all = extractStations(await getText(PAGE));
  const active = all.filter((station) => flag(station.active));
  const wanted = limit ? active.slice(0, limit) : active;

  return wanted.map((station) =>
    makeRecord({
      externalId: station.id,
      brand: BRAND_BY_TYPE[Number(station.type)] || 'EuroOil',
      name: station.jmeno,
      lat: station.latitude,
      lon: station.longitude,
      address: addressOf(station),
      city: station.obec,
      zip: station.psc,
      phone: station.telefon_stanice,
      worktime: worktimeOf(station),
      fuels: FUEL_FLAGS.filter(([field]) => flag(station[field])).map(([, key]) => key),
      services: SERVICE_FLAGS.filter(([field]) => flag(station[field])).map(([, key]) => ({
        key,
        value: 'yes',
      })),
    })
  );
}

module.exports = {
  slug: 'eurooil',
  brand: 'EuroOil',
  attribution: 'EuroOil / RoBiN OIL (ceproas.cz)',
  // Jeden dataset Čepra pokrývá obě sítě, značku určuje `type` u každé stanice.
  matchBrands: ['EuroOil', 'RoBiN OIL'],
  fetchStations,
};
