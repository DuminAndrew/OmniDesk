const Database = require('better-sqlite3');
const paths = require('../utils/paths');
const logger = require('../utils/logger');
const { applyMigrations } = require('./migrations');

let dbInstance = null;

function getDb() {
  if (dbInstance) return dbInstance;
  const file = paths.dbPath();
  logger.info('Opening SQLite database at', file);
  dbInstance = new Database(file);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  applyMigrations(dbInstance);
  return dbInstance;
}

function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = { getDb, closeDb };
