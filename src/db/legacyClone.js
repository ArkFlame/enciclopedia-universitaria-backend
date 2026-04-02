const {
  legacyDbName,
  drizzleDbName,
} = require('./runtimeConfig');
const {
  escapeIdentifier,
  listBaseTables,
} = require('./metadata');

const CLONE_EXCLUDED_TABLES = new Set([
  'eu_bootstrap_state',
  '__drizzle_migrations',
]);

async function listLegacyBaseTables(pool) {
  const tables = await listBaseTables(pool, legacyDbName);
  return tables.filter((tableName) => !CLONE_EXCLUDED_TABLES.has(tableName));
}

async function cloneTable(pool, tableName) {
  const escapedTable = escapeIdentifier(tableName);
  const sourceDatabase = escapeIdentifier(legacyDbName);
  const targetDatabase = escapeIdentifier(drizzleDbName);

  await pool.query(`DROP TABLE IF EXISTS ${targetDatabase}.${escapedTable}`);
  await pool.query(`CREATE TABLE ${targetDatabase}.${escapedTable} LIKE ${sourceDatabase}.${escapedTable}`);
  await pool.query(`INSERT INTO ${targetDatabase}.${escapedTable} SELECT * FROM ${sourceDatabase}.${escapedTable}`);
}

async function cloneLegacyDatabase(pool) {
  const tables = await listLegacyBaseTables(pool);
  const connection = await pool.getConnection();

  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const tableName of tables) {
      await cloneTable(connection, tableName);
    }
  } finally {
    try {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    } finally {
      connection.release();
    }
  }

  return {
    sourceDatabase: legacyDbName,
    targetDatabase: drizzleDbName,
    tablesCloned: tables.length,
    tables,
  };
}

module.exports = {
  listLegacyBaseTables,
  cloneLegacyDatabase,
  cloneTable,
};
