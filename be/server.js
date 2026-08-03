// tankuj100 – backend (Express + SQLite).
//
// Obsluhuje:
//   * veřejné API pro iOS aplikaci  ......  /api/...      (src/routes/public.routes.js)
//   * admin API a admin UI  ..............  /admin, /api/admin/...  (basic auth)
//   * zásady ochrany soukromí  ...........  /privacy
//
// Konfigurace se čte z prostředí (PM2 ji předává z tankuj100.config.cjs, lokálně
// stačí `node --env-file=.env server.js`). Viz .env.example.

const path = require('path');
const fs = require('fs');
const express = require('express');
const basicAuth = require('express-basic-auth');

// .env načteme sami, ať funguje `node server.js` i bez --env-file (Node 18+).
loadDotEnv(path.join(__dirname, '.env'));

const { DB_PATH } = require('./src/db');
const publicRoutes = require('./src/routes/public.routes');
const adminRoutes = require('./src/routes/admin.routes');
const { isConfigured: mailConfigured } = require('./src/mailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Za nginx proxy chceme skutečnou IP klienta (kvůli rate-limitu).
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '64kb' }));

// ------------------------------------------------------------------ admin auth

const ADMIN_USER = process.env.ADMIN_USERNAME || '';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '';

/**
 * Ochrana adminu. Když nejsou nastavené údaje, admin se VŮBEC nezveřejní –
 * to je bezpečnější než ho nechat otevřený na internetu.
 */
const requireAdmin = ADMIN_USER && ADMIN_PASS
  ? basicAuth({ users: { [ADMIN_USER]: ADMIN_PASS }, challenge: true, realm: 'tankuj100 admin' })
  : (req, res) =>
      res.status(503).json({
        error: 'admin_disabled',
        message: 'Administrace není nastavená (chybí ADMIN_USERNAME a ADMIN_PASSWORD v .env).',
      });

if (!ADMIN_USER || !ADMIN_PASS) {
  console.warn('⚠️  ADMIN_USERNAME / ADMIN_PASSWORD nejsou nastavené – administrace je vypnutá.');
}

// ------------------------------------------------------------------ routy

// Zdravotní check (hodí se pro monitoring i pro deploy skript).
app.get('/health', (req, res) => {
  res.json({ ok: true, mail: mailConfigured(), db: path.basename(DB_PATH) });
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'privacy.html'));
});

// Admin API + admin UI (musí být před veřejným /api, aby si cesty nekolidovaly).
app.use('/api/admin', requireAdmin, adminRoutes);
app.get('/', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Veřejné API pro aplikaci.
app.use('/api', publicRoutes);

// ------------------------------------------------------------------ chyby

// Neexistující API cesta – ať aplikace nedostane HTML.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Tenhle endpoint neexistuje.' });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Špatný JSON v těle requestu (express.json vyhodí SyntaxError).
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'bad_json', message: 'Data se nepodařilo přečíst.' });
  }
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    error: err.name === 'ValidationError' ? 'validation_error' : 'server_error',
    message:
      status >= 500
        ? 'Na serveru se něco pokazilo. Zkus to prosím za chvíli.'
        : err.message,
    ...(err.field ? { field: err.field } : {}),
  });
});

// ------------------------------------------------------------------ start

const server = app.listen(PORT, () => {
  console.log(`✅ tankuj100 API běží na http://localhost:${PORT}`);
  console.log(`   DB:            ${DB_PATH}`);
  console.log(`   Administrace:  ${ADMIN_USER && ADMIN_PASS ? 'zapnutá (basic auth)' : 'VYPNUTÁ'}`);
  console.log(`   Notifikace:    ${mailConfigured() ? 'EmailJS' : 'jen do logu'}`);
});

// Graceful shutdown, ať PM2 restart nezruší běžící požadavek.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`\n${signal} – ukončuji…`);
    server.close(() => process.exit(0));
  });
}

/** Minimalistický .env parser (KEY=value, # komentáře). Nepřepisuje již nastavené proměnné. */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
