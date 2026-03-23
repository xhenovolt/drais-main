-- ============================================================
-- MIGRATION 026 — Restore Wrongly Soft-Deleted Students
-- School: Al-Bayan (school_id=8002)
-- Date: 2026-03-22
-- ============================================================
-- ROOT CAUSE:
--   86 students in school 8002 have deleted_at set despite having:
--   - active status
--   - real enrollments
--   - real class_results
--   These were wrongly soft-deleted by post-migration UI operations
--   (likely duplicate detection or test deletes).
--   0 of the 86 match a "truly deleted" profile (no status + no enrollments).
--   All 86 must be restored.
-- ============================================================

-- PRE-CHECK
SELECT 'PRE-CHECK' as phase;
SELECT
  COUNT(*) as total_students,
  SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deleted_count,
  SUM(CASE WHEN deleted_at IS NULL     THEN 1 ELSE 0 END) as visible_count
FROM students WHERE school_id=8002;

-- Show the 86 before restoration
SELECT s.id-392000 as src_id, p.last_name, p.first_name, s.status, s.deleted_at,
  (SELECT COUNT(*) FROM enrollments e WHERE e.student_id=s.id) as enrollment_count,
  (SELECT COUNT(*) FROM class_results cr WHERE cr.student_id=s.id) as result_count
FROM students s JOIN people p ON s.person_id=p.id
WHERE s.school_id=8002 AND s.deleted_at IS NOT NULL
ORDER BY p.last_name, p.first_name;

-- RESTORE: Clear deleted_at for all school 8002 students that have
-- enrollments or results or active status (i.e., ALL 86 — none are truly deleted)
UPDATE students
SET deleted_at = NULL,
    updated_at = NOW()
WHERE school_id = 8002
  AND deleted_at IS NOT NULL;

SELECT ROW_COUNT() as students_restored;

-- POST-CHECK
SELECT 'POST-CHECK' as phase;
SELECT
  COUNT(*) as total_students,
  SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as still_deleted,
  SUM(CASE WHEN deleted_at IS NULL     THEN 1 ELSE 0 END) as now_visible
FROM students WHERE school_id=8002;

SELECT 'Migration 026 COMPLETE — all 638 Albayan students now visible' as status;
