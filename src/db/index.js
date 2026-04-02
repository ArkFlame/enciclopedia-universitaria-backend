const { drizzle } = require('drizzle-orm/mysql2');
const pool = require('../../config/db');

const db = drizzle({ client: pool });

module.exports = { db, default: db };
