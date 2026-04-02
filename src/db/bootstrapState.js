const BOOTSTRAP_STATE_TABLE = 'eu_bootstrap_state';
const REQUIRED_PHASES = [
  'legacy_clone',
  'schema_normalize',
  'taxonomy_seed',
  'taxonomy_backfill',
];

function serializeDetails(details) {
  if (details === undefined) {
    return null;
  }

  return JSON.stringify(details);
}

function parseDetails(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (_) {
    return { raw: value };
  }
}

async function ensureBootstrapStateTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`${BOOTSTRAP_STATE_TABLE}\` (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      phase VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      details_json LONGTEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_eu_bootstrap_state_phase (phase)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function getBootstrapPhases(pool) {
  const [rows] = await pool.query(
    `SELECT phase, status, details_json, created_at, updated_at
       FROM \`${BOOTSTRAP_STATE_TABLE}\``
  );

  return rows.map((row) => ({
    phase: row.phase,
    status: row.status,
    details: parseDetails(row.details_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function getBootstrapPhase(pool, phase) {
  const [rows] = await pool.query(
    `SELECT phase, status, details_json, created_at, updated_at
       FROM \`${BOOTSTRAP_STATE_TABLE}\`
      WHERE phase = ?
      LIMIT 1`,
    [phase]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    phase: rows[0].phase,
    status: rows[0].status,
    details: parseDetails(rows[0].details_json),
    createdAt: rows[0].created_at,
    updatedAt: rows[0].updated_at,
  };
}

async function setBootstrapPhase(pool, phase, status, details) {
  await pool.query(
    `
      INSERT INTO \`${BOOTSTRAP_STATE_TABLE}\` (phase, status, details_json)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        details_json = VALUES(details_json),
        updated_at = CURRENT_TIMESTAMP
    `,
    [phase, status, serializeDetails(details)]
  );
}

async function markPhaseRunning(pool, phase, details = {}) {
  await setBootstrapPhase(pool, phase, 'running', details);
}

async function markPhaseDone(pool, phase, details = {}) {
  await setBootstrapPhase(pool, phase, 'done', details);
}

async function markPhaseFailed(pool, phase, details = {}) {
  await setBootstrapPhase(pool, phase, 'failed', details);
}

async function isPhaseDone(pool, phase) {
  const current = await getBootstrapPhase(pool, phase);
  return current?.status === 'done';
}

async function isBootstrapComplete(pool) {
  const phases = await getBootstrapPhases(pool);
  const done = new Set(
    phases
      .filter((phase) => phase.status === 'done')
      .map((phase) => phase.phase)
  );

  return REQUIRED_PHASES.every((phase) => done.has(phase));
}

module.exports = {
  BOOTSTRAP_STATE_TABLE,
  REQUIRED_PHASES,
  ensureBootstrapStateTable,
  getBootstrapPhases,
  getBootstrapPhase,
  markPhaseRunning,
  markPhaseDone,
  markPhaseFailed,
  isPhaseDone,
  isBootstrapComplete,
};
