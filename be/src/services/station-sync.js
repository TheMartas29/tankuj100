const { canonicalBrand, canonicalStationName } = require('../brands');
const { isInCzechia, distanceMeters } = require('../geo');
const { servicesText, paymentsText } = require('../station-tags');
const repo = require('../repositories/station-sync.repo');

const MATCH_RADIUS_M = 150;
const PREMIUM_FUELS = ['octane_98', 'octane_100'];
const COORDINATE_EPSILON = 1e-7;

// Když zdroj vrátí míň než polovinu stanic, které na něj už máme napárované, je
// pravděpodobnější rozbitý web než zavřená půlka sítě – takový běh se neaplikuje.
const MIN_SHARE_OF_PREVIOUS = 0.5;

const TEXT_FIELDS = ['city', 'address', 'zip', 'phone', 'worktime'];

const NAME_STOPWORDS = new Set(['cs', 'sro', 'spol', 's', 'r', 'o', 'as', 'cerpaci', 'stanice']);

const deaccent = (raw) =>
  String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLocaleLowerCase('cs');

const comparable = (raw) => deaccent(raw).replace(/\s+/g, ' ').trim();

const sameText = (a, b) => comparable(a) === comparable(b);

const isBlank = (value) => value == null || String(value).trim() === '';

/** Souřadnice bereme jen tam, kde dávají smysl – Orlen jich má 18 na nule. */
function trustedPoint(record) {
  const { lat, lon } = record;
  if (lat == null || lon == null) return null;
  if (lat === 0 && lon === 0) return null;
  if (!isInCzechia(lat, lon)) return null;
  return { lat, lon };
}

const hasPremium = (fuels) => fuels.some((fuel) => PREMIUM_FUELS.includes(fuel));

/**
 * Klíč pro párování stanic bez souřadnic (Tank ONO). Zahodí značku i právní formu,
 * takže „Tank ONO s.r.o. - ČS Cvikov“ a „Tank Ono - ČS Cvikov“ vyjdou stejně.
 */
function nameKey(raw, brand) {
  const brandWords = new Set(deaccent(brand).split(/\s+/).filter(Boolean));
  const words = deaccent(raw)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && !brandWords.has(word) && !NAME_STOPWORDS.has(word));
  return words.join(' ');
}

function groupBy(rows, keyOf, valueOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(valueOf(row));
  }
  return map;
}

function loadDatabase() {
  const stations = repo.listStations();
  const fuels = groupBy(repo.listFuels(), (row) => row.station_id, (row) => row.fuel_key);
  const tags = groupBy(
    repo.listTags(),
    (row) => row.station_id,
    (row) => ({ key: row.tag_key, value: row.tag_value })
  );
  return { stations, fuels, tags };
}

/** Stanice, které se pro danou značku smějí párovat – síť může mít v DB víc názvů. */
function candidateStations(stations, source) {
  const brands = new Set((source.matchBrands || [canonicalBrand(source.brand)]).filter(Boolean));
  return stations.filter((station) => brands.has(station.brand_name));
}

const buildNameIndex = (candidates, brand) =>
  candidates.map((station) => ({
    station,
    keys: [nameKey(station.name, brand), nameKey(station.city, brand)].filter(Boolean),
  }));

/**
 * Poslední záchrana pro zdroje bez souřadnic (Tank ONO). Přesná shoda klíče má
 * přednost; když selže, uzná se i podrobnější název ze zdroje („Kolaje u Poděbrad“
 * proti „Kolaje“ v DB). Nejednoznačná shoda se zahazuje – radši nespárovat.
 */
function matchByName(index, record, brand, isFree) {
  const key = nameKey(record.name, brand);
  if (!key) return null;

  const free = index.filter((entry) => isFree(entry.station));
  const exact = free.filter((entry) => entry.keys.includes(key));
  if (exact.length) return exact.length === 1 ? exact[0].station : null;

  const words = new Set(key.split(' '));
  const covered = free.filter((entry) =>
    entry.keys.some((candidate) => candidate.split(' ').every((word) => words.has(word)))
  );
  return covered.length === 1 ? covered[0].station : null;
}

function nearestStation(candidates, point, isFree) {
  let best = null;
  let bestDistance = MATCH_RADIUS_M;

  for (const station of candidates) {
    if (station.lat == null || station.lon == null || !isFree(station)) continue;
    const distance = distanceMeters(point.lat, point.lon, station.lat, station.lon);
    if (distance <= bestDistance) {
      best = station;
      bestDistance = distance;
    }
  }
  return best;
}

const mergeDataSource = (current, attribution) => {
  const parts = String(current || '')
    .split(' + ')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.includes(attribution)) return null;
  return [...parts, attribution].join(' + ');
};

const tagFingerprint = (tags) =>
  [...tags]
    .map((tag) => `${tag.key}=${tag.value}`)
    .sort()
    .join('|');

// Co značce nepatří: původ z OSM, otevírací doba (drží ji sloupec worktime) a
// značka od geokodéru. Musí sedět s KEPT_TAG_KEYS v station-sync.repo.js.
const isKeptTag = (key) => key.startsWith('osm:') || key === 'opening_hours' || key === 'geocoded';

function planStationUpdate({ station, record, source, brandName, currentFuels, currentTags }) {
  const changes = {};
  const fields = [];

  const setIfBetter = (field, value) => {
    if (isBlank(value)) return;
    if (!isBlank(station[field]) && sameText(station[field], value)) return;
    if (String(station[field] ?? '') === String(value)) return;
    changes[field] = value;
    fields.push(field);
  };

  setIfBetter('brand_name', brandName);
  setIfBetter('name', canonicalStationName(record.name, brandName));
  for (const field of TEXT_FIELDS) setIfBetter(field, record[field]);

  const point = trustedPoint(record);
  if (point) {
    const moved =
      station.lat == null ||
      station.lon == null ||
      Math.abs(station.lat - point.lat) > COORDINATE_EPSILON ||
      Math.abs(station.lon - point.lon) > COORDINATE_EPSILON;
    if (moved) {
      changes.lat = point.lat;
      changes.lon = point.lon;
      fields.push('souřadnice');
    }
  }

  // Prázdný seznam paliv znamená, že se ho ze zdroje nepodařilo přečíst – v takovém
  // případě je lepší nechat, co v DB je, než stanici paliva vymazat.
  let fuels = null;
  if (record.fuels.length && [...currentFuels].sort().join('|') !== [...record.fuels].sort().join('|')) {
    fuels = record.fuels;
    fields.push('paliva');
  }

  let tags = null;
  if (record.services.length) {
    const kept = currentTags.filter((tag) => isKeptTag(tag.key));
    const replaceable = currentTags.filter((tag) => !isKeptTag(tag.key));
    if (tagFingerprint(replaceable) !== tagFingerprint(record.services)) {
      tags = record.services;
      fields.push('služby');
      const merged = [...kept, ...record.services].map((tag) => ({
        tag_key: tag.key,
        tag_value: tag.value,
      }));
      changes.services = servicesText(merged);
      changes.payments = paymentsText(merged);
    }
  }

  const dataSource = mergeDataSource(station.data_source, source.attribution);
  if (dataSource) {
    changes.data_source = dataSource;
    fields.push('původ dat');
  }

  return { changes, fields, fuels, tags };
}

function planNewStation(record, source, brandName) {
  const point = trustedPoint(record);
  const tags = record.services.map((tag) => ({ tag_key: tag.key, tag_value: tag.value }));

  return {
    row: {
      lat: point.lat,
      lon: point.lon,
      brand_name: brandName,
      name: canonicalStationName(record.name, brandName) || brandName,
      city: record.city,
      address: record.address,
      zip: record.zip,
      phone: record.phone,
      worktime: record.worktime,
      services: servicesText(tags),
      payments: paymentsText(tags),
      data_source: source.attribution,
    },
    fuels: record.fuels,
    tags: record.services,
  };
}

/**
 * Spáruje záznamy jednoho zdroje s databází a vrátí plán změn. Nic nemaže – stanice,
 * kterou zdroj přestal vracet, jen skončí v `missing`.
 */
function planSource(source, records) {
  const { stations, fuels, tags } = loadDatabase();
  const brandName = canonicalBrand(source.brand);
  const candidates = candidateStations(stations, source);
  const byId = new Map(stations.map((station) => [station.id, station]));

  const links = repo.listLinks(source.slug);
  const linkedByExternalId = new Map(links.map((link) => [link.external_id, link.station_id]));
  const linkedStationIds = new Set(links.map((link) => link.station_id));
  const nameIndex = buildNameIndex(candidates, source.brand);

  const claimed = new Set();
  const plan = { created: [], matched: [], unmatched: [], missing: [], orphans: [] };
  const seenExternalIds = new Set();

  for (const record of records) {
    seenExternalIds.add(record.externalId);
    const recordBrand = canonicalBrand(record.brand) || brandName;
    const point = trustedPoint(record);

    let station = byId.get(linkedByExternalId.get(record.externalId)) || null;
    const isFree = (candidate) =>
      !claimed.has(candidate.id) && !linkedStationIds.has(candidate.id);

    if (!station && point) {
      station = nearestStation(candidates, point, isFree);
    }
    if (!station && !point) {
      station = matchByName(nameIndex, record, source.brand, isFree);
    }

    if (station) {
      claimed.add(station.id);
      plan.matched.push({
        station,
        record,
        ...planStationUpdate({
          station,
          record,
          source,
          brandName: recordBrand,
          currentFuels: fuels.get(station.id) || [],
          currentTags: tags.get(station.id) || [],
        }),
      });
      continue;
    }

    if (!hasPremium(record.fuels)) {
      plan.unmatched.push({ record, reason: 'bez 98/100 oktanů' });
      continue;
    }
    if (!point) {
      plan.unmatched.push({ record, reason: 'bez použitelných souřadnic' });
      continue;
    }
    plan.created.push({ record, ...planNewStation(record, source, recordBrand) });
  }

  for (const link of links) {
    if (!seenExternalIds.has(link.external_id)) {
      const station = byId.get(link.station_id);
      plan.missing.push({ externalId: link.external_id, station });
    }
  }

  // Stanice, které v DB pod touto značkou máme, ale zdroj o nich neví. Typicky
  // zrušené pumpy z OSM – mažeme je jen ručně, visí na nich hodnocení uživatelů.
  for (const station of candidates) {
    if (!claimed.has(station.id)) plan.orphans.push({ station });
  }

  return plan;
}

function applyPlan(source, plan) {
  const seenAt = new Date().toISOString();
  const link = (stationId, externalId) =>
    repo.upsertLink({
      station_id: stationId,
      source: source.slug,
      external_id: externalId,
      last_seen_at: seenAt,
    });

  repo.inTransaction(() => {
    for (const item of plan.created) {
      const id = repo.insertStation(item.row);
      repo.replaceFuels(id, item.fuels);
      repo.replaceServiceTags(id, item.tags);
      link(id, item.record.externalId);
    }
    for (const item of plan.matched) {
      repo.updateStation(item.station.id, item.changes);
      if (item.fuels) repo.replaceFuels(item.station.id, item.fuels);
      if (item.tags) repo.replaceServiceTags(item.station.id, item.tags);
      link(item.station.id, item.record.externalId);
    }
  });
}

function summarize(source, records, plan, { applied, skippedReason = null, previous }) {
  const fieldCounts = new Map();
  for (const item of plan.matched) {
    for (const field of item.fields) fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
  }
  const changed = plan.matched.filter((item) => item.fields.length);

  return {
    slug: source.slug,
    brand: source.brand,
    fetched: records.length,
    previous,
    applied,
    skippedReason,
    created: plan.created.length,
    updated: changed.length,
    unchanged: plan.matched.length - changed.length,
    missing: plan.missing.length,
    orphans: plan.orphans.length,
    unmatched: plan.unmatched.length,
    fieldCounts: [...fieldCounts].sort((a, b) => b[1] - a[1]),
    details: plan,
  };
}

/** Vrátí důvod, proč se změny neaplikují, nebo null. */
function suspiciousDrop(records, previous, { trusted }) {
  if (trusted || previous === 0) return null;
  if (records.length >= previous * MIN_SHARE_OF_PREVIOUS) return null;
  return (
    `zdroj vrátil jen ${records.length} stanic, spárovaných z minulých běhů je ${previous}` +
    ' – vypadá to na rozbitý zdroj, změny neaplikuji'
  );
}

function syncSource(source, records, { dryRun = false, partial = false } = {}) {
  const previous = repo.countLinks(source.slug);
  const plan = planSource(source, records);
  const skippedReason = suspiciousDrop(records, previous, { trusted: partial });

  const applied = !dryRun && !skippedReason;
  if (applied) applyPlan(source, plan);

  return summarize(source, records, plan, { applied, skippedReason, previous });
}

module.exports = { syncSource, planSource, MATCH_RADIUS_M, MIN_SHARE_OF_PREVIOUS };
