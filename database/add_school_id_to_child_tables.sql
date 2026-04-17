-- Migration: Add school_id to enrollments, student_attendance, and results
-- Backfills from the students table via student_id FK.
-- Safe to run multiple times (uses IF NOT EXISTS / column existence checks).

-- ─── enrollments ──────────────────────────────────────────────────────────────
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS school_id BIGINT DEFAULT NULL AFTER id;

UPDATE enrollments e
  JOIN students s ON s.id = e.student_id
  SET e.school_id = s.school_id
  WHERE e.school_id IS NULL;

ALTER TABLE enrollments
  MODIFY COLUMN school_id BIGINT NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_school_id ON enrollments (school_id);

-- ─── student_attendance ───────────────────────────────────────────────────────
ALTER TABLE student_attendance
  ADD COLUMN IF NOT EXISTS school_id BIGINT DEFAULT NULL AFTER id;

UPDATE student_attendance sa
  JOIN students s ON s.id = sa.student_id
  SET sa.school_id = s.school_id
  WHERE sa.school_id IS NULL;

ALTER TABLE student_attendance
  MODIFY COLUMN school_id BIGINT NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_attendance_school_id ON student_attendance (school_id);

-- ─── results ──────────────────────────────────────────────────────────────────
ALTER TABLE results
  ADD COLUMN IF NOT EXISTS school_id BIGINT DEFAULT NULL AFTER id;

UPDATE results r
  JOIN students s ON s.id = r.student_id
  SET r.school_id = s.school_id
  WHERE r.school_id IS NULL;

ALTER TABLE results
  MODIFY COLUMN school_id BIGINT NOT NULL;

CREATE INDEX IF NOT EXISTS idx_results_school_id ON results (school_id);
