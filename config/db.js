const mysql = require('mysql2/promise');
require('dotenv').config();

const runtimeDatabase =
  process.env.DRIZZLE_DB_NAME ||
  process.env.DB_NAME ||
  'enciclopediadb_drizzle';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: runtimeDatabase,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00',
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: true,
});

pool.getConnection()
  .then((conn) => {
    console.log(`✅ Conexión a MySQL establecida (${runtimeDatabase})`);
    conn.release();
  })
  .catch((err) => {
    console.error('❌ Error conectando a MySQL:', err.message);
    process.exit(1);
  });

module.exports = pool;
