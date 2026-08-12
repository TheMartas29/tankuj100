const { cleanValue, normalizeZip } = require('./values');

const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
// Kontakt v User-Agentu vyžadují podmínky použití – bez něj Nominatim odpovídá 403.
const USER_AGENT = 'tankuj100/1.0 (info@silkroadbrand.eu)';
// Povolený strop je 1 dotaz/s. Držíme se kousek pod ním, ať nás nezradí zaokrouhlení
// časovače. Při porušení podmínek nám zablokují IP.
const MIN_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [2000, 5000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reverse(lat, lon) {
  const url =
    `${REVERSE_URL}?format=jsonv2&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'cs', Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 429 || res.status >= 500) {
    const err = new Error(`HTTP ${res.status}`);
    err.retryable = true;
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  // Nad mořem nebo mimo pokrytá data vrací Nominatim `{ error: "Unable to geocode" }`.
  if (!data || data.error) return null;
  return data.address || null;
}

const isRetryable = (err) =>
  Boolean(err.retryable) || err.name === 'TimeoutError' || err.name === 'AbortError' || err instanceof TypeError;

async function reverseWithRetry(lat, lon, onRetry) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await reverse(lat, lon);
    } catch (err) {
      if (!isRetryable(err) || attempt >= MAX_ATTEMPTS) throw err;
      const wait = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
      onRetry(err, attempt, wait);
      await sleep(wait);
    }
  }
}

// Pumpa u silnice mimo zástavbu ulici nemá a Nominatim vrátí do `road` číslo silnice
// („38“, „D48“, „38529“, na křižovatce i „13;35“). Holé číslo v adrese vypadá jako
// rozbitá data, tak ho poznáme a napíšeme po lidsku.
const ROAD_REF = /^(D|R|E|I{1,3})?\s*\/?\s*\d+\s*[a-z]?$/i;

const roadRefs = (road) => road.split(';').map((part) => part.trim()).filter(Boolean);

function isRoadRef(road) {
  const parts = roadRefs(road);
  return parts.length > 0 && parts.every((part) => ROAD_REF.test(part));
}

function roadRefLabel(road) {
  const first = roadRefs(road)[0];
  return /^d/i.test(first) ? `dálnice ${first}` : `silnice ${first}`;
}

const placeOf = (address) =>
  cleanValue(address.suburb) ||
  cleanValue(address.village) ||
  cleanValue(address.hamlet) ||
  cleanValue(address.neighbourhood) ||
  cleanValue(address.town) ||
  cleanValue(address.city) ||
  cleanValue(address.municipality);

function addressOf(address) {
  const road = cleanValue(address.road) || cleanValue(address.pedestrian) || cleanValue(address.footway);
  const number = cleanValue(address.house_number);

  if (road && !isRoadRef(road)) return [road, number].filter(Boolean).join(' ');

  const place = placeOf(address);
  // Číslo popisné bez ulice je v malých obcích běžná adresa („Drslavice 50“), samotné
  // číslo bez obce ale nikomu nic neřekne – to radši neuložíme nic.
  if (number) return place ? `${place} ${number}` : null;
  if (road) return roadRefLabel(road);
  return place;
}

const cityOf = (address) =>
  cleanValue(address.city) ||
  cleanValue(address.town) ||
  cleanValue(address.village) ||
  cleanValue(address.municipality);

const zipOf = (address) => normalizeZip(address.postcode);


/** Vyhledá obec podle názvu a vrátí, jak se píše správně (včetně diakritiky). */
async function searchSettlement(name) {
  const url =
    `${SEARCH_URL}?format=jsonv2&countrycodes=cz&limit=1` +
    `&featureType=settlement&q=${encodeURIComponent(name)}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'cs', Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 429 || res.status >= 500) {
    const err = new Error(`HTTP ${res.status}`);
    err.retryable = true;
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  return Array.isArray(data) && data.length ? cleanValue(data[0].name) : null;
}

module.exports = { reverseWithRetry, searchSettlement, addressOf, cityOf, zipOf, sleep, MIN_INTERVAL_MS, MAX_ATTEMPTS };
