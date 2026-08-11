const Database = require('better-sqlite3');

const { dbPath } = require('../config');
const { migrate } = require('./schema');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

migrate(db);

const nowISO = () => new Date().toISOString();

module.exports = { db, dbPath, nowISO };
