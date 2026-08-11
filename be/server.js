const path = require('path');
const express = require('express');

const config = require('./src/config');
const { dbPath } = require('./src/db');
const { requireAdmin } = require('./src/http/admin-auth');
const { apiNotFound, errorHandler } = require('./src/http/error-handler');
const publicRoutes = require('./src/routes/public.routes');
const adminRoutes = require('./src/routes/admin.routes');
const { isConfigured: mailConfigured } = require('./src/mailer');

const JSON_BODY_LIMIT = '64kb';
const page = (name) => path.join(config.rootDir, name);

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.get('/health', (req, res) => {
  res.json({ ok: true, mail: mailConfigured(), db: path.basename(dbPath) });
});

app.get('/privacy', (req, res) => {
  res.sendFile(page('privacy.html'));
});

// Admin musí být před veřejným /api, aby si cesty nekolidovaly.
app.use('/api/admin', requireAdmin, adminRoutes);
for (const adminPath of ['/', '/admin']) {
  app.get(adminPath, requireAdmin, (req, res) => res.sendFile(page('index.html')));
}

app.use('/api', publicRoutes);
app.use('/api', apiNotFound);
app.use(errorHandler);

if (!config.admin.enabled) {
  console.warn('⚠️  ADMIN_USERNAME / ADMIN_PASSWORD nejsou nastavené – administrace je vypnutá.');
}

const server = app.listen(config.port, () => {
  console.log(`✅ tankuj100 API běží na http://localhost:${config.port}`);
  console.log(`   DB:            ${dbPath}`);
  console.log(`   Administrace:  ${config.admin.enabled ? 'zapnutá (basic auth)' : 'VYPNUTÁ'}`);
  console.log(`   Notifikace:    ${mailConfigured() ? 'EmailJS' : 'jen do logu'}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`\n${signal} – ukončuji…`);
    server.close(() => process.exit(0));
  });
}
