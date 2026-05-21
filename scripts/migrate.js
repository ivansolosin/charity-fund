// =============================================================
// Run SQL migrations against DATABASE_URL
// =============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pgClientOptions } from "../pg-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("migrate: DATABASE_URL is not set. Add it to .env or export it.");
  process.exit(1);
}

const migrationPath = path.join(__dirname, "..", "migrations", "001_init.sql");
const sql = fs.readFileSync(migrationPath, "utf8");
const statements = sql
  .split(";")
  .map((s) => s.replace(/--[^\n]*/g, "").trim())
  .filter(Boolean);

const client = new pg.Client(pgClientOptions());

try {
  await client.connect();
  console.log("migrate: connected to PostgreSQL");
  for (const statement of statements) {
    await client.query(statement);
  }
  console.log(`migrate: applied ${statements.length} statements from 001_init.sql`);
} catch (err) {
  console.error("migrate: failed —", err.message);
  process.exit(1);
} finally {
  await client.end();
}
