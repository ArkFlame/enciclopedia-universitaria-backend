require('dotenv').config();
const { drizzle } = require('drizzle-orm/mysql2');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const db = drizzle(process.env.DATABASE_URL);

module.exports = { db, default: db };
