function escapeIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function databaseExists(pool, databaseName) {
  const [rows] = await pool.query(
    `SELECT SCHEMA_NAME
       FROM INFORMATION_SCHEMA.SCHEMATA
      WHERE SCHEMA_NAME = ?`,
    [databaseName]
  );

  return rows.length > 0;
}

async function tableExists(pool, databaseName, tableName) {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND TABLE_TYPE = 'BASE TABLE'`,
    [databaseName, tableName]
  );

  return rows.length > 0;
}

async function viewExists(pool, databaseName, viewName) {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.VIEWS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?`,
    [databaseName, viewName]
  );

  return rows.length > 0;
}

async function columnExists(pool, databaseName, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [databaseName, tableName, columnName]
  );

  return rows.length > 0;
}

async function indexExists(pool, databaseName, tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [databaseName, tableName, indexName]
  );

  return rows.length > 0;
}

async function foreignKeyExists(pool, databaseName, tableName, foreignKeyName) {
  const [rows] = await pool.query(
    `SELECT CONSTRAINT_NAME
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [databaseName, tableName, foreignKeyName]
  );

  return rows.length > 0;
}

async function listBaseTables(pool, databaseName) {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
    [databaseName]
  );

  return rows.map((row) => row.TABLE_NAME);
}

async function listViews(pool, databaseName) {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.VIEWS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME`,
    [databaseName]
  );

  return rows.map((row) => row.TABLE_NAME);
}

async function isDatabaseEffectivelyEmpty(pool, databaseName, { excludeTables = [] } = {}) {
  const tables = await listBaseTables(pool, databaseName);
  const excluded = new Set(excludeTables);
  return tables.filter((tableName) => !excluded.has(tableName)).length === 0;
}

module.exports = {
  escapeIdentifier,
  databaseExists,
  tableExists,
  viewExists,
  columnExists,
  indexExists,
  foreignKeyExists,
  listBaseTables,
  listViews,
  isDatabaseEffectivelyEmpty,
};
