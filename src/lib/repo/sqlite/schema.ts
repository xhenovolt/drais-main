/**
 * @drais/repo-sqlite — schema for the tables this phase covers.
 *
 * Translated from database/consolidated_schema.sql's `schools` and
 * `students` DDL (the closest available ground truth to the live TiDB
 * schema — see docs/database/MIGRATIONS.md on why that file is
 * "archaeological, not authoritative"; reconcile against a live
 * information_schema export before this table set grows beyond the two
 * covered here).
 *
 * Translation notes (SQLite has no ENUM, no ON UPDATE CURRENT_TIMESTAMP,
 * and a different auto-increment spelling — this is exactly the ~30%
 * "needs restructuring" category the original offline-migration audit
 * flagged, made concrete for two real tables):
 *   - BIGINT ... AUTO_INCREMENT  → INTEGER PRIMARY KEY AUTOINCREMENT
 *     (SQLite's INTEGER PK is a 64-bit rowid alias — same range as BIGINT)
 *   - ENUM('a','b')              → TEXT + CHECK (col IN ('a','b'))
 *   - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 *                                 → TEXT DEFAULT (an ISO-8601 UTC string)
 *   - ON UPDATE CURRENT_TIMESTAMP → NOT replicated as a trigger. The repo
 *     implementations set updated_at explicitly on every UPDATE instead —
 *     boring and debuggable beats a database-level trigger nobody can see
 *     from the application code (Phase 17 of the brief: no cleverness).
 *   - `admission_no ... UNIQUE` (global, not per-school, in the MySQL
 *     source) is kept as-is: odd for the online multi-tenant table, but
 *     exactly correct for a local install, which by design holds exactly
 *     one school (§9 of the architecture audit) — global and per-school
 *     uniqueness coincide here.
 */
import type { SqliteConnection } from './connection';

const ISO_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schools (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  legal_name   TEXT,
  short_code   TEXT,
  email        TEXT,
  phone        TEXT,
  currency     TEXT NOT NULL DEFAULT 'UGX',
  address      TEXT,
  logo_url     TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  created_at   TEXT NOT NULL DEFAULT (${ISO_NOW}),
  updated_at   TEXT NOT NULL DEFAULT (${ISO_NOW}),
  deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_schools_short_code ON schools(short_code);
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status);

CREATE TABLE IF NOT EXISTS students (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id      INTEGER NOT NULL,
  person_id      INTEGER NOT NULL,
  admission_no   TEXT UNIQUE,
  village_id     INTEGER,
  admission_date TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (${ISO_NOW}),
  updated_at     TEXT NOT NULL DEFAULT (${ISO_NOW}),
  deleted_at     TEXT,
  FOREIGN KEY (school_id) REFERENCES schools(id)
);
CREATE INDEX IF NOT EXISTS idx_students_school_status ON students(school_id, status);
CREATE INDEX IF NOT EXISTS idx_students_admission_no ON students(admission_no);
`;

let ensured = new WeakSet<SqliteConnection>();

/** Idempotent — safe to call on every connection open (mirrors the
 *  runtime ensureXSchema() pattern already used elsewhere in this repo,
 *  e.g. src/lib/sentinel/schema.ts, src/lib/backup/schema.ts). */
export function ensureSchema(db: SqliteConnection): void {
  if (ensured.has(db)) return;
  db.exec(SCHEMA_SQL);
  ensured.add(db);
}
