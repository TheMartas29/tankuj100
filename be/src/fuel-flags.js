/**
 * Bitové masky paliv a služeb, které se posílají v `/api/map/` jako pole `f` a `s`.
 *
 * Proč masky a ne pole řetězců: aplikace filtruje sama u sebe a musí to zvládnout
 * i při stotisíci stanicích. Porovnání jedním `&` je řádově levnější než procházení
 * pole textů – a v odpovědi je to místo zhruba padesáti bajtů na stanici jedno číslo.
 *
 * **Tenhle číselník má přesnou kopii v `ios/…/Models/StationFlags.swift`.** Když se
 * přidá bit, musí se přidat na obou stranách; pozice se nikdy nemění a nepoužité
 * se nerecyklují, jinak by starší build aplikace filtroval podle něčeho jiného.
 */

const FUEL_BITS = {
  octane_100: 0,
  octane_98: 1,
  octane_95: 2,
  diesel: 3,
  lpg: 4,
  cng: 5,
  adblue: 6,
  e85: 7,
};

// Klíče služeb, jak je ukládá import z OSM do `station_tag`; `nonstop` se dopočítá
// z otevírací doby. Bit pro občerstvení tu schválně není – v datech není ani jeden
// tag `restaurant`, `cafe` ani `fast_food`, takže by to byl filtr, který nikdy nic
// nenajde. Až data budou, přidá se jako bit 3 a `nonstop` si nechá svoji pozici.
const SERVICE_BITS = {
  shop: 0,
  car_wash: 1,
  toilets: 2,
  nonstop: 4,
};

const bit = (position) => 1 << position;

const fuelMaskFor = (fuelKeys) =>
  fuelKeys.reduce((mask, key) => (FUEL_BITS[key] === undefined ? mask : mask | bit(FUEL_BITS[key])), 0);

/** `tagKeys` jsou klíče z `station_tag`, `worktime` je sloupec stanice. */
function serviceMaskFor(tagKeys, worktime) {
  let mask = 0;
  for (const key of tagKeys) {
    if (SERVICE_BITS[key] !== undefined) mask |= bit(SERVICE_BITS[key]);
  }
  if (isNonstop(worktime)) mask |= bit(SERVICE_BITS.nonstop);
  return mask;
}

// Otevírací doba je v datech už polidštěná a pro nonstop má spoustu podob: „nonstop“,
// „24/7“, „Po–Ne 00:00–23:59“, „Mo-Su 00:00-24:00“, „24h SAMOOBSLUŽNÁ“… Hledat jen
// „24/7“ by minulo devět z deseti. Pomlčky sjednocujeme, protože se střídá spojovník
// s pomlčkou en dash.
const ALL_DAY_PATTERNS = [
  /nonstop/,
  /non-stop/,
  /24\/7/,
  /24h/,
  /00:00-23:59/,
  /00:00-24:00/,
  /0:00-24:00/,
];

function isNonstop(worktime) {
  if (typeof worktime !== 'string') return false;
  const normalized = worktime.toLowerCase().replace(/[‐-―]/g, '-').replace(/\s/g, '');
  return ALL_DAY_PATTERNS.some((pattern) => pattern.test(normalized));
}

module.exports = { FUEL_BITS, SERVICE_BITS, fuelMaskFor, serviceMaskFor, isNonstop };
