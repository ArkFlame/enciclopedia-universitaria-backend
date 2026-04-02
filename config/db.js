const mysql = require('mysql2/promise');
const {
  dbHost,
  dbPort,
  dbUser,
  dbPassword,
  drizzleDbName,
} = require('../src/db/runtimeConfig');

const pool = mysql.createPool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: drizzleDbName,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00',
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

module.exports = pool;
