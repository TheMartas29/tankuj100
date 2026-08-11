const statsRepo = require('../repositories/stats.repo');
const { isConfigured } = require('../mailer');

const adminOverview = () => ({ ...statsRepo.overview(), mail_configured: isConfigured() });

module.exports = { adminOverview };
