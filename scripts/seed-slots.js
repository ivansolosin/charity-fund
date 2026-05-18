// =============================================================
// Seed support_slots from the canonical slot list
// =============================================================

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("seed:slots: DATABASE_URL is not set.");
  process.exit(1);
}

/** Same slots as public/script.js FALLBACK_SLOTS */
const SLOTS = [
  { id: "s01", title: "Поддержка семьи", goal_amount: 190000, initial_funded_amount: 0 },
  { id: "s02", title: "Краска для стен", goal_amount: 42000, initial_funded_amount: 0 },
  { id: "s03", title: "Камазы земли для территории", goal_amount: 21000, initial_funded_amount: 0 },
  { id: "s04", title: "Деревья", goal_amount: 150000, initial_funded_amount: 0 },
  { id: "s05", title: "Книги в библиотеку", goal_amount: 30000, initial_funded_amount: 0 },
  { id: "s06", title: "Гардероб", goal_amount: 50000, initial_funded_amount: 0 },
  { id: "s07", title: "Баскетбольное кольцо", goal_amount: 7100, initial_funded_amount: 0 },
  { id: "s08", title: "Шуруповёрт", goal_amount: 4100, initial_funded_amount: 0 },
  { id: "s09", title: "Расстоечный шкаф для хлеба", goal_amount: 55000, initial_funded_amount: 0 },
  { id: "s10", title: "Барабанная установка", goal_amount: 21000, initial_funded_amount: 0 },
  { id: "s11", title: "Прожекторы для театра", goal_amount: 4700, initial_funded_amount: 0 },
  { id: "s12", title: "Театральный занавес", goal_amount: 20000, initial_funded_amount: 0 },
  { id: "s13", title: "Складные стулья для актового зала", goal_amount: 32000, initial_funded_amount: 0 },
  { id: "s14", title: "Посудомоечная машина", goal_amount: 45000, initial_funded_amount: 0 },
];

const UPSERT = `
  INSERT INTO support_slots (id, title, description, goal_amount, initial_funded_amount, is_active, updated_at)
  VALUES ($1, $2, $3, $4, $5, true, now())
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    goal_amount = EXCLUDED.goal_amount,
    initial_funded_amount = EXCLUDED.initial_funded_amount,
    is_active = true,
    updated_at = now()
`;

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

  for (const slot of SLOTS) {
    await client.query(UPSERT, [
      slot.id,
      slot.title,
      null,
      slot.goal_amount,
      slot.initial_funded_amount,
    ]);
  }

  console.log(`seed:slots: upserted ${SLOTS.length} slots`);
} catch (err) {
  console.error("seed:slots: failed —", err.message);
  process.exit(1);
} finally {
  await client.end();
}
