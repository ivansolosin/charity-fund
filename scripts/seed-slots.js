// =============================================================
// Seed support_slots from the canonical slot list
// =============================================================

import pg from "pg";
import { DEFAULT_SLOTS, SLOT_UPSERT_SQL } from "../data/default-slots.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("seed:slots: DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl:
    process.env.PGSSLMODE === "disable"
      ? false
      : process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
});

try {
  await client.connect();
  console.log("seed:slots: connected to PostgreSQL");

  for (const slot of DEFAULT_SLOTS) {
    await client.query(SLOT_UPSERT_SQL, [
      slot.id,
      slot.title,
      null,
      slot.goal_amount,
      slot.initial_funded_amount,
    ]);
  }

  console.log(`seed:slots: upserted ${DEFAULT_SLOTS.length} slots`);
} catch (err) {
  console.error("seed:slots: failed —", err.message);
  process.exit(1);
} finally {
  await client.end();
}
