import 'dotenv/config';
import mysql from 'mysql2/promise';

const TABLES = [
  'eu_users',
  'eu_payment_history',
  'eu_articles',
  'eu_article_edits',
  'eu_media',
  'eu_rate_limit_log',
  'eu_notifications',
  'eu_admin_logs',
  'eu_categories',
  'eu_subcategories',
  'eu_article_sources',
  'eu_source_downloads',
];

const BASELINE_MIGRATION_HASH = '0000_init';
const MIGRATIONS_TABLE = '__drizzle_migrations';

async function getConnection() {
  const url = new URL(process.env.DATABASE_URL!);
  return mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.replace('/', ''),
  });
}

async function tableExists(pool: mysql.Connection, tableName: string): Promise<boolean> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return rows.length > 0;
}

async function columnExists(pool: mysql.Connection, tableName: string, columnName: string): Promise<boolean> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function indexExists(pool: mysql.Connection, tableName: string, indexName: string): Promise<boolean> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function foreignKeyExists(pool: mysql.Connection, tableName: string, fkName: string): Promise<boolean> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [tableName, fkName]
  );
  return rows.length > 0;
}

async function migrationTableExists(pool: mysql.Connection): Promise<boolean> {
  return tableExists(pool, MIGRATIONS_TABLE);
}

async function migrationApplied(pool: mysql.Connection, hash: string): Promise<boolean> {
  if (!(await migrationTableExists(pool))) {
    return false;
  }
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT id FROM \`${MIGRATIONS_TABLE}\` WHERE \`hash\` = ? LIMIT 1`,
    [hash]
  );
  return rows.length > 0;
}

async function createMigrationsTable(pool: mysql.Connection): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
      \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      \`hash\` VARCHAR(255) NOT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function recordMigration(pool: mysql.Connection, hash: string): Promise<void> {
  await pool.query(
    `INSERT INTO \`${MIGRATIONS_TABLE}\` (\`hash\`, \`created_at\`) VALUES (?, NOW())`,
    [hash]
  );
}

async function verifyBaselineSchema(pool: mysql.Connection): Promise<{ valid: boolean; missing: string[] }> {
  const missing: string[] = [];

  for (const table of TABLES) {
    if (!(await tableExists(pool, table))) {
      missing.push(`Table '${table}' does not exist`);
      continue;
    }
  }

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  if (!(await columnExists(pool, 'eu_users', 'google_id'))) {
    missing.push("Column 'eu_users.google_id' does not exist");
  }
  if (!(await columnExists(pool, 'eu_users', 'email_verified'))) {
    missing.push("Column 'eu_users.email_verified' does not exist");
  }
  if (!(await columnExists(pool, 'eu_articles', 'category_id'))) {
    missing.push("Column 'eu_articles.category_id' does not exist");
  }
  if (!(await columnExists(pool, 'eu_articles', 'cover_image_id'))) {
    missing.push("Column 'eu_articles.cover_image_id' does not exist");
  }
  if (!(await columnExists(pool, 'eu_subcategories', 'description'))) {
    missing.push("Column 'eu_subcategories.description' does not exist");
  }
  if (!(await columnExists(pool, 'eu_notifications', 'article_slug'))) {
    missing.push("Column 'eu_notifications.article_slug' does not exist");
  }

  if (!(await foreignKeyExists(pool, 'eu_articles', 'fk_eu_articles_cover_image'))) {
    missing.push("Foreign key 'eu_articles.fk_eu_articles_cover_image' does not exist");
  }
  if (!(await foreignKeyExists(pool, 'eu_subcategories', 'fk_eu_subcategories_category'))) {
    missing.push("Foreign key 'eu_subcategories.fk_eu_subcategories_category' does not exist");
  }

  return { valid: missing.length === 0, missing };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[adopt-baseline] FATAL: DATABASE_URL is not set');
    process.exit(1);
  }

  console.log('[adopt-baseline] Starting baseline adoption check...');

  let pool: mysql.Connection | null = null;
  try {
    pool = await getConnection();

    const alreadyApplied = await migrationApplied(pool, BASELINE_MIGRATION_HASH);
    if (alreadyApplied) {
      console.log('[adopt-baseline] Baseline migration already recorded. Nothing to do.');
      process.exit(0);
    }

    console.log('[adopt-baseline] Baseline migration not recorded. Verifying schema...');
    const { valid, missing } = await verifyBaselineSchema(pool);

    if (!valid) {
      console.error('[adopt-baseline] FATAL: Schema does not match baseline. Missing:');
      for (const m of missing) {
        console.error(`  - ${m}`);
      }
      console.error('[adopt-baseline] Please ensure the database schema matches the baseline before adopting.');
      process.exit(1);
    }

    console.log('[adopt-baseline] Schema verified. Recording baseline migration...');
    await createMigrationsTable(pool);
    await recordMigration(pool, BASELINE_MIGRATION_HASH);
    console.log('[adopt-baseline] Baseline adoption complete.');

  } catch (error) {
    console.error('[adopt-baseline] FATAL: Unexpected error:', error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

main();
