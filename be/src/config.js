const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

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

loadDotEnv(path.join(rootDir, '.env'));

const adminUsername = process.env.ADMIN_USERNAME || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';

const mail = {
  serviceId: process.env.EMAILJS_SERVICE_ID || '',
  templateId: process.env.EMAILJS_TEMPLATE_ID || '',
  publicKey: process.env.EMAILJS_PUBLIC_KEY || '',
  privateKey: process.env.EMAILJS_PRIVATE_KEY || '',
  origin: process.env.EMAILJS_ORIGIN || 'https://tankuj100.silkroadbrand.eu',
  notifyEmail: process.env.NOTIFY_EMAIL || '',
  adminUrl: process.env.ADMIN_URL || 'https://tankuj100.silkroadbrand.eu/',
  maxPerHour: Number(process.env.MAIL_MAX_PER_HOUR || 30),
};

module.exports = {
  rootDir,
  port: process.env.PORT || 3000,
  dbPath: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(rootDir, 'db', 'tankuj100db.sqlite'),
  admin: {
    username: adminUsername,
    password: adminPassword,
    enabled: Boolean(adminUsername && adminPassword),
  },
  mail,
  mailEnabled: Boolean(mail.serviceId && mail.templateId && mail.publicKey),
};
