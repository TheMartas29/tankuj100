const path = require('path');
const express = require('express');

const config = require('./src/config');
const { db, dbPath } = require('./src/db');
const { requireAdmin, sameOriginOnly } = require('./src/http/admin-auth');
const { apiNotFound, errorHandler } = require('./src/http/error-handler');
const publicRoutes = require('./src/routes/public.routes');
const adminRoutes = require('./src/routes/admin.routes');
const visitRoutes = require('./src/routes/visit.routes');
const { isConfigured: mailConfigured } = require('./src/mailer');

const JSON_BODY_LIMIT = '64kb';
const SHUTDOWN_TIMEOUT_MS = 10000;
const page = (name) => path.join(config.rootDir, name);

// Administrace stojí na inline stylech a atributech `onclick`, takže `unsafe-inline`
// vypnout nejde. I tak má politika smysl: zakazuje sáhnout na cokoli z cizí domény,
// takže podstrčený kód nemá kam data odeslat.
const HTML_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

const app = express();

// Za nginx proxy je skutečná adresa klienta až v X-Forwarded-For. Bez tohohle by
// všechny limity počítaly jednoho jediného „uživatele“ 127.0.0.1.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

// Odpovídá jen ano/ne. Jméno databáze ani stav notifikací sem nepatří – to je
// informace o vnitřku serveru a monitoring ji k ničemu nepotřebuje.
app.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true });
});

app.get('/privacy', (req, res) => {
  res.set('Content-Security-Policy', HTML_CSP);
  res.sendFile(page('privacy.html'));
});

// Admin musí být před veřejným /api, aby si cesty nekolidovaly.
app.use('/api/admin', sameOriginOnly, requireAdmin, adminRoutes);
for (const adminPath of ['/', '/admin']) {
  app.get(adminPath, requireAdmin, (req, res) => {
    res.set('Content-Security-Policy', HTML_CSP);
    res.set('Cache-Control', 'no-store');
    res.sendFile(page('index.html'));
  });
}

// Počítadlo návštěv stojí mimo `publicRoutes` schválně: ten router vyžaduje klíč
// aplikace, a tenhle požadavek neposílá aplikace, ale nginx při doručení stránky.
// Místo klíče se prokazuje vlastním tajemstvím z konfigurace.
app.use('/api/visit', visitRoutes);

app.use('/api', publicRoutes);
app.use('/api', apiNotFound);
app.use(errorHandler);

if (!config.admin.enabled) {
  console.warn('⚠️  ADMIN_USERNAME / ADMIN_PASSWORD nejsou nastavené – administrace je vypnutá.');
}

// Ve výchozím stavu posloucháme jen na loopbacku – ven se API dostane výhradně
// přes nginx, který jediný umí HTTPS. Pro ladění na fyzickém telefonu v síti
// se dá přepnout přes HOST=0.0.0.0.
const server = app.listen(config.port, config.host, () => {
  console.log(`✅ tankuj100 API běží na http://${config.host}:${config.port}`);
  console.log(`   DB:            ${dbPath}`);
  console.log(`   Administrace:  ${config.admin.enabled ? 'zapnutá (basic auth)' : 'VYPNUTÁ'}`);
  console.log(`   Klíč aplikace: ${config.appKey.mode}`);
  console.log(`   Notifikace:    ${mailConfigured() ? 'EmailJS' : 'jen do logu'}`);
});

let stopping = false;

/**
 * Databázi je potřeba zavřít ručně: `close()` dopíše WAL žurnál zpátky do hlavního
 * souboru. Bez toho zůstane po vypnutí ležet `-wal` a záloha pořízená prostým
 * zkopírováním souboru by neobsahovala poslední zápisy.
 */
function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal} – ukončuji…`);

  // Pojistka pro případ, že nějaké spojení odmítá skončit – data jsou uzavřená tak
  // jako tak, jen se nečeká donekonečna.
  const failsafe = setTimeout(() => {
    console.warn('[shutdown] Spojení se nedočkala konce, ukončuji natvrdo.');
    db.close();
    process.exit(0);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  server.close(() => {
    clearTimeout(failsafe);
    db.close();
    process.exit(0);
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => shutdown(signal));
}
