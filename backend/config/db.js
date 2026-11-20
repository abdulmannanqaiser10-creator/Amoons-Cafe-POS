const { Pool } = require("pg");

if (process.env.VERCEL !== "1") {
  require("dotenv").config();
}

const isServerless = process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

/**
 * Neon / serverless Postgres can sleep between requests. Give the first
 * connect enough time to wake the DB, and keep the pool tiny on Vercel so
 * we do not exhaust connection slots across warm instances.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
  max: isServerless ? 1 : 10,
  idleTimeoutMillis: isServerless ? 5_000 : 30_000,
  connectionTimeoutMillis: 20_000,
  allowExitOnIdle: isServerless,
});

pool.on("error", (error) => {
  console.error("Unexpected idle database client error:", error.message);
});

module.exports = pool;
