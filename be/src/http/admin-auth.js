const basicAuth = require('express-basic-auth');

const { admin } = require('../config');

const disabled = (req, res) =>
  res.status(503).json({
    error: 'admin_disabled',
    message: 'Administrace není nastavená (chybí ADMIN_USERNAME a ADMIN_PASSWORD v .env).',
  });

/** Bez nastavených údajů se admin VŮBEC nezveřejní – bezpečnější než ho nechat otevřený. */
const requireAdmin = admin.enabled
  ? basicAuth({
      users: { [admin.username]: admin.password },
      challenge: true,
      realm: 'tankuj100 admin',
    })
  : disabled;

module.exports = { requireAdmin };
