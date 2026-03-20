-- ============================================================
-- DRAIS Phase 10 Migration: Link attendance to enrollments
-- Run AFTER phase1_enrollment_rebuild.sql
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS guards)
-- ============================================================

INSERT INTO migration_log (action, status, details)
VALUES ('phase2_attendance_enrollment_link', 'started', 'Adding enrollment_id to attendance tables');

-- ---------------------------------------------------------------
-- 1. Add enrollment_id to student_attendance (nullable)
-- ---------------------------------------------------------------
ALTER TABLE student_attendance
  ADD COLUMN IF NOT EXISTS enrollment_id INT NULL AFTER student_id,
  ADD COLUMN IF NOT EXISTS term_id INT NULL AFTER enrollment_id;

-- Index for fast lookup by enrollment
ALTER TABLE student_attendance
  ADD INDEX IF NOT EXISTS idx_sa_enrollment_id (enrollment_id),
  ADD INDEX IF NOT EXISTS idx_sa_term_id (term_id),
  ADD INDEX IF NOT EXISTS idx_sa_school_term (school_id, term_id);

-- ---------------------------------------------------------------
-- 2. Backfill enrollment_id for existing records
--    Join student_attendance → enrollments on student_id + class_id,
--    picking the enrollment whose date range covers the attendance date.
-- ---------------------------------------------------------------
UPDATE student_attendance sa
JOIN enrollments e ON (
    e.student_id = sa.student_id
    AND e.class_id = sa.class_id
    AND (e.school_id = sa.school_id OR e.school_id IS NULL)
    AND e.status IN ('active', 'completed')
    AND (e.joined_at IS NULL OR e.joined_at <= sa.date)
    AND (e.end_date IS NULL OR e.end_date >= sa.date)
)
SET
    sa.enrollment_id = e.id,
    sa.term_id       = e.term_id
WHERE sa.enrollment_id IS NULL;

-- ---------------------------------------------------------------
-- 3. Add term_id to session-based attendance if table exists
--    (attendance_sessions used by bulk-mark flows)
-- ---------------------------------------------------------------
ALTER TABLE attendance_sessions
  ADD COLUMN IF NOT EXISTS term_id INT NULL AFTER class_id,
  ADD INDEX IF NOT EXISTS idx_as_term_id (term_id);

-- ---------------------------------------------------------------
-- 4. Backfill term_id on attendance_sessions from date
--    by matching it to the term whose date range covers session date
-- ---------------------------------------------------------------
UPDATE attendance_sessions s
JOIN terms t ON (
    t.school_id = s.school_id
    AND t.status = 'active'
    AND t.start_date <= s.date
    AND t.end_date   >= s.date
)
SET s.term_id = t.id
WHERE s.term_id IS NULL AND s.date IS NOT NULL;

-- Validation report
SELECT
  (SELECT COUNT(*) FROM student_attendance) AS total_attendance_records,
  (SELECT COUNT(*) FROM student_attendance WHERE enrollment_id IS NOT NULL) AS attendance_with_enrollment,
  (SELECT COUNT(*) FROM student_attendance WHERE enrollment_id IS NULL) AS attendance_missing_enrollment,
  ROUND(
    (SELECT COUNT(*) FROM student_attendance WHERE enrollment_id IS NOT NULL) * 100.0
    / NULLIF((SELECT COUNT(*) FROM student_attendance), 0), 1
  ) AS backfill_pct;

INSERT INTO migration_log (action, status, details)
VALUES ('phase2_attendance_enrollment_link', 'completed', 'enrollment_id backfill done');
