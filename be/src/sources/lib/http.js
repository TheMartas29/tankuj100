// Weby značek nejsou API pro veřejnost – bez prohlížečové hlavičky UA některé
// (hlavně orlen.cz) spojení rovnou resetují.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 tankuj100-sync';

const TIMEOUT_MS = 30000;
const ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;
const THROTTLE_MS = 120;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, { method = 'GET', headers = {}, body = null, throttle = THROTTLE_MS } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        body,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'cs,en;q=0.8', ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText} – ${url}`);

      const text = await response.text();
      if (throttle) await sleep(throttle);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error(`${lastError.message} (${ATTEMPTS} pokusy)`);
}

const getText = (url, options) => request(url, options);

async function getJson(url, options) {
  const text = await getText(url, { ...options, headers: { Accept: 'application/json', ...options?.headers } });
  return JSON.parse(text);
}

const postForm = (url, params, options) =>
  request(url, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...options?.headers },
    body: new URLSearchParams(params).toString(),
  });

async function postJson(url, payload, options) {
  const text = await request(url, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...options?.headers },
    body: JSON.stringify(payload),
  });
  return JSON.parse(text);
}

/** Detaily stanic taháme sekvenčně – žádný ze zdrojů není určený k paralelnímu odbavení. */
async function mapSequential(items, worker) {
  const results = [];
  for (const item of items) results.push(await worker(item));
  return results;
}

module.exports = { getText, getJson, postForm, postJson, mapSequential, sleep, USER_AGENT };
