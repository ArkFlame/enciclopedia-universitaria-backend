require('dotenv').config();
const mysql = require('mysql2/promise');

function createServerPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: '+00:00',
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });
}

async function ensureDatabaseExists() {
  const url = new URL(process.env.DATABASE_URL);
  const dbName = url.pathname.replace('/', '');
  const pool = createServerPool();
  try {
    const [rows] = await pool.query(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [dbName]
    );
    if (rows.length === 0) {
      await pool.query(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      console.log(`[BOOTSTRAP] Created database '${dbName}'`);
    }
  } finally {
    await pool.end();
  }
}

async function getBootstrapState() {
  await ensureDatabaseExists();
  return {
    drizzleDbName: new URL(process.env.DATABASE_URL).pathname.replace('/', ''),
  };
}

module.exports = {
  getBootstrapState,
};
