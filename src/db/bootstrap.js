const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const LEGACY_DB_NAME = process.env.DB_NAME || 'enciclopediadb';
const DRIZZLE_DB_NAME = process.env.DRIZZLE_DB_NAME || 'enciclopediadb_drizzle';
const CORE_TABLES = ['eu_users', 'eu_articles', 'eu_media', 'eu_article_edits'];

const BASE_SCHEMA_PATH = path.join(__dirname, '../../schema.sql');
const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

const BASE_POOL_CONFIG = {
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
  multipleStatements: true,
};

const DEFAULT_CATEGORIES = [
  { name: 'Ciencias Naturales', slug: 'ciencias-naturales', color: '#16a34a', description: null, sortOrder: 1 },
  { name: 'Historia', slug: 'historia', color: '#b45309', description: null, sortOrder: 2 },
  { name: 'Matemáticas', slug: 'matematicas', color: '#1d4ed8', description: null, sortOrder: 3 },
  { name: 'Tecnología', slug: 'tecnologia', color: '#7c3aed', description: null, sortOrder: 4 },
  { name: 'Física', slug: 'fisica', color: '#0891b2', description: null, sortOrder: 5 },
  { name: 'Química', slug: 'quimica', color: '#be123c', description: null, sortOrder: 6 },
  { name: 'Biología', slug: 'biologia', color: '#15803d', description: null, sortOrder: 7 },
  { name: 'Filosofía', slug: 'filosofia', color: '#6b21a8', description: null, sortOrder: 8 },
  { name: 'Arte y Cultura', slug: 'arte-cultura', color: '#c2410c', description: null, sortOrder: 9 },
  { name: 'Sociología', slug: 'sociologia', color: '#0369a1', description: null, sortOrder: 10 },
  { name: 'IRP', slug: 'irp', color: '#ea580c', description: 'Introducción a la Resolución de Problemas', sortOrder: 11 },
  { name: 'IEU', slug: 'ieu', color: '#0d9488', description: 'Introducción a los Estudios Universitarios', sortOrder: 12 },
  { name: 'ICYT', slug: 'icyt', color: '#7c2d12', description: 'Introducción a las Ciencias y Tecnologías', sortOrder: 13 },
];

const DEFAULT_SUBCATEGORIES = [
  { categorySlug: 'irp', name: 'Física', slug: 'fisica', sortOrder: 1 },
  { categorySlug: 'irp', name: 'Matemáticas', slug: 'matematicas', sortOrder: 2 },
  { categorySlug: 'irp', name: 'Programación', slug: 'programacion', sortOrder: 3 },

  { categorySlug: 'ieu', name: 'Lenguaje', slug: 'lenguaje', sortOrder: 1 },
  { categorySlug: 'ieu', name: 'Comunicación', slug: 'comunicacion', sortOrder: 2 },
  { categorySlug: 'ieu', name: 'Literatura', slug: 'literatura', sortOrder: 3 },
  { categorySlug: 'ieu', name: 'Prácticas de estudio universitario', slug: 'practicas-estudio-universitario', sortOrder: 4 },

  { categorySlug: 'icyt', name: 'Química', slug: 'quimica', sortOrder: 1 },
  { categorySlug: 'icyt', name: 'Biología', slug: 'biologia', sortOrder: 2 },
  { categorySlug: 'icyt', name: 'Bioquímica', slug: 'bioquimica', sortOrder: 3 },
  { categorySlug: 'icyt', name: 'Temas relacionados', slug: 'temas-relacionados', sortOrder: 4 },
];

const FINAL_SCHEMA_SQL = `
ALTER TABLE eu_users
  MODIFY COLUMN password_hash VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS email_verified TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_token VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS verification_expires_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS eu_subcategories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_eu_subcat_category FOREIGN KEY (category_id) REFERENCES eu_categories(id) ON DELETE CASCADE,
  UNIQUE KEY uk_eu_subcategories_category_slug (category_id, slug),
  INDEX idx_eu_subcategories_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE eu_categories
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE eu_articles
  ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS category_id INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS subcategory_id INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS cover_image_id BIGINT UNSIGNED NULL;

ALTER TABLE eu_article_edits
  ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS category_id INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS subcategory_id INT UNSIGNED NULL;
`;

function createServerPool() {
  return mysql.createPool(BASE_POOL_CONFIG);
}

function createDrizzlePool() {
  return mysql.createPool({
    ...BASE_POOL_CONFIG,
    database: DRIZZLE_DB_NAME,
    connectionLimit: 10,
  });
}

async function runWithPool(createPool, task) {
  const pool = createPool();
  try {
    return await task(pool);
  } finally {
    await pool.end();
  }
}

async function ensureDatabaseExists(databaseName) {
  await runWithPool(createServerPool, async (pool) => {
    await pool.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  });
}

async function ensureDrizzleDatabase() {
  await ensureDatabaseExists(DRIZZLE_DB_NAME);
}

async function databaseExists(databaseName) {
  return runWithPool(createServerPool, async (pool) => {
    const [rows] = await pool.query(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [databaseName]
    );
    return rows.length > 0;
  });
}

function stripLegacyDatabaseStatements(sqlText) {
  return sqlText
    .replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?;/i, '')
    .replace(/USE\s+`?enciclopediadb`?\s*;/gi, '')
    .replace(/INSERT IGNORE INTO eu_categories[\s\S]*?\);\s*/i, '');
}

function removeLegacyUseStatements(sqlText) {
  return sqlText.replace(/USE\s+`?enciclopediadb`?\s*;/gi, '');
}

async function applyBaseSchema(pool) {
  const rawBaseSchema = await fs.readFile(BASE_SCHEMA_PATH, 'utf8');
  const baseSchema = stripLegacyDatabaseStatements(rawBaseSchema);

  if (baseSchema.trim()) {
    await pool.query(baseSchema);
  }
}

async function applyMigrations(pool) {
  let fileNames;
  try {
    fileNames = await fs.readdir(MIGRATIONS_DIR);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const migrationFiles = fileNames.filter((name) => name.endsWith('.sql')).sort();

  for (const fileName of migrationFiles) {
    const filePath = path.join(MIGRATIONS_DIR, fileName);
    const rawMigration = await fs.readFile(filePath, 'utf8');
    const safeMigration = removeLegacyUseStatements(rawMigration);

    if (safeMigration.trim()) {
      await pool.query(safeMigration);
    }
  }
}

async function coreTablesExist(pool) {
  const placeholders = CORE_TABLES.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})`,
    [DRIZZLE_DB_NAME, ...CORE_TABLES]
  );

  const tableNames = new Set(rows.map((row) => row.TABLE_NAME));
  return CORE_TABLES.every((table) => tableNames.has(table));
}

async function ensureDrizzleSchema() {
  await runWithPool(createDrizzlePool, async (pool) => {
    const hasSchema = await coreTablesExist(pool);

    if (!hasSchema) {
      await applyBaseSchema(pool);
      await applyMigrations(pool);
    }

    await pool.query(FINAL_SCHEMA_SQL);
  });
}

async function getCount(pool, tableName) {
  try {
    const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM \`${tableName}\``);
    return Number(rows[0].count || 0);
  } catch (error) {
    if (error && error.code === 'ER_NO_SUCH_TABLE') {
      return 0;
    }
    throw error;
  }
}

async function isDrizzleDataEmpty() {
  return runWithPool(createDrizzlePool, async (pool) => {
    const counts = await Promise.all(CORE_TABLES.map((table) => getCount(pool, table)));
    return counts.every((count) => count === 0);
  });
}

async function seedDefaultTaxonomy() {
  await runWithPool(createDrizzlePool, async (pool) => {
    for (const category of DEFAULT_CATEGORIES) {
      await pool.query(
        `
          INSERT INTO eu_categories (name, slug, color, description, sort_order, is_active)
          VALUES (?, ?, ?, ?, ?, 1)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            color = VALUES(color),
            description = VALUES(description),
            sort_order = VALUES(sort_order),
            is_active = VALUES(is_active)
        `,
        [
          category.name,
          category.slug,
          category.color,
          category.description,
          category.sortOrder,
        ]
      );
    }

    for (const subcategory of DEFAULT_SUBCATEGORIES) {
      await pool.query(
        `
          INSERT INTO eu_subcategories (category_id, name, slug, sort_order, is_active)
          SELECT c.id, ?, ?, ?, 1
          FROM eu_categories c
          WHERE c.slug = ?
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            sort_order = VALUES(sort_order),
            is_active = VALUES(is_active)
        `,
        [
          subcategory.name,
          subcategory.slug,
          subcategory.sortOrder,
          subcategory.categorySlug,
        ]
      );
    }
  });
}

async function getBootstrapState() {
  await ensureDrizzleDatabase();
  await ensureDrizzleSchema();

  const legacyExists = await databaseExists(LEGACY_DB_NAME);
  const drizzleDataEmpty = await isDrizzleDataEmpty();

  if (!legacyExists && drizzleDataEmpty) {
    await seedDefaultTaxonomy();
  }

  return {
    legacyDbName: LEGACY_DB_NAME,
    drizzleDbName: DRIZZLE_DB_NAME,
    legacyExists,
    drizzleDataEmpty,
    bootstrapRequired: legacyExists && drizzleDataEmpty,
  };
}

module.exports = {
  getBootstrapState,
};
