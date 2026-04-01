const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const LEGACY_DB_NAME = process.env.DB_NAME || 'enciclopediadb';
const DRIZZLE_DB_NAME = process.env.DRIZZLE_DB_NAME || 'enciclopediadb_drizzle';

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
    multipleStatements: true,
  });
}

function createDatabasePool(database) {
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

async function databaseExists(databaseName) {
  const pool = createServerPool();
  try {
    const [rows] = await pool.query(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [databaseName]
    );
    return rows.length > 0;
  } finally {
    await pool.end();
  }
}

async function ensureDatabaseExists(databaseName) {
  const pool = createServerPool();
  try {
    await pool.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await pool.end();
  }
}

function stripLegacyDatabaseStatements(sqlText) {
  return sqlText
    .replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?;/i, '')
    .replace(/USE\s+enciclopediadb\s*;/gi, '')
    .replace(/INSERT IGNORE INTO eu_categories[\s\S]*?\);\s*/i, '');
}

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

ALTER TABLE eu_notifications
  ADD COLUMN IF NOT EXISTS article_slug VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS notification_url VARCHAR(500) NULL;

CREATE TABLE IF NOT EXISTS eu_article_sources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  article_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  url TEXT NULL,
  pdf_original_name VARCHAR(255) NULL,
  pdf_storage_path VARCHAR(500) NULL,
  pdf_mime_type VARCHAR(100) NULL,
  pdf_size BIGINT UNSIGNED NULL,
  favicon_url VARCHAR(500) NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_eu_article_sources_article
    FOREIGN KEY (article_id) REFERENCES eu_articles(id) ON DELETE CASCADE,
  INDEX idx_eu_article_sources_article (article_id),
  INDEX idx_eu_article_sources_order (article_id, display_order, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eu_source_downloads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  downloaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  CONSTRAINT fk_eu_source_downloads_source
    FOREIGN KEY (source_id) REFERENCES eu_article_sources(id) ON DELETE CASCADE,
  CONSTRAINT fk_eu_source_downloads_user
    FOREIGN KEY (user_id) REFERENCES eu_users(id) ON DELETE SET NULL,
  INDEX idx_eu_source_downloads_source (source_id),
  INDEX idx_eu_source_downloads_user (user_id),
  INDEX idx_eu_source_downloads_downloaded_at (downloaded_at)
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

async function ensureDrizzleSchema() {
  const drizzlePool = createDatabasePool(DRIZZLE_DB_NAME);

  try {
    const [coreTableRows] = await drizzlePool.query(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [DRIZZLE_DB_NAME, 'eu_users']
    );

    if (coreTableRows.length === 0) {
      const baseSchemaPath = path.join(__dirname, '../../schema.sql');
      const rawBaseSchema = await fs.readFile(baseSchemaPath, 'utf8');
      const baseSchema = stripLegacyDatabaseStatements(rawBaseSchema);
      await drizzlePool.query(baseSchema);

      const migrationsDir = path.join(__dirname, '../../migrations');
      const migrationFiles = (await fs.readdir(migrationsDir))
        .filter((name) => name.endsWith('.sql'))
        .sort();

      for (const fileName of migrationFiles) {
        const filePath = path.join(migrationsDir, fileName);
        const rawMigration = await fs.readFile(filePath, 'utf8');
        const safeMigration = rawMigration.replace(/USE\s+enciclopediadb\s*;/gi, '');
        await drizzlePool.query(safeMigration);
      }
    }

    await drizzlePool.query(FINAL_SCHEMA_SQL);
  } finally {
    await drizzlePool.end();
  }
}

async function seedDefaultTaxonomy() {
  const drizzlePool = createDatabasePool(DRIZZLE_DB_NAME);

  try {
    for (const category of DEFAULT_CATEGORIES) {
      await drizzlePool.query(
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
      await drizzlePool.query(
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
  } finally {
    await drizzlePool.end();
  }
}

async function getCount(pool, tableName) {
  const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM \`${tableName}\``);
  return Number(rows[0].count || 0);
}

async function isDrizzleDataEmpty() {
  const drizzlePool = createDatabasePool(DRIZZLE_DB_NAME);

  try {
    const usersCount = await getCount(drizzlePool, 'eu_users');
    const articlesCount = await getCount(drizzlePool, 'eu_articles');
    const mediaCount = await getCount(drizzlePool, 'eu_media');
    const editsCount = await getCount(drizzlePool, 'eu_article_edits');

    return usersCount === 0 && articlesCount === 0 && mediaCount === 0 && editsCount === 0;
  } finally {
    await drizzlePool.end();
  }
}

async function getBootstrapState() {
  await ensureDatabaseExists(DRIZZLE_DB_NAME);
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
