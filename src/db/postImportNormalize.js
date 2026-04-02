const { drizzleDbName } = require('./runtimeConfig');
const {
  escapeIdentifier,
  tableExists,
  columnExists,
  indexExists,
  foreignKeyExists,
} = require('./metadata');

async function createTableIfMissing(pool, tableName, ddl) {
  if (await tableExists(pool, drizzleDbName, tableName)) {
    return false;
  }

  await pool.query(ddl);
  return true;
}

async function addColumnIfMissing(pool, tableName, columnName, ddl) {
  if (await columnExists(pool, drizzleDbName, tableName, columnName)) {
    return false;
  }

  await pool.query(
    `ALTER TABLE ${escapeIdentifier(tableName)} ADD COLUMN ${ddl}`
  );
  return true;
}

async function addIndexIfMissing(pool, tableName, indexName, ddl) {
  if (await indexExists(pool, drizzleDbName, tableName, indexName)) {
    return false;
  }

  await pool.query(
    `ALTER TABLE ${escapeIdentifier(tableName)} ADD ${ddl}`
  );
  return true;
}

async function addForeignKeyIfMissing(pool, tableName, foreignKeyName, ddl) {
  if (await foreignKeyExists(pool, drizzleDbName, tableName, foreignKeyName)) {
    return false;
  }

  await pool.query(
    `ALTER TABLE ${escapeIdentifier(tableName)} ADD ${ddl}`
  );
  return true;
}

async function normalizeSchema(pool) {
  const report = {
    createdTables: [],
    addedColumns: [],
    addedIndexes: [],
    addedForeignKeys: [],
  };

  if (await addColumnIfMissing(pool, 'eu_categories', 'description', '`description` TEXT NULL')) {
    report.addedColumns.push('eu_categories.description');
  }
  if (await addColumnIfMissing(pool, 'eu_categories', 'sort_order', '`sort_order` INT NOT NULL DEFAULT 0')) {
    report.addedColumns.push('eu_categories.sort_order');
  }
  if (await addColumnIfMissing(pool, 'eu_categories', 'is_active', '`is_active` TINYINT(1) NOT NULL DEFAULT 1')) {
    report.addedColumns.push('eu_categories.is_active');
  }
  if (
    await addColumnIfMissing(
      pool,
      'eu_categories',
      'updated_at',
      '`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    )
  ) {
    report.addedColumns.push('eu_categories.updated_at');
  }

  if (
    await createTableIfMissing(
      pool,
      'eu_subcategories',
      `
        CREATE TABLE ${escapeIdentifier('eu_subcategories')} (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          category_id INT UNSIGNED NOT NULL,
          name VARCHAR(100) NOT NULL,
          slug VARCHAR(100) NOT NULL,
          description TEXT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_eu_subcategories_category_slug (category_id, slug),
          CONSTRAINT fk_eu_subcategories_category FOREIGN KEY (category_id) REFERENCES eu_categories(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `
    )
  ) {
    report.createdTables.push('eu_subcategories');
  }

  if (await addColumnIfMissing(pool, 'eu_subcategories', 'description', '`description` TEXT NULL')) {
    report.addedColumns.push('eu_subcategories.description');
  }
  if (await addColumnIfMissing(pool, 'eu_subcategories', 'sort_order', '`sort_order` INT NOT NULL DEFAULT 0')) {
    report.addedColumns.push('eu_subcategories.sort_order');
  }
  if (await addColumnIfMissing(pool, 'eu_subcategories', 'is_active', '`is_active` TINYINT(1) NOT NULL DEFAULT 1')) {
    report.addedColumns.push('eu_subcategories.is_active');
  }
  if (
    await addColumnIfMissing(
      pool,
      'eu_subcategories',
      'created_at',
      '`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'
    )
  ) {
    report.addedColumns.push('eu_subcategories.created_at');
  }
  if (
    await addColumnIfMissing(
      pool,
      'eu_subcategories',
      'updated_at',
      '`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    )
  ) {
    report.addedColumns.push('eu_subcategories.updated_at');
  }
  if (
    await addIndexIfMissing(
      pool,
      'eu_subcategories',
      'uk_eu_subcategories_category_slug',
      'UNIQUE KEY uk_eu_subcategories_category_slug (category_id, slug)'
    )
  ) {
    report.addedIndexes.push('eu_subcategories.uk_eu_subcategories_category_slug');
  }
  if (
    await addForeignKeyIfMissing(
      pool,
      'eu_subcategories',
      'fk_eu_subcategories_category',
      'CONSTRAINT fk_eu_subcategories_category FOREIGN KEY (category_id) REFERENCES eu_categories(id) ON DELETE RESTRICT'
    )
  ) {
    report.addedForeignKeys.push('eu_subcategories.fk_eu_subcategories_category');
  }

  if (await addColumnIfMissing(pool, 'eu_articles', 'category_id', '`category_id` INT UNSIGNED NULL')) {
    report.addedColumns.push('eu_articles.category_id');
  }
  if (await addColumnIfMissing(pool, 'eu_articles', 'subcategory_id', '`subcategory_id` INT UNSIGNED NULL')) {
    report.addedColumns.push('eu_articles.subcategory_id');
  }
  if (await addColumnIfMissing(pool, 'eu_article_edits', 'category_id', '`category_id` INT UNSIGNED NULL')) {
    report.addedColumns.push('eu_article_edits.category_id');
  }
  if (await addColumnIfMissing(pool, 'eu_article_edits', 'subcategory_id', '`subcategory_id` INT UNSIGNED NULL')) {
    report.addedColumns.push('eu_article_edits.subcategory_id');
  }
  if (await addColumnIfMissing(pool, 'eu_source_downloads', 'user_agent', '`user_agent` TEXT NULL')) {
    report.addedColumns.push('eu_source_downloads.user_agent');
  }

  return report;
}

module.exports = {
  createTableIfMissing,
  addColumnIfMissing,
  addIndexIfMissing,
  addForeignKeyIfMissing,
  normalizeSchema,
};
