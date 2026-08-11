const cheerio = require('cheerio');

const { getText, mapSequential } = require('./lib/http');
const { makeRecord, flag } = require('./lib/record');

const ORIGIN = 'https://www.one1.eu';
const MAP_PAGE = `${ORIGIN}/cerpaci-stanice`;

const FUEL_BY_ICON = {
  'fuel-natural98': 'octane_98',
  'fuel-natural95': 'octane_95',
  // Past: „Onextra“ se tváří jako závodní palivo (ikona fuel-racing), ale je to
  // Natural 95 Onextra – prémiový benzín na One1 poznáš jen podle fuel-natural98.
  'fuel-racing': 'octane_95',
  'fuel-diesel': 'diesel',
  'fuel-adblue': 'adblue',
  'fuel-lpg': 'lpg',
};

const PAYMENT_BY_CARD = {
  'master card': 'mastercard',
  mastercard: 'mastercard',
  maestro: 'maestro',
  visa: 'visa',
  'visa electron': 'visa_electron',
  'american express': 'american_express',
  jcb: 'jcb',
  'diners club international': 'diners_club',
  'v pay': 'v_pay',
};

const DAY_ORDER = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
const DAY_SHORT = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

const text = ($node) => $node.text().replace(/\s+/g, ' ').trim();

function parseMapData(html) {
  const $ = cheerio.load(html);
  const raw = $('.Map-inner').attr('data-data');
  if (!raw) throw new Error('v HTML se nenašel atribut data-data s mapou stanic');

  return JSON.parse(raw).map((station) => ({
    id: (String(station.url || '').match(/map-detail\/(\d+)/) || [])[1],
    name: station.name,
    lat: station.position?.lat,
    lon: station.position?.lng,
    flags: station,
  }));
}

/** „Selbská ulice 2865, Aš, 35201“ – ulice, obec, PSČ oddělené čárkami. */
function splitAddress(raw) {
  const parts = String(raw || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const zip = parts.length && /^\d{3}\s?\d{2}$/.test(parts[parts.length - 1]) ? parts.pop() : null;
  return { address: parts.shift() || null, city: parts.join(', ') || null, zip };
}

function parseModal(html) {
  const $ = cheerio.load(html);
  return {
    ...splitAddress(text($('.Modal-address').first())),
    phone: ($('.Modal-contact a[href^="tel:"]').first().attr('href') || '').replace('tel:', ''),
    slug: $('a.Button--doubleArrow').first().attr('href') || null,
  };
}

function parseWorktime($) {
  const hours = new Map();
  $('.Detail-timetable li').each((_, item) => {
    const label = DAY_ORDER.find((day) => text($(item)).startsWith(day));
    if (!label) return;
    // Dnešní den má text navíc („Dnes otevřeno od 6:00 do 22:00“), ostatní jen
    // „06:00 - 22:00“. Sjednotíme je, jinak by týden vypadal rozsypaně.
    const raw = text($(item).find('span').first());
    const times = raw.match(/(\d{1,2}[:.]\d{2})\D+(\d{1,2}[:.]\d{2})/);
    const value = /nonstop/i.test(raw) ? 'Nonstop' : times ? `${times[1]} - ${times[2]}` : null;
    if (value) hours.set(DAY_SHORT[DAY_ORDER.indexOf(label)], value);
  });
  if (!hours.size) return null;

  const values = new Set(hours.values());
  if (hours.size === DAY_ORDER.length && values.size === 1) {
    const only = [...values][0];
    return /nonstop/i.test(only) ? 'nonstop' : `Po–Ne ${only}`;
  }
  return [...hours].map(([day, value]) => `${day} ${value}`).join(', ');
}

function parseDetail(html) {
  const $ = cheerio.load(html);

  // Stejné ikony paliv nese i nabídka okolních stanic pod detailem, takže se hledá
  // jen v mřížce hned za nadpisem – jinak by stanice čerpala i cizí paliva.
  const gridAfter = (title) =>
    $('h2')
      .filter((_, heading) => text($(heading)) === title)
      .first()
      .nextAll('.Detail-grid')
      .first();

  const fuels = [];
  gridAfter('Paliva')
    .find('[class*="Icon--fuel-"]')
    .each((_, icon) => {
      for (const className of String($(icon).attr('class') || '').split(/\s+/)) {
        const fuel = FUEL_BY_ICON[className.replace('Icon--', '')];
        if (fuel) fuels.push(fuel);
      }
    });

  const payments = [];
  gridAfter('Akceptované platební karty')
    .find('.Detail-card img[alt]')
    .each((_, card) => {
      const method = PAYMENT_BY_CARD[String($(card).attr('alt')).toLowerCase().trim()];
      if (method) payments.push(method);
    });

  return { fuels, payments, worktime: parseWorktime($) };
}

async function fetchStations({ limit = null } = {}) {
  const all = parseMapData(await getText(MAP_PAGE)).filter((station) => station.id);
  const wanted = limit ? all.slice(0, limit) : all;

  return mapSequential(wanted, async (station) => {
    const modal = parseModal(await getText(`${ORIGIN}/station/map-detail/${station.id}`));
    const detail = modal.slug ? parseDetail(await getText(ORIGIN + modal.slug)) : {};

    return makeRecord({
      externalId: station.id,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
      address: modal.address,
      city: modal.city,
      zip: modal.zip,
      phone: modal.phone,
      worktime: detail.worktime,
      fuels: [
        ...(detail.fuels || []),
        ...(flag(station.flags.lpg) ? ['lpg'] : []),
        ...(flag(station.flags.adBlue) ? ['adblue'] : []),
      ],
      services: [
        ...(flag(station.flags.wash) ? [{ key: 'car_wash', value: 'yes' }] : []),
        ...(detail.payments || []).map((method) => ({ key: `payment:${method}`, value: 'yes' })),
      ],
    });
  });
}

module.exports = {
  slug: 'one1',
  brand: 'One1',
  attribution: 'TOP TANK / One1 (one1.eu)',
  matchBrands: ['one1', 'TOP TANK', 'F1', 'Free1 GAS'],
  fetchStations,
};
