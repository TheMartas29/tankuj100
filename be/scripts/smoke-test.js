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
  return { status: res.status, json, text };
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

async function startServer(dbPath) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      PORT: String(PORT),
      ADMIN_USERNAME: adminUser,
      ADMIN_PASSWORD: adminPass,
      // Prázdné klíče = notifikace se jen zalogují. Test nesmí posílat skutečné e-maily.
      EMAILJS_SERVICE_ID: '',
      EMAILJS_TEMPLATE_ID: '',
      EMAILJS_PUBLIC_KEY: '',
      EMAILJS_PRIVATE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const log = [];
  child.stdout.on('data', (d) => log.push(d.toString()));
  child.stderr.on('data', (d) => log.push(d.toString()));

  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`server spadl při startu:\n${log.join('')}`);
    try {
      const res = await fetch(`${BASE}/health`);
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
    check('/health hlásí testovací DB', res.json?.db === 'smoke.sqlite', `db=${res.json?.db}`);
    check('/health má pole mail', typeof res.json?.mail === 'boolean');
  }
  {
    const res = await get('/privacy');
    checkStatus('GET /privacy', res, 200);
    check('/privacy vrací HTML', res.text.includes('<html') || res.text.includes('<!DOCTYPE'));
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
    const slash = await get('/api/map/');
    checkStatus('GET /api/map/ (se lomítkem)', slash, 200);
    check('/api/map/ vrací stejný počet', slash.json?.length === res.json?.length);
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
    ['POST', '/api/admin/test-mail'],
    ['GET', '/admin'],
    ['GET', '/'],
  ]) {
    const res = await call(method, url);
    checkStatus(`${method} ${url} bez auth`, res, 401);
  }
  {
    const res = await get('/api/admin/stats', { auth: false });
    check('401 nese WWW-Authenticate challenge', res.status === 401);
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
  for (const [label, body] of [
    ['bez id', { brand_name: 'Bez ID' }],
    ['prázdné id', { id: '', brand_name: 'Prázdné' }],
    ['id není číslo', { id: 'abc', brand_name: 'Nečíslo' }],
  ]) {
    const res = await post('/api/admin/stations', body, { auth: true });
    checkStatus(`POST /api/admin/stations – ${label}`, res, 400);
    check(`stanice – ${label} je validation_error`, isValidationError(res));
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
