// =============================================================
// Auto-init schema + seed slots on server startup (idempotent)
// =============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SLOTS, SLOT_UPSERT_SQL } from "./data/default-slots.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function splitSqlStatements(sql) {
  return sql
    .split(";")
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
}

async function runMigrationFile(query) {
  const sql = fs.readFileSync(path.join(__dirname, "migrations", "001_init.sql"), "utf8");
  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    await query(statement);
  }
}

export async function ensureDbReady(query, isDbConfigured) {
  if (!isDbConfigured()) return;

  const { rows } = await query(
    `SELECT to_regclass('public.applications') AS applications,
            to_regclass('public.support_slots') AS support_slots`
  );

  const hasApplications = rows[0].applications !== null;
  const hasSlots = rows[0].support_slots !== null;

  if (!hasApplications || !hasSlots) {
    await runMigrationFile(query);
    console.log("[db] schema ensured (migrations/001_init.sql)");
  }

  const { rows: countRows } = await query("SELECT COUNT(*)::int AS n FROM support_slots");
  if (countRows[0].n === 0) {
    for (const slot of DEFAULT_SLOTS) {
      await query(SLOT_UPSERT_SQL, [
        slot.id,
        slot.title,
        null,
        slot.goal_amount,
        slot.initial_funded_amount,
      ]);
    }
    console.log(`[db] seeded ${DEFAULT_SLOTS.length} support slots`);
  }
}
