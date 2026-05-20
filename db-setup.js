// =============================================================
// Auto-init schema + seed slots on server startup (idempotent)
// =============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SLOTS, SLOT_UPSERT_SQL } from "./data/default-slots.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureDbReady(query, isDbConfigured) {
  if (!isDbConfigured()) return;

  const { rows } = await query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'applications'
     ) AS ready`
  );

  if (!rows[0].ready) {
    const sql = fs.readFileSync(path.join(__dirname, "migrations", "001_init.sql"), "utf8");
    await query(sql);
    console.log("[db] schema created (migrations/001_init.sql)");
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
