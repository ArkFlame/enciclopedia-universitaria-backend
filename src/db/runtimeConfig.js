require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value) {
  if (value === undefined || value === null || value === '') {
    return 3306;
  }

  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid DB_PORT value: ${value}`);
  }

  return port;
}

function buildMysqlUrl({ user, password, host, port, database }) {
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

const dbHost = required('DB_HOST', 'localhost');
const dbPort = parsePort(process.env.DB_PORT);
const dbUser = required('DB_USER', 'root');
const dbPassword = required('DB_PASSWORD', 'password');
const legacyDbName = required('DB_NAME', 'enciclopediadb');
const drizzleDbName = required('DRIZZLE_DB_NAME', 'enciclopediadb_drizzle');

const drizzleUrl =
  process.env.DATABASE_URL ||
  buildMysqlUrl({
    user: dbUser,
    password: dbPassword,
    host: dbHost,
    port: dbPort,
    database: drizzleDbName,
  });

const legacyUrl =
  process.env.LEGACY_DATABASE_URL ||
  buildMysqlUrl({
    user: dbUser,
    password: dbPassword,
    host: dbHost,
    port: dbPort,
    database: legacyDbName,
  });

module.exports = {
  dbHost,
  dbPort,
  dbUser,
  dbPassword,
  legacyDbName,
  drizzleDbName,
  drizzleUrl,
  legacyUrl,
  buildMysqlUrl,
};
