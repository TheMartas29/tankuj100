const { getJson, postForm, mapSequential } = require('./lib/http');
const { makeRecord, titleCaseIfShouting, flag } = require('./lib/record');

const LIST_URL = 'https://app.wigeogis.com/kunden/omv/data/getresults.php';
const DETAIL_URL = 'https://app.wigeogis.com/kunden/omv/data/getconfig.php';

const LIST_PARAMS = {
  CTRISO: 'CZE',
  BRAND: 'OMV',
  VEHICLE: 'CAR',
  MODE: 'NEXTDOOR',
  ANZ: '9999',
  PRESELECTED: '',
};

const FUEL_FLAGS = [
  ['mm_super_100', 'octane_100'],
  ['product_lpg', 'lpg'],
  ['product_erdgas', 'cng'],
  ['adblue_pump', 'adblue'],
  ['product_e85', 'e85'],
];

const SERVICE_FLAGS = [
  ['shop', 'shop'],
  ['car_jet_wash', 'car_wash'],
  ['carwash_boxes', 'car_wash'],
];

const PAYMENT_FLAGS = [
  ['omv_card', 'omv_card'],
  ['routex_card', 'routex'],
  ['uta_card', 'uta'],
  ['dkv_card', 'dkv'],
  ['visa_card', 'visa'],
  ['master_card', 'mastercard'],
  ['amex_card', 'american_express'],
  ['diners_card', 'diners_club'],
];

const detailUrl = (sid) =>
  `${DETAIL_URL}?${new URLSearchParams({
    BRAND: 'OMV',
    CTRISO: 'CZE',
    LNG: 'CS',
    FILTERS: '',
    STATIONID: sid,
  }).toString()}`;

const picked = (detail, pairs) =>
  pairs.filter(([field]) => flag(detail[field])).map(([, key]) => key);

async function fetchStations({ limit = null } = {}) {
  const list = await postForm(LIST_URL, LIST_PARAMS).then(JSON.parse);
  const czech = list.filter((row) => row.national_code === 'CZ' && row.sid);
  const wanted = limit ? czech.slice(0, limit) : czech;

  return mapSequential(wanted, async (row) => {
    const config = await getJson(detailUrl(row.sid));
    const detail = config?.confVariables?.conf_STATIONDETAILS || {};

    return makeRecord({
      externalId: row.sid,
      // Seznam ani detail nemají název stanice, jediné rozumné je místo.
      name: titleCaseIfShouting(row.town_l),
      // WIGeoGIS má osy prohozené: `x` je zeměpisná délka, `y` šířka.
      lat: row.y,
      lon: row.x,
      address: titleCaseIfShouting(row.address_l),
      city: titleCaseIfShouting(row.town_l),
      zip: row.postcode,
      phone: row.telnr || detail.telnr,
      worktime: row.open_hours,
      // Detail má příznaky jen pro prémiová paliva MaxxMotion (`mm_95` je značkové
      // 95, ne jediné 95 na stanici). Naftu a Super 95 čerpá každá OMV.
      fuels: ['diesel', 'octane_95', ...picked(detail, FUEL_FLAGS)],
      services: [
        ...picked(detail, SERVICE_FLAGS).map((key) => ({ key, value: 'yes' })),
        ...picked(detail, PAYMENT_FLAGS).map((method) => ({
          key: `payment:${method}`,
          value: 'yes',
        })),
      ],
    });
  });
}

module.exports = { slug: 'omv', brand: 'OMV', attribution: 'OMV (omv.cz)', fetchStations };
