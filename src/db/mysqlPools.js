const mysql = require('mysql2/promise');
const {
  dbHost,
  dbPort,
  dbUser,
  dbPassword,
  legacyDbName,
  drizzleDbName,
} = require('./runtimeConfig');

function createPoolOptions(overrides = {}) {
  return {
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: '+00:00',
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ...overrides,
  };
}

function createServerPool(overrides = {}) {
  return mysql.createPool(createPoolOptions(overrides));
}

function createDatabasePool(database, overrides = {}) {
  return mysql.createPool(createPoolOptions({
    database,
    ...overrides,
  }));
}

function createLegacyPool(overrides = {}) {
  return createDatabasePool(legacyDbName, overrides);
}

function createDrizzlePool(overrides = {}) {
  return createDatabasePool(drizzleDbName, overrides);
}

module.exports = {
  createServerPool,
  createDatabasePool,
  createLegacyPool,
  createDrizzlePool,
};
