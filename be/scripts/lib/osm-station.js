const { canonicalBrand, canonicalStationName } = require('../../src/brands');
const {
  SERVICE_TAGS,
  PAYMENT_PREFIX,
  servicesText,
  paymentsText,
} = require('../../src/station-tags');
const { cleanValue, normalizeZip, normalizePhone } = require('./values');

const isYes = (value) => value === 'yes';

const FUEL_PREFIX = 'fuel:';

const byTagKey = (a, b) => a.tag_key.localeCompare(b.tag_key);

function fuelsFromTags(tags) {
  return Object.entries(tags)
    .filter(([key, value]) => key.startsWith(FUEL_PREFIX) && isYes(value))
    .map(([key]) => key.slice(FUEL_PREFIX.length))
    .sort();
}

function tagsToStore(tags) {
  const stored = [];
  for (const [key, raw] of Object.entries(tags)) {
    const value = cleanValue(raw);
    if (!value || value === 'no') continue;
    if (key in SERVICE_TAGS || (key.startsWith(PAYMENT_PREFIX) && isYes(value))) {
      stored.push({ tag_key: key, tag_value: value });
    }
  }
  return stored.sort(byTagKey);
}

/**
 * Adresa z OSM tagů. V malých obcích ulice chybí a adresou je „<obec> <číslo>“
 * („Karlštejn 324“); samotné číslo popisné bez obce nikomu nic neřekne, takže
 * v takovém případě radši neuložíme nic.
 */
function addressFromTags(tags) {
  const street = cleanValue(tags['addr:street']);
  const number = cleanValue(tags['addr:housenumber']);
  if (street) return [street, number].filter(Boolean).join(' ');

  if (!number) return null;
  const city = cleanValue(tags['addr:city']);
  return city ? `${city} ${number}` : null;
}

function featureToStation(feature) {
  const tags = feature.properties || {};
  const [lon, lat] = feature.geometry.coordinates;
  const brandRaw = cleanValue(tags.brand) || cleanValue(tags.operator) || cleanValue(tags.name);
  const brandName = canonicalBrand(brandRaw);
  const stored = tagsToStore(tags);
  const opening = cleanValue(tags.opening_hours);

  const storedTags = [...stored];
  if (brandRaw) storedTags.push({ tag_key: 'osm:brand_raw', tag_value: brandRaw });
  if (opening) storedTags.push({ tag_key: 'opening_hours', tag_value: opening });

  return {
    osm_id: cleanValue(feature.id) || cleanValue(tags['@id']),
    lat,
    lon,
    brand_name: brandName,
    brand_raw: brandRaw,
    // `name` v OSM bývá jen značka („MOL“); užitečná je pobočka („Beroun, D5“).
    name: canonicalStationName(cleanValue(tags.branch) || cleanValue(tags.name), brandName),
    city: cleanValue(tags['addr:city']),
    address: addressFromTags(tags),
    zip: normalizeZip(tags['addr:postcode']),
    phone: normalizePhone(tags.phone || tags['contact:phone']),
    worktime: opening,
    services: servicesText(stored),
    payments: paymentsText(stored),
    fuels: fuelsFromTags(tags),
    tags: storedTags.sort(byTagKey),
  };
}

module.exports = { isYes, featureToStation, addressFromTags };
