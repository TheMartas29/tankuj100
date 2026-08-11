const cheerio = require('cheerio');

const { getText, mapSequential } = require('./lib/http');
const { makeRecord } = require('./lib/record');

const BASE = 'https://www.tank-ono.cz/cz/index.php';
const LIST_URL = `${BASE}?page=pumpy`;
const PRICES_URL = `${BASE}?page=cenik`;

const FUEL_BY_COLUMN = {
  n91: 'octane_91',
  n95: 'octane_95',
  n95p: 'octane_95',
  n98: 'octane_98',
  e85: 'e85',
  d: 'diesel',
  d_plus: 'diesel',
  ab: 'adblue',
  lpg: 'lpg',
};

const NOT_SOLD = '---';

const normalizeName = (raw) =>
  String(raw || '')
    .replace(/ /g, ' ')
    .replace(/^\s*ČS\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const nameKey = (raw) =>
  normalizeName(raw)
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function parseList(html) {
  const $ = cheerio.load(html);
  const stations = new Map();

  $('area[href*="pump="]').each((_, area) => {
    const pump = (String($(area).attr('href')).match(/pump=(\d+)/) || [])[1];
    const name = normalizeName($(area).attr('title'));
    // V HTML mají některé odkazy „pump=24 “ s koncovou mezerou, regexp ji vynechá.
    if (pump && name && !stations.has(pump)) stations.set(pump, name);
  });
  return stations;
}

/**
 * Ceník je jediná strojově čitelná tabulka paliv na webu – na detailu stanice jsou
 * ceny vykreslené jako obrázky číslic. Sloupce určují ikony v hlavičce, část jich
 * je zakomentovaná, takže se pořadí mezi sezónami mění.
 */
function parsePrices(html) {
  const $ = cheerio.load(html);
  const table = $('table.cenik').first();

  const columns = [];
  table
    .find('tr')
    .first()
    .find('th')
    .each((index, cell) => {
      if (index === 0) return;
      const image = $(cell).find('img').attr('src') || '';
      const code = (image.match(/\/([a-z0-9_]+?)(?:_c)?\.gif/i) || [])[1];
      columns.push(FUEL_BY_COLUMN[String(code).toLowerCase()] || null);
    });

  const fuelsByName = new Map();
  table.find('tr').each((rowIndex, row) => {
    if (rowIndex === 0) return;
    const cells = $(row).find('td');
    const name = normalizeName($(cells[0]).text());
    if (!name) return;

    const fuels = [];
    columns.forEach((fuel, index) => {
      const price = $(cells[index + 1]).text().trim();
      if (fuel && price && price !== NOT_SOLD) fuels.push(fuel);
    });
    fuelsByName.set(nameKey(name), fuels);
  });
  return fuelsByName;
}

// Vedle telefonu na stanici je v „kontaktech“ i jméno a mobil vedoucího – ty do naší
// databáze nepatří, bereme jen číslo označené jako „čerpací stanice“.
function parsePhone(html) {
  const $ = cheerio.load(html);
  const contacts = $('#kontakty').text().replace(/\s+/g, ' ');
  const match = contacts.match(/čerpac[íi] stanice\s*tel\.?\s*:?\s*(\+?[\d ]{9,})/i);
  return match ? match[1].trim() : null;
}

async function fetchStations({ limit = null } = {}) {
  const [listHtml, pricesHtml] = [await getText(LIST_URL), await getText(PRICES_URL)];
  const stations = [...parseList(listHtml)];
  const fuelsByName = parsePrices(pricesHtml);
  const wanted = limit ? stations.slice(0, limit) : stations;

  return mapSequential(wanted, async ([pump, name]) => {
    const detail = await getText(`${BASE}?page=pumpcard&pump=${pump}`);

    return makeRecord({
      externalId: pump,
      name,
      // Souřadnice se dají získat jen následováním odkazu na goo.gl, který Google od
      // roku 2025 ruší. Necháváme ty z OSM, ať se stanice na mapě nezačnou stěhovat.
      lat: null,
      lon: null,
      phone: parsePhone(detail),
      fuels: fuelsByName.get(nameKey(name)) || [],
    });
  });
}

module.exports = {
  slug: 'tank-ono',
  brand: 'Tank ONO',
  attribution: 'Tank ONO (tank-ono.cz)',
  fetchStations,
};
