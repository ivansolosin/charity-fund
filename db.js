// =============================================================
// SQLite — applications storage
// File location: $DATA_DIR/charity.db (default ./data/charity.db)
// On Railway: mount a Volume at /app/data and set DATA_DIR=/app/data
// =============================================================

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = process.env.DATA_DIR || path.resolve("./data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, "charity.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot TEXT NOT NULL,
    slot_title TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    email TEXT NOT NULL,
    amount INTEGER NOT NULL,
    frequency TEXT NOT NULL CHECK(frequency IN ('monthly', 'once')),
    status TEXT NOT NULL DEFAULT 'new'
      CHECK(status IN ('new', 'in_progress', 'done', 'rejected')),
    notes TEXT,
    ip TEXT,
    user_agent TEXT,
    forwarded_to_telegram INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_app_status     ON applications(status);
  CREATE INDEX IF NOT EXISTS idx_app_created_at ON applications(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_app_email      ON applications(email);
`);

// ---- Prepared statements ----

export const stmtInsert = db.prepare(`
  INSERT INTO applications
    (slot, slot_title, participant_name, email, amount, frequency, ip, user_agent, forwarded_to_telegram)
  VALUES
    (@slot, @slot_title, @participant_name, @email, @amount, @frequency, @ip, @user_agent, @forwarded_to_telegram)
`);

export const stmtList = db.prepare(`
  SELECT *
  FROM applications
  WHERE (@status IS NULL OR status = @status)
    AND (@search IS NULL OR (
      participant_name LIKE @search OR
      email LIKE @search OR
      slot_title LIKE @search
    ))
  ORDER BY created_at DESC
  LIMIT @limit OFFSET @offset
`);

export const stmtCount = db.prepare(`
  SELECT COUNT(*) AS cnt
  FROM applications
  WHERE (@status IS NULL OR status = @status)
    AND (@search IS NULL OR (
      participant_name LIKE @search OR
      email LIKE @search OR
      slot_title LIKE @search
    ))
`);

export const stmtUpdateStatus = db.prepare(`
  UPDATE applications
  SET status = @status,
      notes = COALESCE(@notes, notes),
      updated_at = datetime('now')
  WHERE id = @id
`);

export const stmtById = db.prepare(`
  SELECT * FROM applications WHERE id = ?
`);

export const stmtAllForExport = db.prepare(`
  SELECT * FROM applications ORDER BY created_at DESC
`);

export const stmtSummary = db.prepare(`
  SELECT
    COUNT(*)                                                       AS total,
    SUM(CASE WHEN status = 'new'         THEN 1 ELSE 0 END)        AS new_count,
    SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END)        AS in_progress_count,
    SUM(CASE WHEN status = 'done'        THEN 1 ELSE 0 END)        AS done_count,
    SUM(CASE WHEN status = 'rejected'    THEN 1 ELSE 0 END)        AS rejected_count,
    SUM(CASE WHEN frequency = 'monthly'  THEN 1 ELSE 0 END)        AS monthly_count,
    COALESCE(SUM(amount), 0)                                       AS total_amount,
    COALESCE(SUM(CASE WHEN status = 'done' THEN amount ELSE 0 END), 0)        AS done_amount,
    COALESCE(SUM(CASE WHEN frequency = 'monthly' THEN amount ELSE 0 END), 0)  AS monthly_amount
  FROM applications
`);

console.log(`[db] ready at ${dbPath}`);

export default db;
