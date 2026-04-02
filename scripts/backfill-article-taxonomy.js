'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createDrizzlePool } = require('../src/db/mysqlPools');
const { backfillTaxonomy } = require('../src/db/taxonomyBackfill');

async function main() {
  const pool = createDrizzlePool();

  try {
    const report = await backfillTaxonomy(pool);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
