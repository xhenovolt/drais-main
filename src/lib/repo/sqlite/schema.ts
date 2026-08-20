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
 *
 * NOT NULL discipline: match the SOURCE DDL's actual nullability, not an
 * idealized guess at it. Found the hard way, twice, against real
 * production data: `status`/`created_at`/`updated_at` were first declared
 * NOT NULL here on the assumption they'd surely always have a value — but
 * `database/consolidated_schema.sql`'s real DDL declares NONE of them
 * NOT NULL (only `schools.name` and `students.school_id`/`person_id`
 * actually are), and real, years-old production rows exploit exactly
 * that permissiveness. This schema mirrors a source school's data; it is
 * not this phase's job to retroactively impose stricter data-quality
 * guarantees than the source database itself enforces. The repo
 * CONTRACT (SchoolRecord/StudentRecord) still guarantees non-null
 * timestamps to every consumer — that guarantee lives in
 * src/lib/repo/mysql/util.ts's toIsoRequired() at the read boundary, not
 * as an over-strict constraint here that would simply reject a row the
 * real source happily contains.
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
  currency     TEXT DEFAULT 'UGX',
  address      TEXT,
  logo_url     TEXT,
  status       TEXT DEFAULT 'active' CHECK (status IS NULL OR status IN ('active','inactive','suspended')),
  created_at   TEXT DEFAULT (${ISO_NOW}),
  updated_at   TEXT DEFAULT (${ISO_NOW}),
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
  status         TEXT DEFAULT 'active',
  notes          TEXT,
  created_at     TEXT DEFAULT (${ISO_NOW}),
  updated_at     TEXT DEFAULT (${ISO_NOW}),
  deleted_at     TEXT,
  FOREIGN KEY (school_id) REFERENCES schools(id)
);
CREATE INDEX IF NOT EXISTS idx_students_school_status ON students(school_id, status);
CREATE INDEX IF NOT EXISTS idx_students_admission_no ON students(admission_no);

-- Deliberately NOT adding FOREIGN KEY (person_id) REFERENCES people(id)
-- to students above, even though the real DDL's students.person_id
-- does reference people.id — Phase 3/4's already-shipped, already-
-- passing tests seed students with synthetic personId values (9001,
-- 9002, ...) and no corresponding people row behind them. Adding the FK
-- now would break 40+ passing tests as a side effect of an unrelated
-- table addition. Real, worth fixing, deferred to its own reviewed pass
-- (update the Phase 3/4 test fixtures to seed people first, then add
-- the FK) rather than silently either skipped without a trace or
-- bundled into a change too broad to review cleanly.

-- Phase 7 (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §25): people
-- first (students have no name without it), then the core attendance
-- pair. Source DDL: database/consolidated_schema.sql (people) and the
-- MANAGED, ledger-tracked database/migrations/tidb/001_canonical_core_
-- tables.sql (attendance_raw_events, attendance_records) — the latter is
-- the more authoritative of the two migration mechanisms per docs/
-- database/MIGRATIONS.md, used here in preference to the archaeological
-- consolidated file wherever both exist.
--
-- attendance_raw_events.source's real ENUM is WIDER than 001's own
-- CREATE TABLE shows — src/lib/attendance/acquisition/schema.ts ALTERs
-- it to add tcp_pull/usb_import/csv_import at runtime, a live example of
-- exactly the "one migration file isn't the whole current state" gap
-- this document's §2.2 already flagged. The CHECK below matches the
-- ALTERed, current set, not the original file's narrower one.
--
-- enrollment_id / role_ref_id / rule_id are intentionally NOT foreign
-- keys here: they reference enrollments / students-or-staff (polymorphic)
-- / attendance_rules, none of which exist in this schema yet — a future
-- Phase 7 sub-effort, not invented early as an unenforceable reference.

CREATE TABLE IF NOT EXISTS people (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id      INTEGER,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  other_name     TEXT,
  gender         TEXT,
  date_of_birth  TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  photo_url      TEXT,
  created_at     TEXT DEFAULT (${ISO_NOW}),
  updated_at     TEXT DEFAULT (${ISO_NOW}),
  deleted_at     TEXT,
  FOREIGN KEY (school_id) REFERENCES schools(id)
);
CREATE INDEX IF NOT EXISTS idx_people_school_id ON people(school_id);
CREATE INDEX IF NOT EXISTS idx_people_name ON people(first_name, last_name);

CREATE TABLE IF NOT EXISTS attendance_raw_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id         INTEGER NOT NULL,
  device_sn         TEXT NOT NULL,
  device_user_id    INTEGER NOT NULL,
  display_name      TEXT,
  enrollment_id     INTEGER,
  person_id         INTEGER,
  role_type         TEXT CHECK (role_type IS NULL OR role_type IN ('student','staff','visitor')),
  role_ref_id       INTEGER,
  punch_at          TEXT NOT NULL,
  verify_type       INTEGER,
  io_mode           INTEGER,
  source            TEXT NOT NULL CHECK (source IN ('zkteco_push','dahua_pull','manual','relay','tcp_pull','usb_import','csv_import')),
  matched           INTEGER NOT NULL DEFAULT 0,
  resolution_path   TEXT,
  resolution_score  REAL,
  legacy_table      TEXT,
  legacy_id         INTEGER,
  ingested_at       TEXT DEFAULT (${ISO_NOW}),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (person_id) REFERENCES people(id),
  UNIQUE (school_id, device_sn, device_user_id, punch_at, source)
);
CREATE INDEX IF NOT EXISTS idx_raw_events_school_punch ON attendance_raw_events(school_id, punch_at);
CREATE INDEX IF NOT EXISTS idx_raw_events_device_pin ON attendance_raw_events(device_sn, device_user_id, punch_at);
CREATE INDEX IF NOT EXISTS idx_raw_events_person_day ON attendance_raw_events(person_id, punch_at);
CREATE INDEX IF NOT EXISTS idx_raw_events_unresolved ON attendance_raw_events(matched, school_id, ingested_at);

CREATE TABLE IF NOT EXISTS attendance_records (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id         INTEGER NOT NULL,
  person_id         INTEGER NOT NULL,
  role_type         TEXT NOT NULL CHECK (role_type IN ('student','staff')),
  attendance_date   TEXT NOT NULL,
  first_in_at       TEXT,
  last_out_at       TEXT,
  first_in_device   TEXT,
  last_out_device   TEXT,
  status            TEXT NOT NULL CHECK (status IN ('present','late','absent','half_day','early_leave','holiday','weekend')),
  late_minutes      INTEGER NOT NULL DEFAULT 0,
  early_minutes     INTEGER NOT NULL DEFAULT 0,
  total_minutes     INTEGER NOT NULL DEFAULT 0,
  rule_id           INTEGER,
  raw_event_count   INTEGER NOT NULL DEFAULT 0,
  evaluated_at      TEXT DEFAULT (${ISO_NOW}),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (person_id) REFERENCES people(id),
  UNIQUE (person_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_records_school_day ON attendance_records(school_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status ON attendance_records(school_id, attendance_date, status);

-- Phase 7, sub-effort 2: classes + class_results. Both real column sets
-- confirmed via a live information_schema query (not any of the several
-- conflicting historical per-school dump files this repo has for these
-- two tables) — see contract/types.ts's header on why. class_results has
-- NO school_id of its own; every query joins through classes for tenant
-- scoping, exactly like the real system
-- (src/lib/nexus/tools.ts:195-198).

CREATE TABLE IF NOT EXISTS classes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id         INTEGER,
  name              TEXT NOT NULL,
  curriculum_id     INTEGER,
  program_id        INTEGER,
  class_level       INTEGER,
  head_teacher_id   INTEGER,
  capacity          INTEGER,
  code              TEXT,
  level             INTEGER,
  name_ar           TEXT,
  created_at        TEXT DEFAULT (${ISO_NOW}),
  updated_at        TEXT DEFAULT (${ISO_NOW}),
  deleted_at        TEXT,
  deleted_by        INTEGER,
  delete_reason     TEXT,
  restored_at       TEXT,
  restored_by       INTEGER,
  FOREIGN KEY (school_id) REFERENCES schools(id)
);
CREATE INDEX IF NOT EXISTS idx_classes_school_id ON classes(school_id);

CREATE TABLE IF NOT EXISTS class_results (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id        INTEGER NOT NULL,
  class_id          INTEGER NOT NULL,
  subject_id        INTEGER NOT NULL,
  term_id           INTEGER,
  result_type_id    INTEGER NOT NULL,
  score             REAL,
  grade             TEXT,
  remarks           TEXT,
  academic_year_id  INTEGER,
  academic_type     TEXT NOT NULL DEFAULT 'secular' CHECK (academic_type IN ('secular','theology')),
  program_id        INTEGER,
  created_at        TEXT DEFAULT (${ISO_NOW}),
  updated_at        TEXT DEFAULT (${ISO_NOW}),
  deleted_at        TEXT,
  deleted_by        INTEGER,
  delete_reason     TEXT,
  restored_at       TEXT,
  restored_by       INTEGER,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (class_id) REFERENCES classes(id)
);
CREATE INDEX IF NOT EXISTS idx_class_results_class_subject ON class_results(class_id, subject_id, term_id);
CREATE INDEX IF NOT EXISTS idx_class_results_student ON class_results(student_id);
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
