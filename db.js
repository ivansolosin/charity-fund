// =============================================================
// PostgreSQL connection pool
// =============================================================

import pg from "pg";

const { Pool } = pg;

let pool = null;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl:
        process.env.PGSSLMODE === "disable"
          ? false
          : process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : undefined,
    });

    pool.on("error", (err) => {
      console.error("[db] unexpected pool error:", err.message);
    });
  }
  return pool;
}

export function isDbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export async function query(text, params) {
  return getPool().query(text, params);
}

export async function checkDb() {
  if (!isDbConfigured()) return false;
  try {
    await query("SELECT 1");
    return true;
  } catch (err) {
    console.error("[db] health check failed:", err.message);
    return false;
  }
}

export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
