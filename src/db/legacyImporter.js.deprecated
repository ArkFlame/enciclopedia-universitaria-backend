const mysql = require('mysql2/promise');
require('dotenv').config();

const LEGACY_DB_NAME = process.env.DB_NAME || 'enciclopediadb';
const DRIZZLE_DB_NAME = process.env.DRIZZLE_DB_NAME || 'enciclopediadb_drizzle';

function createPool(database) {
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: '+00:00',
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    multipleStatements: true,
  });
}

function escapeId(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function normalizeValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

async function tableExists(pool, databaseName, tableName) {
  const [rows] = await pool.query(
    'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [databaseName, tableName]
  );
  return rows.length > 0;
}

async function getColumnNames(pool, databaseName, tableName) {
  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `,
    [databaseName, tableName]
  );

  return rows.map((row) => row.COLUMN_NAME);
}

async function getSharedColumns(legacyPool, drizzlePool, tableName) {
  const legacyColumns = await getColumnNames(legacyPool, LEGACY_DB_NAME, tableName);
  const drizzleColumns = await getColumnNames(drizzlePool, DRIZZLE_DB_NAME, tableName);
  const drizzleSet = new Set(drizzleColumns);

  return legacyColumns.filter((column) => drizzleSet.has(column));
}

async function copyTable(legacyPool, drizzlePool, tableName) {
  const legacyHasTable = await tableExists(legacyPool, LEGACY_DB_NAME, tableName);
  if (!legacyHasTable) {
    return { tableName, copied: 0, skipped: true, reason: 'missing_in_legacy' };
  }

  const drizzleHasTable = await tableExists(drizzlePool, DRIZZLE_DB_NAME, tableName);
  if (!drizzleHasTable) {
    throw new Error(`Target table ${tableName} does not exist in ${DRIZZLE_DB_NAME}`);
  }

  const columns = await getSharedColumns(legacyPool, drizzlePool, tableName);
  if (!columns.length) {
    return { tableName, copied: 0, skipped: true, reason: 'no_shared_columns' };
  }

  const [rows] = await legacyPool.query(
    `SELECT ${columns.map(escapeId).join(', ')} FROM ${escapeId(tableName)}`
  );

  if (!rows.length) {
    return { tableName, copied: 0, skipped: false };
  }

  const chunkSize = 250;
  let copied = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk
      .map(() => `(${columns.map(() => '?').join(', ')})`)
      .join(', ');

    const values = chunk.flatMap((row) =>
      columns.map((column) => normalizeValue(row[column]))
    );

    await drizzlePool.query(
      `
        INSERT IGNORE INTO ${escapeId(tableName)} (${columns.map(escapeId).join(', ')})
        VALUES ${placeholders}
      `,
      values
    );

    copied += chunk.length;
  }

  return { tableName, copied, skipped: false };
}

async function importLegacyData() {
  const legacyPool = createPool(LEGACY_DB_NAME);
  const drizzlePool = createPool(DRIZZLE_DB_NAME);

  const tablesInOrder = [
    'eu_users',
    'eu_categories',
    'eu_subcategories',
    'eu_articles',
    'eu_article_edits',
    'eu_media',
    'eu_article_sources',
    'eu_source_downloads',
    'eu_notifications',
    'eu_rate_limit_log',
    'eu_payment_history',
    'eu_admin_logs',
  ];

  try {
    console.log(`[LegacyImporter] Starting one-time import: ${LEGACY_DB_NAME} -> ${DRIZZLE_DB_NAME}`);

    await drizzlePool.query('SET FOREIGN_KEY_CHECKS = 0');

    await drizzlePool.query('DELETE FROM eu_subcategories');
    await drizzlePool.query('DELETE FROM eu_categories');

    const report = [];

    for (const tableName of tablesInOrder) {
      const result = await copyTable(legacyPool, drizzlePool, tableName);
      report.push(result);
      console.log(`[LegacyImporter] ${tableName}: copied=${result.copied}, skipped=${result.skipped ? 'yes' : 'no'}`);
    }

    await drizzlePool.query('SET FOREIGN_KEY_CHECKS = 1');

    return {
      sourceDatabase: LEGACY_DB_NAME,
      targetDatabase: DRIZZLE_DB_NAME,
      tables: report,
    };
  } catch (error) {
    try {
      await drizzlePool.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (_) {
      // ignore restore failure
    }
    console.error('[LegacyImporter] Error during import:', error.message);
    throw error;
  } finally {
    await legacyPool.end();
    await drizzlePool.end();
  }
}

module.exports = { importLegacyData };
