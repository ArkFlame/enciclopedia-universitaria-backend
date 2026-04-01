const { defineConfig } = require("drizzle-kit");
require("dotenv").config();

module.exports = defineConfig({
  schema: "./src/db/schema.js",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DRIZZLE_DB_NAME || "enciclopediadb_drizzle",
  },
});
