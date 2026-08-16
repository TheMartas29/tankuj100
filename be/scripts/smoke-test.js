#!/usr/bin/env node
// Smoke test API. Spustí server nad kopií databáze na volném portu, provolá
// všechny veřejné i admin endpointy a ověří stavové kódy a klíčová pole.
//
//   node scripts/smoke-test.js
//   node scripts/smoke-test.js --verbose
//
// Kopie databáze i celý běžící server se po testu uklidí, produkční data zůstanou
// nedotčená.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
const PORT = Number(process.env.SMOKE_PORT || 3199);
const BASE = `http://127.0.0.1:${PORT}`;

const sourceDbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(ROOT, 'db', 'tankuj100db.sqlite');

const env = readDotEnv(path.join(ROOT, '.env'));
const adminUser = process.env.ADMIN_USERNAME || env.ADMIN_USERNAME || '';
const adminPass = process.env.ADMIN_PASSWORD || env.ADMIN_PASSWORD || '';
const adminHeader = `Basic ${Buffer.from(`${adminUser}:${adminPass}`).toString('base64')}`;

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    if (VERBOSE) console.log(`  ok   ${name}`);
    return true;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  return false;
}

function checkStatus(name, res, expected) {
  return check(`${name} → ${expected}`, res.status === expected, `dostal ${res.status}`);
}

function section(title) {
  console.log(`\n── ${title}`);
}

async function call(method, url, { body, auth, raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = adminHeader;
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* odpověď není JSON (HTML stránky) */
  }
  return { status: res.status, json, text, headers: res.headers };
}

const get = (url, opts) => call('GET', url, opts);
const post = (url, body, opts) => call('POST', url, { body, ...opts });
const patch = (url, body, opts) => call('PATCH', url, { body, ...opts });
const del = (url, body, opts) => call('DELETE', url, { body, ...opts });

const isValidationError = (res) => res.json?.error === 'validation_error' && typeof res.json?.message === 'string';

function readDotEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/s.test(value)) value = value.slice(1, -1);
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

function copyDatabase(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tankuj100-smoke-'));
  const target = path.join(dir, 'smoke.sqlite');
  // `sqlite3 .backup` sebere i rozepsaný WAL běžícího serveru, prosté kopírování ne.
  try {
    execFileSync('sqlite3', [source, `.backup '${target}'`], { stdio: 'pipe' });
  } catch {
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(source + suffix)) fs.copyFileSync(source + suffix, target + suffix);
    }
  }
  return { dir, target };
}

async function startServer(dbPath, { port = PORT, extraEnv = {} } = {}) {
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      PORT: String(port),
      ADMIN_USERNAME: adminUser,
      ADMIN_PASSWORD: adminPass,
      // Prázdné klíče = notifikace se jen zalogují. Test nesmí posílat skutečné e-maily.
      EMAILJS_SERVICE_ID: '',
      EMAILJS_TEMPLATE_ID: '',
      EMAILJS_PUBLIC_KEY: '',
      EMAILJS_PRIVATE_KEY: '',
      APP_KEY: '',
      APP_KEY_MODE: 'off',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const log = [];
  child.stdout.on('data', (d) => log.push(d.toString()));
  child.stderr.on('data', (d) => log.push(d.toString()));

  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`server spadl při startu:\n${log.join('')}`);
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return child;
    } catch {
      /* ještě nenaběhl */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill('SIGKILL');
  throw new Error(`server nenaběhl do 10 s:\n${log.join('')}`);
}

async function run(db) {
  const stationId = db.prepare('SELECT id FROM station ORDER BY id LIMIT 1').get().id;
  const spareStationId = db.prepare('SELECT id FROM station ORDER BY id DESC LIMIT 1').get().id;
  const missingId = 9999999;
  const device = (suffix) => `smoke-device-${suffix}-0123456789`;

  section('health a statické stránky');
  {
    const res = await get('/health');
    checkStatus('GET /health', res, 200);
    check('/health ok:true', res.json?.ok === true);
    // Schválně nic víc: jméno databáze ani stav notifikací je informace o vnitřku
    // serveru a monitoring ji nepotřebuje.
    check('/health neprozrazuje jméno DB', !('db' in (res.json || {})));
    check('/health neprozrazuje stav mailu', !('mail' in (res.json || {})));
    check('/health má nosniff', res.headers.get('x-content-type-options') === 'nosniff');
    check('/health má X-Frame-Options', res.headers.get('x-frame-options') === 'DENY');
    check('/health má Referrer-Policy', res.headers.get('referrer-policy') === 'no-referrer');
  }
  {
    const res = await get('/privacy');
    checkStatus('GET /privacy', res, 200);
    check('/privacy vrací HTML', res.text.includes('<html') || res.text.includes('<!DOCTYPE'));
    check(
      '/privacy má Content-Security-Policy',
      (res.headers.get('content-security-policy') || '').includes("frame-ancestors 'none'")
    );
  }

  section('GET /api/map');
  {
    const res = await get('/api/map');
    checkStatus('GET /api/map', res, 200);
    check('/api/map je neprázdné pole', Array.isArray(res.json) && res.json.length > 0);
    const row = res.json?.[0] || {};
    for (const key of ['id', 'lat', 'lon', 'brand_name', 'rating_avg', 'rating_count', 'has_98', 'has_100']) {
      check(`/api/map položka má ${key}`, key in row);
    }
    check('/api/map rating_count je číslo', typeof row.rating_count === 'number');
    check('/api/map nemá stanici bez souřadnic', res.json.every((s) => typeof s.lat === 'number' && typeof s.lon === 'number'));
    const slash = await get('/api/map/');
    checkStatus('GET /api/map/ (se lomítkem)', slash, 200);
    check('/api/map/ vrací stejný počet', slash.json?.length === res.json?.length);
  }
  {
    // Odpověď má přes sto kilobajtů a mění se po kapkách – aplikace ji musí umět
    // jen ověřit místo znovustažení.
    const res = await get('/api/map/');
    const etag = res.headers.get('etag');
    check('/api/map/ posílá ETag', Boolean(etag), `etag=${etag}`);
    check('/api/map/ má Cache-Control: no-cache', res.headers.get('cache-control') === 'no-cache');

    // `Cache-Control: max-age=0` je tu schválně: node-ovský fetch jinak sám přidá
    // `no-cache` a tím si o plnou odpověď řekne, takže by se 304 nikdy neukázala.
    const revalidated = await fetch(`${BASE}/api/map/`, {
      headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' },
    });
    check('/api/map/ s If-None-Match → 304', revalidated.status === 304, `dostal ${revalidated.status}`);
    check('304 nemá tělo', (await revalidated.text()).length === 0);
  }
  {
    // Uložený JSON se musí zahodit, jakmile se data změní – jinak by admin uložil
    // změnu a v mapě by ji minutu nikdo neviděl.
    const before = (await get('/api/map/')).headers.get('etag');
    const original = db.prepare('SELECT * FROM station WHERE id = ?').get(stationId);
    await post('/api/admin/stations', { ...original, brand_name: 'Smoke Značka' }, { auth: true });

    const after = await get('/api/map/');
    check('zápis do stanice zneplatnil cache mapy', after.headers.get('etag') !== before);
    check(
      'změna značky je v mapě hned',
      after.json.find((s) => s.id === stationId)?.brand_name === 'Smoke Značka'
    );
    await post('/api/admin/stations', original, { auth: true });
  }

  section('GET /api/detail/:id');
  {
    const res = await get(`/api/detail/${stationId}`);
    checkStatus(`GET /api/detail/${stationId}`, res, 200);
    check('detail má id', res.json?.id === stationId);
    for (const key of ['lat', 'lon', 'brand_name', 'name', 'city', 'address', 'zip', 'worktime']) {
      check(`detail má ${key}`, key in (res.json || {}));
    }
    check('detail.fuels je pole', Array.isArray(res.json?.fuels));
    check('detail.services je pole', Array.isArray(res.json?.services));
    check(
      'detail.services má tvar {key,value}',
      res.json?.services.length === 0 || ('key' in res.json.services[0] && 'value' in res.json.services[0])
    );
  }
  {
    const res = await get(`/api/detail/${missingId}`);
    checkStatus('GET /api/detail/<neexistující>', res, 404);
    check('detail 404 má message', typeof res.json?.message === 'string');
  }
  {
    const res = await get('/api/detail/abc');
    checkStatus('GET /api/detail/abc', res, 400);
    check('detail 400 je validation_error', isValidationError(res));
  }

  section('GET /api/stations/:id/feedback');
  {
    const res = await get(`/api/stations/${stationId}/feedback`);
    checkStatus('GET feedback', res, 200);
    check('feedback.station_id', res.json?.station_id === stationId);
    check('feedback.rating.count je číslo', typeof res.json?.rating?.count === 'number');
    check('feedback.rating.distribution má 5 klíčů', Object.keys(res.json?.rating?.distribution || {}).length === 5);
    check('feedback.reviews je pole', Array.isArray(res.json?.reviews));
    check('feedback.fuel má verdict', typeof res.json?.fuel?.verdict === 'string');
    check('feedback.fuel má e5/e10/total', ['e5', 'e10', 'total'].every((k) => k in (res.json?.fuel || {})));
    check('feedback.open_reports je číslo', typeof res.json?.open_reports === 'number');
    check('feedback.mine je null bez device_id', res.json?.mine === null);
  }
  {
    const res = await get(`/api/stations/${stationId}/feedback?device_id=${device('none')}`);
    checkStatus('GET feedback s device_id', res, 200);
    check('feedback.mine je objekt', res.json?.mine !== null && typeof res.json?.mine === 'object');
    check('feedback.mine.review je null', res.json?.mine?.review === null);
    check('feedback.mine.fuel_kind je null', res.json?.mine?.fuel_kind === null);
  }
  {
    const res = await get(`/api/stations/${missingId}/feedback`);
    checkStatus('GET feedback neexistující stanice', res, 404);
  }

  section('hodnocení – vytvoření, úprava, smazání');
  const reviewDevice = device('review');
  let createdReviewId = null;
  {
    const res = await post(`/api/stations/${stationId}/reviews`, {
      device_id: reviewDevice,
      rating: 4,
      comment: 'Slušná pumpa, natankoval jsem sto oktanů.',
      author: 'Smoke',
    });
    checkStatus('POST review (nové)', res, 201);
    check('review ok:true', res.json?.ok === true);
    check('review.rating = 4', res.json?.review?.rating === 4);
    check('review.status published', res.json?.review?.status === 'published');
    check('review.id je číslo', typeof res.json?.review?.id === 'number');
    check('odpověď nese rating souhrn', typeof res.json?.rating?.count === 'number');
    createdReviewId = res.json?.review?.id;
  }
  {
    const res = await post(`/api/stations/${stationId}/reviews`, {
      device_id: reviewDevice,
      rating: 2,
      comment: 'Po druhé už to tak slavné nebylo.',
    });
    checkStatus('POST review (úprava)', res, 200);
    check('úprava přepsala rating', res.json?.review?.rating === 2);
    check('úprava vrací stejné id', res.json?.review?.id === createdReviewId);
  }
  {
    const res = await get(`/api/stations/${stationId}/feedback?device_id=${reviewDevice}`);
    check('feedback vrací moje hodnocení', res.json?.mine?.review?.id === createdReviewId);
    check('feedback.rating.count > 0', res.json?.rating?.count > 0);
    check(
      'hodnocení je v seznamu',
      (res.json?.reviews || []).some((r) => r.id === createdReviewId)
    );
  }
  {
    const res = await del(`/api/stations/${stationId}/reviews`, { device_id: reviewDevice });
    checkStatus('DELETE review', res, 200);
    check('smazání ok:true', res.json?.ok === true);
    check('smazání vrací rating souhrn', typeof res.json?.rating?.count === 'number');
  }
  {
    const res = await del(`/api/stations/${stationId}/reviews`, { device_id: reviewDevice });
    checkStatus('DELETE review podruhé', res, 404);
    check('opakované smazání je not_found', res.json?.error === 'not_found');
  }

  section('hodnocení – validace');
  const badReviews = [
    ['bez device_id', { rating: 4 }],
    ['krátké device_id', { device_id: 'abc', rating: 4 }],
    ['bez rating', { device_id: device('v1') }],
    ['rating 0', { device_id: device('v2'), rating: 0 }],
    ['rating 6', { device_id: device('v3'), rating: 6 }],
    ['rating není celé číslo', { device_id: device('v4'), rating: 3.5 }],
    ['příliš dlouhý komentář', { device_id: device('v5'), rating: 4, comment: 'a'.repeat(1001) }],
    ['příliš dlouhá přezdívka', { device_id: device('v6'), rating: 4, author: 'b'.repeat(41) }],
    ['vulgarismus', { device_id: device('v7'), rating: 4, comment: 'Naprostá kurva pumpa' }],
    ['odkaz v komentáři', { device_id: device('v8'), rating: 4, comment: 'Mrkni na https://spam.example' }],
    ['komentář není text', { device_id: device('v9'), rating: 4, comment: 42 }],
  ];
  for (const [label, body] of badReviews) {
    const res = await post(`/api/stations/${stationId}/reviews`, body);
    checkStatus(`POST review – ${label}`, res, 400);
    check(`review – ${label} je validation_error`, isValidationError(res));
  }
  {
    const res = await post(`/api/stations/${missingId}/reviews`, { device_id: device('v10'), rating: 4 });
    checkStatus('POST review na neexistující stanici', res, 404);
  }

  section('hlášení');
  let createdReportId = null;
  {
    const res = await post(`/api/stations/${stationId}/reports`, {
      device_id: device('report'),
      type: 'closed',
      note: 'Zavřeno kvůli rekonstrukci.',
    });
    checkStatus('POST report', res, 201);
    check('report ok:true', res.json?.ok === true);
    check('report_id je číslo', typeof res.json?.report_id === 'number');
    createdReportId = res.json?.report_id;
  }
  {
    const res = await post(`/api/stations/${stationId}/reports`, {
      device_id: device('report-fuel'),
      type: 'fuel',
      fuel_name: 'Verva 100',
    });
    checkStatus('POST report (fuel)', res, 201);
  }
  {
    const res = await get(`/api/stations/${stationId}/feedback`);
    check('feedback.open_reports vzrostl', res.json?.open_reports >= 2, `open_reports=${res.json?.open_reports}`);
  }
  const badReports = [
    ['bez device_id', { type: 'closed' }],
    ['neznámý typ', { device_id: device('r1'), type: 'nesmysl' }],
    ['bez typu', { device_id: device('r2') }],
    ['other bez poznámky', { device_id: device('r3'), type: 'other' }],
    ['content bez review_id', { device_id: device('r4'), type: 'content' }],
    ['příliš dlouhá poznámka', { device_id: device('r5'), type: 'closed', note: 'a'.repeat(1001) }],
    ['vulgarismus v poznámce', { device_id: device('r6'), type: 'other', note: 'Ten zmrd tam nebyl' }],
  ];
  for (const [label, body] of badReports) {
    const res = await post(`/api/stations/${stationId}/reports`, body);
    checkStatus(`POST report – ${label}`, res, 400);
    check(`report – ${label} je validation_error`, isValidationError(res));
  }
  {
    const res = await post(`/api/stations/${missingId}/reports`, { device_id: device('r7'), type: 'closed' });
    checkStatus('POST report na neexistující stanici', res, 404);
  }
  {
    const spamDevice = device('spam');
    for (let i = 0; i < 3; i += 1) {
      await post(`/api/stations/${stationId}/reports`, { device_id: spamDevice, type: 'closed' });
    }
    const res = await post(`/api/stations/${stationId}/reports`, { device_id: spamDevice, type: 'closed' });
    checkStatus('POST report – čtvrté hlášení téhož zařízení', res, 429);
    check('denní limit hlášení je too_many_reports', res.json?.error === 'too_many_reports');
  }

  section('hlasování o typu paliva');
  const voteDevice = device('vote');
  {
    const res = await post(`/api/stations/${stationId}/fuel-vote`, { device_id: voteDevice, fuel_kind: 'e5' });
    checkStatus('POST fuel-vote e5', res, 200);
    check('fuel-vote ok:true', res.json?.ok === true);
    check('fuel-vote vrací e5 >= 1', res.json?.fuel?.e5 >= 1);
    check('fuel-vote vrací verdict', typeof res.json?.fuel?.verdict === 'string');
  }
  {
    const res = await post(`/api/stations/${stationId}/fuel-vote`, { device_id: voteDevice, fuel_kind: 'e10' });
    checkStatus('POST fuel-vote přehlasování', res, 200);
    check('přehlasování nezvýšilo total', res.json?.fuel?.e5 === 0 && res.json?.fuel?.e10 >= 1);
  }
  {
    const res = await get(`/api/stations/${stationId}/feedback?device_id=${voteDevice}`);
    check('feedback vrací můj hlas', res.json?.mine?.fuel_kind === 'e10');
  }
  {
    const res = await post(`/api/stations/${stationId}/fuel-vote`, { device_id: device('vote2'), fuel_kind: 'e5' });
    check('druhý hlas → total 2', res.json?.fuel?.total === 2, `total=${res.json?.fuel?.total}`);
    check('rozporuplné hlasy → disputed', res.json?.fuel?.verdict === 'disputed', `verdict=${res.json?.fuel?.verdict}`);
  }
  for (const [label, body] of [
    ['bez device_id', { fuel_kind: 'e5' }],
    ['neznámé palivo', { device_id: device('f1'), fuel_kind: 'e99' }],
    ['zrušená volba unknown', { device_id: device('f2'), fuel_kind: 'unknown' }],
    ['bez fuel_kind', { device_id: device('f3') }],
  ]) {
    const res = await post(`/api/stations/${stationId}/fuel-vote`, body);
    checkStatus(`POST fuel-vote – ${label}`, res, 400);
    check(`fuel-vote – ${label} je validation_error`, isValidationError(res));
  }

  section('žádosti o benzínku – odeslání');
  // Osm volných míst: kontrola duplicit by jinak legitimní test zablokovala.
  const spots = findFreeSpots(db, 8);
  check('našlo se osm míst bez benzínky v okolí', spots.length === 8, `nalezeno ${spots.length}`);
  const requestDevice = device('request');
  let requestId = null;
  {
    const res = await post('/api/station-requests', {
      device_id: requestDevice,
      lat: spots[0].lat,
      lon: spots[0].lon,
      brand_name: 'Smoke Pumpa',
      name: 'U testovacího sjezdu',
      city: 'Smokov',
      address: 'Testovací 1',
      fuels: ['octane_100', 'octane_98'],
      note: 'Nová pumpa u sjezdu, natankoval jsem tam stovku.',
    });
    checkStatus('POST /api/station-requests', res, 201);
    check('žádost ok:true', res.json?.ok === true);
    check('žádost vrací request_id', typeof res.json?.request_id === 'number');
    check('žádost vzniká ve stavu new', res.json?.status === 'new');
    requestId = res.json?.request_id;
  }
  {
    // Odesláním stanice nevzniká – to je celý smysl schvalování.
    const res = await get('/api/map/');
    check(
      'odeslaná žádost se do mapy nepropsala',
      !(res.json || []).some((s) => s.brand_name === 'Smoke Pumpa')
    );
  }

  section('žádosti o benzínku – validace');
  const validFuels = ['octane_100'];
  const at = (spot, extra = {}) => ({ lat: spot.lat, lon: spot.lon, fuels: validFuels, ...extra });
  for (const [label, body] of [
    ['bez device_id', at(spots[1])],
    // `Number(null)` i `Number('')` je nula, takže chybějící souřadnice nesmí projít
    // jako platný bod na rovníku.
    ['bez souřadnic', { device_id: device('sr1'), fuels: validFuels }],
    ['prázdný lat', at(spots[1], { device_id: device('sr2'), lat: '' })],
    ['lat null', at(spots[1], { device_id: device('sr3'), lat: null })],
    ['lat není číslo', at(spots[1], { device_id: device('sr4'), lat: 'sever' })],
    ['lat mimo rozsah', at(spots[1], { device_id: device('sr5'), lat: 91 })],
    ['lon mimo rozsah', at(spots[1], { device_id: device('sr6'), lon: -181 })],
    ['bez paliv', { device_id: device('sr7'), lat: spots[1].lat, lon: spots[1].lon }],
    ['prázdná paliva', at(spots[1], { device_id: device('sr8'), fuels: [] })],
    ['neznámé palivo', at(spots[1], { device_id: device('sr9'), fuels: ['petrolej'] })],
    ['paliva nejsou pole', at(spots[1], { device_id: device('sr10'), fuels: 'octane_100' })],
    ['odkaz v poznámce', at(spots[1], { device_id: device('sr11'), note: 'Mrkni na https://spam.example' })],
    ['vulgarismus v poznámce', at(spots[1], { device_id: device('sr12'), note: 'Ten zmrd tam nebyl' })],
    ['příliš dlouhá poznámka', at(spots[1], { device_id: device('sr13'), note: 'a'.repeat(1001) })],
    ['značka není text', at(spots[1], { device_id: device('sr14'), brand_name: { zle: true } })],
  ]) {
    const res = await post('/api/station-requests', body);
    checkStatus(`POST station-request – ${label}`, res, 400);
    check(`station-request – ${label} je validation_error`, isValidationError(res));
  }

  section('žádosti o benzínku – duplicity');
  {
    const res = await post('/api/station-requests', {
      device_id: device('dup-first'),
      ...at(spots[1], { brand_name: 'Smoke Duplikát', city: 'Duplikov' }),
    });
    checkStatus('POST station-request (podklad pro duplicitu)', res, 201);
  }
  {
    // Zhruba 55 m severně – pořád tatáž pumpa, jen zaměřená z druhé strany.
    const res = await post('/api/station-requests', {
      device_id: device('dup-second'),
      ...at({ lat: spots[1].lat + 0.0005, lon: spots[1].lon }),
    });
    checkStatus('POST station-request – čekající žádost do 150 m', res, 409);
    check('duplicitní žádost má kód duplicate_station', res.json?.error === 'duplicate_station');
    check(
      'duplicitní žádost pojmenuje, co našla',
      (res.json?.message || '').includes('Smoke Duplikát'),
      res.json?.message
    );
  }
  {
    // Asi 330 m daleko – to už je jiná pumpa a projít musí.
    const res = await post('/api/station-requests', {
      device_id: device('dup-far'),
      ...at({ lat: spots[1].lat + 0.003, lon: spots[1].lon }),
    });
    checkStatus('POST station-request – 330 m od žádosti projde', res, 201);
  }

  section('žádosti o benzínku – denní limit');
  {
    const spamDevice = device('request-spam');
    let allAccepted = true;
    for (const spot of [spots[2], spots[3], spots[4]]) {
      const res = await post('/api/station-requests', { device_id: spamDevice, ...at(spot) });
      if (res.status !== 201) allAccepted = false;
    }
    check('tři žádosti za den projdou', allAccepted);

    const res = await post('/api/station-requests', { device_id: spamDevice, ...at(spots[5]) });
    checkStatus('POST station-request – čtvrtá žádost téhož zařízení', res, 429);
    check('denní limit je too_many_station_requests', res.json?.error === 'too_many_station_requests');
  }

  section('moje žádosti');
  {
    const res = await get(`/api/station-requests?device_id=${requestDevice}`);
    checkStatus('GET /api/station-requests', res, 200);
    check('moje žádosti jsou pole', Array.isArray(res.json));
    const row = (res.json || []).find((r) => r.id === requestId);
    check('seznam obsahuje moji žádost', Boolean(row));
    for (const key of [
      'id', 'lat', 'lon', 'brand_name', 'city', 'status', 'admin_note',
      'created_at', 'resolved_at', 'station_id',
    ]) {
      check(`moje žádost má ${key}`, row ? key in row : false);
    }
    check('moje žádost neprozrazuje device_id', row ? !('device_id' in row) : false);
    check('moje žádosti se neukládají do cache', res.headers.get('cache-control') === 'no-store');
  }
  {
    const res = await get(`/api/station-requests?device_id=${device('cizi')}`);
    checkStatus('GET /api/station-requests cizího zařízení', res, 200);
    check('cizí zařízení nevidí moje žádosti', Array.isArray(res.json) && res.json.length === 0);
  }
  {
    const res = await get('/api/station-requests');
    checkStatus('GET /api/station-requests bez device_id', res, 400);
    check('bez device_id je validation_error', isValidationError(res));
  }

  section('admin – žádosti o benzínku');
  let approvedStationId = null;
  {
    const res = await get('/api/admin/station-requests', { auth: true });
    checkStatus('GET /api/admin/station-requests', res, 200);
    check('žádosti jsou pole', Array.isArray(res.json));
    const row = (res.json || []).find((r) => r.id === requestId);
    check('seznam obsahuje novou žádost', Boolean(row));
    check('admin vidí device_id', row ? typeof row.device_id === 'string' : false);
    check('admin vidí poznámku uživatele', row?.note?.includes('sjezdu'));
    check('paliva jsou pole klíčů', Array.isArray(row?.fuels) && row.fuels.includes('octane_100'));
    check('žádost má status new', row?.status === 'new');
  }
  {
    const res = await get('/api/admin/station-requests?status=new', { auth: true });
    checkStatus('GET station-requests?status=new', res, 200);
    check('filtr vrací jen new', (res.json || []).every((r) => r.status === 'new'));
  }
  {
    const res = await get('/api/admin/station-requests?status=nesmysl', { auth: true });
    checkStatus('GET station-requests?status=nesmysl', res, 400);
    check('neznámý filtr žádostí je bad_request', res.json?.error === 'bad_request');
  }
  {
    const res = await patch(`/api/admin/station-requests/${requestId}`, { status: 'nesmysl' }, { auth: true });
    checkStatus('PATCH žádost – neplatný status', res, 400);
    check('neplatný status žádosti je validation_error', isValidationError(res));
  }
  {
    const res = await patch(`/api/admin/station-requests/${missingId}`, { status: 'approved' }, { auth: true });
    checkStatus('PATCH žádost – neexistující id', res, 404);
  }
  {
    const res = await patch('/api/admin/station-requests/abc', { status: 'approved' }, { auth: true });
    checkStatus('PATCH žádost – neplatné id', res, 400);
  }
  {
    const before = (await get('/api/map/')).headers.get('etag');
    const res = await patch(
      `/api/admin/station-requests/${requestId}`,
      { status: 'approved', admin_note: 'Ověřeno podle fotky.' },
      { auth: true }
    );
    checkStatus('PATCH žádost → approved', res, 200);
    check('schválení ok:true', res.json?.ok === true);
    check('schválení vrací station_id', typeof res.json?.station_id === 'number');
    approvedStationId = res.json?.station_id;

    const map = await get('/api/map/');
    check('schválení zneplatnilo cache mapy', map.headers.get('etag') !== before);
    const marker = (map.json || []).find((s) => s.id === approvedStationId);
    check('schválená stanice je v mapě', Boolean(marker));
    check('stanice v mapě má značku ze žádosti', marker?.brand_name === 'Smoke Pumpa');
    check('stanice v mapě má souřadnice ze žádosti', marker?.lat === spots[0].lat && marker?.lon === spots[0].lon);
    check('stanice v mapě hlásí has_100', marker?.has_100 === 1);
    check('stanice v mapě hlásí has_98', marker?.has_98 === 1);
    // Bit 0 = octane_100, bit 1 = octane_98 (src/fuel-flags.js).
    check('maska paliv je 3 (100 + 98)', marker?.f === 3, `f=${marker?.f}`);
  }
  {
    const res = await get(`/api/detail/${approvedStationId}`);
    checkStatus('GET detail schválené stanice', res, 200);
    check('detail má název ze žádosti', res.json?.name === 'U testovacího sjezdu');
    check('detail má obec ze žádosti', res.json?.city === 'Smokov');
    check('detail má adresu ze žádosti', res.json?.address === 'Testovací 1');
    check('detail má obě paliva', ['octane_100', 'octane_98'].every((f) => (res.json?.fuels || []).includes(f)));
    // Poznámka uživatele patří administraci, ne veřejnému detailu stanice.
    check('poznámka ze žádosti se do detailu nepropsala', !res.json?.note);
  }
  {
    const res = await get(`/api/station-requests?device_id=${requestDevice}`);
    const row = (res.json || []).find((r) => r.id === requestId);
    check('moje žádost je schválená', row?.status === 'approved');
    check('moje žádost odkazuje na stanici', row?.station_id === approvedStationId);
    check('moje žádost má datum vyřízení', typeof row?.resolved_at === 'string');
  }
  {
    const res = await patch(`/api/admin/station-requests/${requestId}`, { status: 'approved' }, { auth: true });
    checkStatus('PATCH žádost – opakované schválení', res, 409);
    check('opakované schválení je already_approved', res.json?.error === 'already_approved');
  }
  {
    // Schválená stanice se do kontroly duplicit musí započítat okamžitě.
    const res = await post('/api/station-requests', { device_id: device('dup-station'), ...at(spots[0]) });
    checkStatus('POST station-request – na místě schválené stanice', res, 409);
    check('duplicita proti stanici má kód duplicate_station', res.json?.error === 'duplicate_station');
    check(
      'duplicita proti stanici pojmenuje benzínku',
      (res.json?.message || '').includes('Smoke Pumpa'),
      res.json?.message
    );
  }
  {
    // Hodnocení uživatelské stanice musí přežít i přestavbu z OSM (níž).
    const res = await post(`/api/stations/${approvedStationId}/reviews`, {
      device_id: device('user-station'),
      rating: 5,
      comment: 'Hodnocení uživatelské stanice.',
    });
    checkStatus('POST hodnocení schválené stanice', res, 201);
  }

  let rejectedRequestId = null;
  {
    const created = await post('/api/station-requests', {
      device_id: device('reject'),
      ...at(spots[6], { brand_name: 'Smoke Zamítnutá' }),
    });
    rejectedRequestId = created.json?.request_id;
    check('připravena žádost k zamítnutí', typeof rejectedRequestId === 'number');

    const res = await patch(`/api/admin/station-requests/${rejectedRequestId}`, { status: 'rejected' }, { auth: true });
    checkStatus('PATCH žádost → rejected bez důvodu', res, 400);
    check('zamítnutí bez důvodu je validation_error', isValidationError(res));
    check('chyba ukazuje na admin_note', res.json?.field === 'admin_note');
  }
  {
    const res = await patch(
      `/api/admin/station-requests/${rejectedRequestId}`,
      { status: 'rejected', admin_note: 'Na téhle adrese žádná pumpa není.' },
      { auth: true }
    );
    checkStatus('PATCH žádost → rejected s důvodem', res, 200);

    const mine = await get(`/api/station-requests?device_id=${device('reject')}`);
    const row = (mine.json || []).find((r) => r.id === rejectedRequestId);
    check('zamítnutá žádost má status rejected', row?.status === 'rejected');
    check('uživatel vidí důvod zamítnutí', row?.admin_note === 'Na téhle adrese žádná pumpa není.');
    check('zamítnutá žádost nemá station_id', row?.station_id === null);

    const map = await get('/api/map/');
    check(
      'zamítnutá žádost stanici nezaložila',
      !(map.json || []).some((s) => s.brand_name === 'Smoke Zamítnutá')
    );
  }
  {
    const created = await post('/api/station-requests', {
      device_id: device('delete'),
      ...at(spots[7]),
    });
    const id = created.json?.request_id;
    check('připravena žádost ke smazání', typeof id === 'number');

    const res = await del(`/api/admin/station-requests/${id}`, undefined, { auth: true });
    checkStatus('DELETE žádost', res, 200);
    const again = await del(`/api/admin/station-requests/${id}`, undefined, { auth: true });
    checkStatus('DELETE žádost podruhé', again, 404);
  }
  {
    const res = await del('/api/admin/station-requests/abc', undefined, { auth: true });
    checkStatus('DELETE žádost – neplatné id', res, 400);
  }

  section('obecné chybové stavy');
  {
    const res = await post(`/api/stations/${stationId}/fuel-vote`, '{tohle není JSON', { raw: true });
    checkStatus('POST s rozbitým JSON', res, 400);
    check('rozbitý JSON je bad_json', res.json?.error === 'bad_json');
  }
  {
    const res = await get('/api/tohle-neexistuje');
    checkStatus('GET neznámý /api endpoint', res, 404);
    check('neznámý endpoint je not_found JSON', res.json?.error === 'not_found');
  }

  section('admin – bez přihlášení');
  for (const [method, url] of [
    ['GET', '/api/admin/stats'],
    ['GET', '/api/admin/reports'],
    ['GET', '/api/admin/reviews'],
    ['GET', '/api/admin/stations'],
    ['GET', '/api/admin/station-requests'],
    ['GET', '/api/admin/fuel-votes'],
    ['POST', '/api/admin/test-mail'],
    ['GET', '/admin'],
    ['GET', '/'],
  ]) {
    const res = await call(method, url);
    checkStatus(`${method} ${url} bez auth`, res, 401);
  }
  {
    const res = await get('/api/admin/stats');
    check('401 nese WWW-Authenticate challenge', res.headers.get('www-authenticate')?.startsWith('Basic'));
  }
  {
    // Prohlížeč si údaje basic auth pamatuje a přiloží je i k requestu, který
    // vyvolala cizí stránka. Hlavička Origin je jediné, podle čeho to poznáme.
    const cizi = await fetch(`${BASE}/api/admin/stations/1`, {
      method: 'DELETE',
      headers: { Authorization: adminHeader, Origin: 'https://podvod.example' },
    });
    check('admin odmítne požadavek z cizí stránky', cizi.status === 403, `dostal ${cizi.status}`);

    const vlastni = await fetch(`${BASE}/api/admin/stats`, {
      headers: { Authorization: adminHeader, Origin: BASE },
    });
    check('admin pustí požadavek z vlastní stránky', vlastni.status === 200, `dostal ${vlastni.status}`);
  }

  section('admin – s přihlášením');
  {
    const res = await get('/api/admin/stats', { auth: true });
    checkStatus('GET /api/admin/stats', res, 200);
    for (const key of [
      'stations', 'stations98', 'stations100', 'stationsWithoutFuels',
      'reviews', 'reviewsHidden', 'ratingAverage',
      'reportsNew', 'reportsInReview', 'reportsTotal',
      'fuelVotes', 'stationsWithE5', 'last7dReports', 'last7dReviews', 'mail_configured',
    ]) {
      check(`stats má ${key}`, key in (res.json || {}));
    }
    check('stats.stations > 0', res.json?.stations > 0);
  }
  {
    const res = await get('/admin', { auth: true });
    checkStatus('GET /admin s auth', res, 200);
    check('/admin vrací HTML', res.text.includes('<html') || res.text.includes('<!DOCTYPE'));
    const root = await get('/', { auth: true });
    checkStatus('GET / s auth', root, 200);
  }

  section('admin – hlášení');
  {
    const res = await get('/api/admin/reports', { auth: true });
    checkStatus('GET /api/admin/reports', res, 200);
    check('reports je pole', Array.isArray(res.json));
    const row = (res.json || []).find((r) => r.id === createdReportId);
    check('seznam obsahuje nové hlášení', Boolean(row));
    check('hlášení má join na stanici', row && 'brand_name' in row && 'station_name' in row);
    check('hlášení má status new', row?.status === 'new');
  }
  {
    const res = await get('/api/admin/reports?status=new', { auth: true });
    checkStatus('GET reports?status=new', res, 200);
    check('filtr vrací jen new', (res.json || []).every((r) => r.status === 'new'));
  }
  {
    const res = await get('/api/admin/reports?status=nesmysl', { auth: true });
    checkStatus('GET reports?status=nesmysl', res, 400);
    check('neznámý filtr je bad_request', res.json?.error === 'bad_request');
  }
  {
    const res = await patch(`/api/admin/reports/${createdReportId}`, { status: 'in_review', admin_note: 'Koukám na to.' }, { auth: true });
    checkStatus('PATCH report status', res, 200);
    check('PATCH report ok:true', res.json?.ok === true);
    const list = await get('/api/admin/reports?status=in_review', { auth: true });
    const row = (list.json || []).find((r) => r.id === createdReportId);
    check('status se opravdu změnil', row?.status === 'in_review');
    check('admin_note se uložila', row?.admin_note === 'Koukám na to.');
  }
  {
    const res = await patch(`/api/admin/reports/${createdReportId}`, { status: 'nesmysl' }, { auth: true });
    checkStatus('PATCH report – neplatný status', res, 400);
    check('neplatný status je validation_error', isValidationError(res));
  }
  {
    const res = await patch(`/api/admin/reports/${missingId}`, { status: 'resolved' }, { auth: true });
    checkStatus('PATCH report – neexistující id', res, 404);
  }
  {
    const res = await patch('/api/admin/reports/abc', { status: 'resolved' }, { auth: true });
    checkStatus('PATCH report – neplatné id', res, 400);
  }
  {
    const res = await del(`/api/admin/reports/${createdReportId}`, undefined, { auth: true });
    checkStatus('DELETE report', res, 200);
    const again = await del(`/api/admin/reports/${createdReportId}`, undefined, { auth: true });
    checkStatus('DELETE report podruhé', again, 404);
  }

  section('admin – hodnocení');
  let adminReviewId = null;
  {
    const created = await post(`/api/stations/${stationId}/reviews`, {
      device_id: device('admin-review'),
      rating: 5,
      comment: 'Hodnocení pro admin testy.',
    });
    adminReviewId = created.json?.review?.id;
    check('připraveno hodnocení pro admin testy', typeof adminReviewId === 'number');
  }
  {
    const res = await get('/api/admin/reviews', { auth: true });
    checkStatus('GET /api/admin/reviews', res, 200);
    const row = (res.json || []).find((r) => r.id === adminReviewId);
    check('seznam obsahuje nové hodnocení', Boolean(row));
    check('hodnocení má join na stanici', row && 'brand_name' in row && 'station_name' in row);
    check('hodnocení má device_id', row && 'device_id' in row);
  }
  {
    const res = await get('/api/admin/reviews?status=nesmysl', { auth: true });
    checkStatus('GET reviews?status=nesmysl', res, 400);
  }
  {
    const res = await patch(`/api/admin/reviews/${adminReviewId}`, { status: 'hidden' }, { auth: true });
    checkStatus('PATCH review → hidden', res, 200);
    const list = await get('/api/admin/reviews?status=hidden', { auth: true });
    check('hodnocení je skryté', (list.json || []).some((r) => r.id === adminReviewId));
    const feedback = await get(`/api/stations/${stationId}/feedback`);
    check(
      'skryté hodnocení zmizelo z veřejného výpisu',
      !(feedback.json?.reviews || []).some((r) => r.id === adminReviewId)
    );
  }
  {
    const res = await patch(`/api/admin/reviews/${adminReviewId}`, { status: 'nesmysl' }, { auth: true });
    checkStatus('PATCH review – neplatný status', res, 400);
  }
  {
    const res = await patch(`/api/admin/reviews/${missingId}`, { status: 'hidden' }, { auth: true });
    checkStatus('PATCH review – neexistující id', res, 404);
  }
  {
    const res = await del(`/api/admin/reviews/${adminReviewId}`, undefined, { auth: true });
    checkStatus('DELETE review', res, 200);
    const again = await del(`/api/admin/reviews/${adminReviewId}`, undefined, { auth: true });
    checkStatus('DELETE review podruhé', again, 404);
  }

  section('admin – hlasy o palivu');
  {
    const res = await get('/api/admin/fuel-votes', { auth: true });
    checkStatus('GET /api/admin/fuel-votes', res, 200);
    check('fuel-votes je pole', Array.isArray(res.json));
    const row = res.json?.find((r) => r.id === stationId);
    check('stanice s hlasem je v přehledu', Boolean(row));
    for (const key of ['id', 'brand_name', 'station_name', 'city', 'e5', 'e10', 'total', 'verdict']) {
      check(`hlas o palivu má ${key}`, row ? key in row : false);
    }
    check('total odpovídá součtu hlasů', row ? row.total === row.e5 + row.e10 : false);
  }

  section('admin – stanice');
  {
    const res = await get('/api/admin/stations', { auth: true });
    checkStatus('GET /api/admin/stations', res, 200);
    check('stations je neprázdné pole', Array.isArray(res.json) && res.json.length > 0);
    const row = res.json?.[0] || {};
    for (const key of ['id', 'lat', 'lon', 'brand_name', 'name', 'city', 'has_98', 'has_100']) {
      check(`admin stanice má ${key}`, key in row);
    }
  }
  {
    const original = db.prepare('SELECT * FROM station WHERE id = ?').get(stationId);
    const res = await post('/api/admin/stations', { ...original, city: 'Smoke Město' }, { auth: true });
    checkStatus('POST /api/admin/stations (úprava)', res, 200);
    check('úprava stanice ok:true', res.json?.ok === true);
    const detail = await get(`/api/detail/${stationId}`);
    check('úprava se propsala do detailu', detail.json?.city === 'Smoke Město', `city=${detail.json?.city}`);
    await post('/api/admin/stations', original, { auth: true });
  }
  {
    // Souřadnice se posílají i s desetinnou čárkou (české klávesnice) – to projít musí.
    const original = db.prepare('SELECT * FROM station WHERE id = ?').get(stationId);
    const res = await post(
      '/api/admin/stations',
      { ...original, lat: String(original.lat).replace('.', ',') },
      { auth: true }
    );
    checkStatus('POST /api/admin/stations (lat s čárkou)', res, 200);
    const detail = await get(`/api/detail/${stationId}`);
    check('lat s čárkou se uložil jako číslo', detail.json?.lat === original.lat, `lat=${detail.json?.lat}`);
    await post('/api/admin/stations', original, { auth: true });
  }
  {
    const original = db.prepare('SELECT * FROM station WHERE id = ?').get(stationId);
    for (const [label, body] of [
      ['bez id', { brand_name: 'Bez ID' }],
      ['prázdné id', { id: '', brand_name: 'Prázdné' }],
      ['id není číslo', { id: 'abc', brand_name: 'Nečíslo' }],
      ['záporné id', { ...original, id: -5 }],
      // Stanice bez souřadnic by rozbila mapu úplně všem – iOS je dekóduje jako
      // povinná čísla a jediný vadný záznam shodí celý seznam.
      ['chybějící lat', { ...original, lat: null }],
      ['lat není číslo', { ...original, lat: 'sever' }],
      ['lat mimo rozsah', { ...original, lat: 91 }],
      ['lon mimo rozsah', { ...original, lon: -181 }],
      ['brand_id není číslo', { ...original, brand_id: 'abc' }],
      // Bez typové kontroly by tohle spadlo až na zápisu do SQLite jako 500.
      ['name je objekt', { ...original, name: { zle: true } }],
      ['name je pole', { ...original, name: ['a', 'b'] }],
      ['příliš dlouhý brand_name', { ...original, brand_name: 'x'.repeat(200) }],
      ['příliš dlouhá adresa', { ...original, address: 'x'.repeat(500) }],
    ]) {
      const res = await post('/api/admin/stations', body, { auth: true });
      checkStatus(`POST /api/admin/stations – ${label}`, res, 400);
      check(`stanice – ${label} je validation_error`, isValidationError(res));
    }
    const unchanged = db.prepare('SELECT * FROM station WHERE id = ?').get(stationId);
    check('neplatné požadavky stanici nezměnily', unchanged.lat === original.lat && unchanged.name === original.name);
  }
  {
    const res = await del(`/api/admin/stations/${spareStationId}`, undefined, { auth: true });
    checkStatus('DELETE stanice', res, 200);
    const again = await del(`/api/admin/stations/${spareStationId}`, undefined, { auth: true });
    checkStatus('DELETE stanice podruhé', again, 404);
    const detail = await get(`/api/detail/${spareStationId}`);
    checkStatus('smazaná stanice už není v detailu', detail, 404);
  }
  {
    const res = await del('/api/admin/stations/abc', undefined, { auth: true });
    checkStatus('DELETE stanice – neplatné id', res, 400);
  }

  section('admin – testovací e-mail');
  {
    const res = await post('/api/admin/test-mail', undefined, { auth: true });
    checkStatus('POST /api/admin/test-mail (notifikace vypnuté)', res, 503);
    check('test-mail hlásí mail_not_configured', res.json?.error === 'mail_not_configured');
  }

  section('ping');
  {
    const res = await get('/api/ping');
    checkStatus('GET /api/ping', res, 200);
    check('ping hlásí prostředí', res.json?.env === 'production', `dostal ${res.json?.env}`);
  }

  await checkImportProtection(db, approvedStationId);
  await checkAppKeyModes(db);
  await checkHardening(db, stationId);
}

/**
 * Místa, kolem kterých do 150 m není žádná benzínka – jinak by odeslání žádosti
 * skončilo na kontrole duplicit. Mřížka je pevná, ať je běh deterministický;
 * krok 0,05° (asi 5 km) zároveň zaručí, že si vrácené body nekolidují navzájem.
 */
function findFreeSpots(db, count) {
  const stations = db.prepare('SELECT lat, lon FROM station').all();
  const spots = [];

  for (let step = 0; step < 400 && spots.length < count; step += 1) {
    const lat = Number((49.05 + (step % 20) * 0.05).toFixed(5));
    const lon = Number((14.55 + Math.floor(step / 20) * 0.05).toFixed(5));
    // Hrubý obdélník o poloměru asi kilometr – s rezervou nad limitem 150 m.
    const occupied = stations.some((s) => Math.abs(s.lat - lat) < 0.01 && Math.abs(s.lon - lon) < 0.02);
    if (!occupied) spots.push({ lat, lon });
  }
  return spots;
}

/**
 * Nejnebezpečnější místo celé funkce: `scripts/import-osm.js` je kompletní přestavba
 * tabulky `station` a rozdává nejnižší volná `id`. Kdyby uživatelské stanice mazal,
 * přišly by o hodnocení, a kdyby jejich `id` přidělil cizí pumpě, hodnocení by se
 * tiše přepnula k ní.
 *
 * Test běží nad vlastní kopií databáze a uživatelskou stanici v ní schválně přesune
 * na `id` 1, tedy přesně na to, které by import jinak rozdal jako první.
 */
async function checkImportProtection(db, userStationId) {
  section('import z OSM – ochrana uživatelských stanic');
  if (typeof userStationId !== 'number') {
    check('je z čeho vyjít (schválená uživatelská stanice)', false);
    return;
  }

  const Database = require('better-sqlite3');
  const { dir, target } = copyDatabase(db.name);
  const geojsonPath = path.join(dir, 'osm-fixture.geojson');

  const feature = (id, lat, lon, brand) => ({
    type: 'Feature',
    id,
    properties: { '@id': id, amenity: 'fuel', brand, 'fuel:octane_100': 'yes' },
    geometry: { type: 'Point', coordinates: [lon, lat] },
  });
  fs.writeFileSync(
    geojsonPath,
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        feature('node/900000001', 49.9, 15.9, 'Smoke Import A'),
        feature('node/900000002', 49.8, 15.8, 'Smoke Import B'),
      ],
    })
  );

  try {
    const seed = new Database(target);
    // Uvolníme `id` 1 a uživatelskou stanici na něj přesuneme – bez opravy v importu
    // by ho dostala první pumpa z GeoJSONu.
    for (const table of ['review', 'report', 'fuel_vote', 'station_fuel', 'station_tag']) {
      seed.prepare(`DELETE FROM ${table} WHERE station_id = 1`).run();
      seed.prepare(`UPDATE ${table} SET station_id = 1 WHERE station_id = ?`).run(userStationId);
    }
    seed.prepare('DELETE FROM station WHERE id = 1').run();
    seed.prepare('UPDATE station SET id = 1 WHERE id = ?').run(userStationId);
    seed.prepare('UPDATE station_request SET station_id = 1 WHERE station_id = ?').run(userStationId);
    const before = {
      fuels: seed.prepare('SELECT COUNT(*) AS c FROM station_fuel WHERE station_id = 1').get().c,
      reviews: seed.prepare('SELECT COUNT(*) AS c FROM review WHERE station_id = 1').get().c,
    };
    seed.close();
    check('kopie DB má uživatelskou stanici na id 1', before.fuels > 0 && before.reviews > 0);

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'import-osm.js'), '--yes'], {
      cwd: ROOT,
      env: { ...process.env, DB_PATH: target, OSM_GEOJSON: geojsonPath },
      stdio: 'pipe',
    });

    const after = new Database(target, { readonly: true });
    const station = after.prepare('SELECT * FROM station WHERE id = 1').get();
    check('uživatelská stanice přestavbu přežila', Boolean(station));
    check('a zůstala uživatelská', station?.data_source === 'user');
    check('a drží si značku ze žádosti', station?.brand_name === 'Smoke Pumpa');
    check(
      'a nechala si paliva',
      after.prepare('SELECT COUNT(*) AS c FROM station_fuel WHERE station_id = 1').get().c === before.fuels
    );
    check(
      'a nechala si hodnocení',
      after.prepare('SELECT COUNT(*) AS c FROM review WHERE station_id = 1').get().c === before.reviews
    );

    const imported = after
      .prepare("SELECT id, brand_name FROM station WHERE data_source <> 'user' ORDER BY id")
      .all();
    check('naimportovaly se obě pumpy z fixtury', imported.length === 2, `${imported.length} stanic`);
    check('import nesáhl na obsazené id 1', imported.every((s) => s.id !== 1));
    check(
      'obsah uživatelské stanice se nepřepsal na cizí pumpu',
      imported.every((s) => s.brand_name !== 'Smoke Pumpa')
    );
    check(
      'žádost pořád ukazuje na svou stanici',
      after.prepare('SELECT COUNT(*) AS c FROM station_request WHERE station_id = 1').get().c === 1
    );
    // Osiřelý obsah po smazaných OSM stanicích uklízí až scripts/cleanup-db.js,
    // ale hodnocení uživatelské stanice tam být nesmí.
    check(
      'stanic je jen fixtura plus uživatelská',
      after.prepare('SELECT COUNT(*) AS c FROM station').get().c === 3
    );
    after.close();
  } catch (e) {
    check('import z OSM proběhl', false, e.stderr ? e.stderr.toString().slice(-500) : e.message);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Limity se počítají v paměti procesu a jednou vyčerpané se za běhu nedají vrátit,
 * takže každý běží na vlastní instanci serveru – jinak by si testy navzájem
 * zavřely dveře.
 */
async function checkHardening(db, stationId) {
  const dbPath = db.name;
  const wrongHeader = `Basic ${Buffer.from(`${adminUser}:rozhodne-spatne-heslo`).toString('base64')}`;

  section('admin – hádání hesla');
  {
    const port = PORT + 3;
    const child = await startServer(dbPath, { port });
    const stats = (headers) => fetch(`http://127.0.0.1:${port}/api/admin/stats`, { headers });
    try {
      let allRejected = true;
      for (let i = 0; i < 10; i += 1) {
        const res = await stats({ Authorization: wrongHeader });
        if (res.status !== 401) allRejected = false;
      }
      check('prvních 10 pokusů dostane 401', allRejected);

      const blocked = await stats({ Authorization: wrongHeader });
      check('11. pokus dostane 429', blocked.status === 429, `dostal ${blocked.status}`);
      check('429 nese Retry-After', Number(blocked.headers.get('retry-after')) > 0);

      // Zámek platí na adresu, ne na heslo – jinak by útočník poznal, že jedno
      // z hesel bylo správné, protože by najednou dostal jinou odpověď.
      const correct = await stats({ Authorization: adminHeader });
      check('po zamčení neprojde ani správné heslo', correct.status === 429, `dostal ${correct.status}`);
    } finally {
      child.kill('SIGKILL');
      await new Promise((r) => child.on('exit', r));
    }
  }
  {
    const port = PORT + 4;
    const child = await startServer(dbPath, { port });
    const stats = (headers) => fetch(`http://127.0.0.1:${port}/api/admin/stats`, { headers });
    try {
      // Prohlížeč se poprvé ptá vždycky bez údajů a čeká na výzvu. Kdyby se to
      // počítalo jako pokus, zamkl by si admin sám sobě po pár otevřeních stránky.
      for (let i = 0; i < 15; i += 1) await stats();
      const correct = await stats({ Authorization: adminHeader });
      check('requesty bez údajů se jako pokus nepočítají', correct.status === 200, `dostal ${correct.status}`);
    } finally {
      child.kill('SIGKILL');
      await new Promise((r) => child.on('exit', r));
    }
  }

  section('strop zápisů podle IP');
  {
    const port = PORT + 5;
    const child = await startServer(dbPath, { port });
    // Endpoint bez vlastního limitu, ať je jisté, že 429 přišla od stropu zápisů.
    // Prázdné tělo skončí na validaci (400), do počtu se ale započítá stejně.
    const write = () =>
      fetch(`http://127.0.0.1:${port}/api/stations/${stationId}/reviews`, { method: 'DELETE' });
    try {
      let hitEarly = false;
      for (let i = 0; i < 120; i += 1) {
        if ((await write()).status === 429) hitEarly = true;
      }
      check('120 zápisů z jedné IP projde', !hitEarly);

      const blocked = await write();
      check('121. zápis dostane 429', blocked.status === 429, `dostal ${blocked.status}`);
      const body = await blocked.json();
      check('429 hlásí too_many_requests', body.error === 'too_many_requests');

      // Čtení má vlastní, mnohem vyšší strop – vyčerpané zápisy ho nesmí zastavit.
      const read = await fetch(`http://127.0.0.1:${port}/api/map/`);
      check('vyčerpaný strop zápisů neblokuje čtení', read.status === 200, `dostal ${read.status}`);
    } finally {
      child.kill('SIGKILL');
      await new Promise((r) => child.on('exit', r));
    }
  }
}

/**
 * Klíč aplikace se testuje na vlastních instancích serveru – režim se čte z env
 * při startu, takže ho za běhu přepnout nejde.
 *
 * Podstatná je hlavně větev `soft`: přes ni se zavádí klíč tak, aby starším
 * buildům aplikace API nepřestalo fungovat ze dne na den.
 */
async function checkAppKeyModes(db) {
  const key = 'smoke-app-key-0123456789';
  const dbPath = db.name;

  const probe = async (port, headers) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/map/`, { headers });
    return res.status;
  };

  for (const [mode, expected] of [
    ['off', { none: 200, wrong: 200, right: 200 }],
    ['soft', { none: 200, wrong: 200, right: 200 }],
    ['hard', { none: 401, wrong: 401, right: 200 }],
  ]) {
    section(`klíč aplikace – režim ${mode}`);
    const port = PORT + 1;
    const child = await startServer(dbPath, { port, extraEnv: { APP_KEY: key, APP_KEY_MODE: mode } });
    try {
      check(`${mode}: bez klíče → ${expected.none}`, (await probe(port)) === expected.none);
      check(
        `${mode}: se špatným klíčem → ${expected.wrong}`,
        (await probe(port, { 'X-App-Key': 'nesmysl' })) === expected.wrong
      );
      check(
        `${mode}: se správným klíčem → ${expected.right}`,
        (await probe(port, { 'X-App-Key': key })) === expected.right
      );
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      check(`${mode}: /health zůstává přístupný bez klíče`, health.status === 200);

      // Přes /api/ping si aplikace ověřuje zadaný kód, takže musí platit stejná
      // pravidla jako pro zbytek API.
      const ping = await fetch(`http://127.0.0.1:${port}/api/ping`, {
        headers: { 'X-App-Key': key },
      });
      check(`${mode}: /api/ping se správným klíčem → 200`, ping.status === 200);
      const pingNoKey = await fetch(`http://127.0.0.1:${port}/api/ping`);
      check(`${mode}: /api/ping bez klíče → ${expected.none}`, pingNoKey.status === expected.none);
    } finally {
      child.kill('SIGKILL');
      await new Promise((r) => child.on('exit', r));
    }
  }

  section('klíč aplikace – pojistky');
  {
    const port = PORT + 2;
    const child = await startServer(dbPath, { port, extraEnv: { APP_KEY: '', APP_KEY_MODE: 'hard' } });
    try {
      // Nevyplněný klíč nesmí zamknout API – jinak by překlep v .env shodil provoz.
      check('hard bez APP_KEY se chová jako off', (await probe(port)) === 200);
    } finally {
      child.kill('SIGKILL');
      await new Promise((r) => child.on('exit', r));
    }
  }
}

async function main() {
  if (!adminUser || !adminPass) {
    console.error('CHYBA: v .env chybí ADMIN_USERNAME / ADMIN_PASSWORD, admin testy by neměly smysl.');
    process.exit(1);
  }
  if (!fs.existsSync(sourceDbPath)) {
    console.error(`CHYBA: databáze ${sourceDbPath} neexistuje.`);
    process.exit(1);
  }

  const { dir, target } = copyDatabase(sourceDbPath);
  console.log(`Testovací kopie DB: ${target}`);

  let child = null;
  const Database = require('better-sqlite3');
  const db = new Database(target, { readonly: true });

  try {
    child = await startServer(target);
    console.log(`Server běží na ${BASE}`);
    await run(db);
  } catch (e) {
    failures.push(`běh testu selhal: ${e.message}`);
    console.error(`\nCHYBA: ${e.stack || e.message}`);
  } finally {
    db.close();
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((r) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          r();
        }, 3000);
        child.on('exit', () => {
          clearTimeout(timer);
          r();
        });
      });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('');
  console.log('────────────────────────── souhrn ──────────────────────────');
  console.log(`Prošlo:  ${passed}`);
  console.log(`Selhalo: ${failures.length}`);
  if (failures.length) {
    console.log('');
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('\nVšechno v pořádku ✔');
}

main();
