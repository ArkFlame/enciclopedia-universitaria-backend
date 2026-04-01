const mysql = require('mysql2/promise');
require('dotenv').config();

const getDrizzlePool = () => mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DRIZZLE_DB_NAME || 'enciclopediadb_drizzle',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00',
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

async function isBootstrapRequired() {
  const pool = getDrizzlePool();
  try {
    const [categoriesResult] = await pool.query('SELECT COUNT(*) as count FROM eu_categories');
    const [subcategoriesResult] = await pool.query('SELECT COUNT(*) as count FROM eu_subcategories');
    const [articlesResult] = await pool.query('SELECT COUNT(*) as count FROM eu_articles');

    const categoriesCount = Number(categoriesResult[0].count);
    const subcategoriesCount = Number(subcategoriesResult[0].count);
    const articlesCount = Number(articlesResult[0].count);

    console.log(`[Bootstrap] Table counts - categories: ${categoriesCount}, subcategories: ${subcategoriesCount}, articles: ${articlesCount}`);

    const allEmpty = categoriesCount === 0 && subcategoriesCount === 0 && articlesCount === 0;
    return allEmpty;
  } catch (error) {
    console.error('[Bootstrap] Error checking tables:', error.message);
    return false;
  } finally {
    await pool.end();
  }
}

module.exports = { isBootstrapRequired };