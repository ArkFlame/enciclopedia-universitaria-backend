const fs = require('fs/promises');
const path = require('path');
const {
  dbHost,
  legacyDbName,
  drizzleDbName,
} = require('./runtimeConfig');
const {
  createServerPool,
  createDrizzlePool,
} = require('./mysqlPools');
const {
  databaseExists,
  isDatabaseEffectivelyEmpty,
} = require('./metadata');
const {
  BOOTSTRAP_STATE_TABLE,
  ensureBootstrapStateTable,
  markPhaseRunning,
  markPhaseDone,
  markPhaseFailed,
  isPhaseDone,
  isBootstrapComplete,
  getBootstrapPhases,
} = require('./bootstrapState');
const { cloneLegacyDatabase } = require('./legacyClone');
const { normalizeSchema } = require('./postImportNormalize');
const { seedTaxonomy } = require('./taxonomySeed');
const { backfillTaxonomy } = require('./taxonomyBackfill');

const DRIZZLE_BASELINE_FILE = path.join(__dirname, '..', '..', 'drizzle', '0000_init.sql');
const EMPTY_TARGET_EXCLUDED_TABLES = [
  BOOTSTRAP_STATE_TABLE,
  '__drizzle_migrations',
];

async function ensureTargetDatabaseExists(serverPool) {
  const exists = await databaseExists(serverPool, drizzleDbName);
  if (exists) {
    return false;
  }

  await serverPool.query(
    `CREATE DATABASE IF NOT EXISTS \`${drizzleDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  return true;
}

async function initializeFreshTargetSchema(pool) {
  const sql = await fs.readFile(DRIZZLE_BASELINE_FILE, 'utf8');
  const connection = await pool.getConnection();

  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query(sql);
  } finally {
    try {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    } finally {
      connection.release();
    }
  }

  return {
    source: 'drizzle/0000_init.sql',
  };
}

async function runPhase(pool, phase, runner) {
  if (await isPhaseDone(pool, phase)) {
    return { skipped: true, phase };
  }

  await markPhaseRunning(pool, phase, {
    startedAt: new Date().toISOString(),
  });

  try {
    const details = await runner();
    await markPhaseDone(pool, phase, {
      finishedAt: new Date().toISOString(),
      ...(details || {}),
    });
    return details;
  } catch (error) {
    await markPhaseFailed(pool, phase, {
      failedAt: new Date().toISOString(),
      message: error.message,
      code: error.code || null,
    });
    throw error;
  }
}

async function reconcileTarget(pool, { allowClone, legacyExists, targetEmpty, existingTargetWithoutState }) {
  if (allowClone && legacyExists) {
    await runPhase(pool, 'legacy_clone', async () => {
      if (existingTargetWithoutState) {
        console.log('[BOOTSTRAP] Existing non-empty target detected without bootstrap state; skipping destructive legacy clone.');
        return {
          skipped: true,
          reason: 'existing_target_without_state',
          sourceDatabase: legacyDbName,
          targetDatabase: drizzleDbName,
        };
      }

      if (!targetEmpty) {
        console.log('[BOOTSTRAP] Resuming incomplete legacy clone by rebuilding target tables from the legacy database.');
      } else {
        console.log('[BOOTSTRAP] Cloning legacy database into target runtime database.');
      }

      return cloneLegacyDatabase(pool);
    });
  } else if (!(await isPhaseDone(pool, 'legacy_clone'))) {
    await markPhaseDone(pool, 'legacy_clone', {
      finishedAt: new Date().toISOString(),
      skipped: true,
      reason: legacyExists ? 'legacy_clone_not_allowed' : 'legacy_database_missing',
      sourceDatabase: legacyDbName,
      targetDatabase: drizzleDbName,
    });
  }

  await runPhase(pool, 'schema_normalize', async () => {
    if (!legacyExists && targetEmpty && !existingTargetWithoutState) {
      console.log('[BOOTSTRAP] Initializing empty target schema from committed Drizzle baseline.');
      await initializeFreshTargetSchema(pool);
    }

    return normalizeSchema(pool);
  });

  await runPhase(pool, 'taxonomy_seed', async () => {
    return seedTaxonomy(pool);
  });

  await runPhase(pool, 'taxonomy_backfill', async () => {
    return backfillTaxonomy(pool);
  });
}

async function getBootstrapState() {
  const serverPool = createServerPool();
  let targetPool = null;

  try {
    const created = await ensureTargetDatabaseExists(serverPool);
    if (created) {
      console.log(`[BOOTSTRAP] Created database "${drizzleDbName}"`);
    }

    const legacyExists = await databaseExists(serverPool, legacyDbName);
    targetPool = createDrizzlePool({ multipleStatements: true });

    await ensureBootstrapStateTable(targetPool);

    const complete = await isBootstrapComplete(targetPool);
    const targetEmpty = await isDatabaseEffectivelyEmpty(targetPool, drizzleDbName, {
      excludeTables: EMPTY_TARGET_EXCLUDED_TABLES,
    });

    if (!complete) {
      const phases = await getBootstrapPhases(targetPool);
      const existingTargetWithoutState = !targetEmpty && phases.length === 0;

      await reconcileTarget(targetPool, {
        allowClone: legacyExists,
        legacyExists,
        targetEmpty,
        existingTargetWithoutState,
      });
    }

    return {
      dbHost,
      legacyDbName,
      drizzleDbName,
      legacyExists,
      bootstrapComplete: await isBootstrapComplete(targetPool),
      phases: await getBootstrapPhases(targetPool),
    };
  } finally {
    if (targetPool) {
      await targetPool.end();
    }
    await serverPool.end();
  }
}

module.exports = {
  getBootstrapState,
};
