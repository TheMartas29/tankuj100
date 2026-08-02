// PM2 konfigurace pro tankuj100 backend (Express + SQLite scraper API).
// Port a NODE_ENV se předávají procesu přes env níže; server.js čte process.env.PORT.
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'tankuj100',
      cwd: path.join(__dirname, 'be'),
      script: path.join(__dirname, 'be', 'server.js'),
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
