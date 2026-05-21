// =============================================================
// Print PostgreSQL schema status (tables, slots, applications)
// Usage: DATABASE_URL=... npm run db:status
// =============================================================

import pg from "pg";
import { pgClientOptions } from "../pg-config.js";

if (!process.env.DATABASE_URL) {
  console.error("db:status: set DATABASE_URL first.");
  process.exit(1);
}

const client = new pg.Client(pgClientOptions());

try {
  await client.connect();
  console.log("db:status: connected\n");

  const tables = ["support_slots", "applications", "consents", "payments"];
  for (const name of tables) {
    const { rows } = await client.query(
      `SELECT to_regclass($1) AS reg`,
      [`public.${name}`]
    );
    console.log(`  ${name}: ${rows[0].reg ? "ok" : "MISSING"}`);
  }

  const { rows: slotRows } = await client.query(
    "SELECT COUNT(*)::int AS n FROM support_slots"
  );
  const { rows: appRows } = await client.query(
    "SELECT COUNT(*)::int AS n FROM applications"
  );
  const { rows: consentRows } = await client.query(
    "SELECT COUNT(*)::int AS n FROM consents"
  );

  console.log(`\n  support_slots: ${slotRows[0].n} rows`);
  console.log(`  applications:  ${appRows[0].n} rows`);
  console.log(`  consents:      ${consentRows[0].n} rows`);

  const { rows: recent } = await client.query(
    `SELECT a.id, a.slot_title, a.email, a.amount, a.status, a.created_at
     FROM applications a
     ORDER BY a.created_at DESC
     LIMIT 5`
  );

  if (recent.length) {
    console.log("\n  Last applications:");
    for (const row of recent) {
      console.log(
        `    ${row.id} | ${row.slot_title} | ${row.amount} ₽ | ${row.status} | ${row.email}`
      );
    }
  }

  console.log("\ndb:status: done");
} catch (err) {
  console.error("db:status: failed —", err.message);
  process.exit(1);
} finally {
  await client.end();
}
