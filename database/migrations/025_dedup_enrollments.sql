-- ============================================================
-- MIGRATION 025 — Remove Duplicate Same-Class Enrollments
-- School: Al-Bayan (school_id=8002)
-- Date: 2025
-- ============================================================
-- CAUSE: Migration 022 double-inserted enrollments for batches of
--        PRIMARY FOUR, PRIMARY FIVE, and PRIMARY SEVEN students.
--        class_results is keyed on student_id+class_id+term_id,
--        so duplicate enrollment rows are purely redundant.
-- FIX:   For each (student_id, class_id, term_id, school_id) with
--        more than one row, keep the MIN(id) and delete the rest.
-- ============================================================

-- STEP 0: PRE-CHECK
SELECT 'PRE-CHECK' as phase;
SELECT COUNT(*) as total_term3_enrollments,
  COUNT(DISTINCT student_id) as distinct_students
FROM enrollments WHERE school_id=8002 AND term_id=30004;

SELECT 'Duplicate pairs before cleanup:' as label,
  COUNT(*) as duplicate_rows
FROM enrollments e1
JOIN enrollments e2
  ON e1.student_id=e2.student_id
  AND e1.class_id=e2.class_id
  AND e1.term_id=e2.term_id
  AND e1.school_id=e2.school_id
  AND e1.id > e2.id
WHERE e1.school_id=8002 AND e1.term_id=30004;

-- STEP 1: Delete duplicate rows — keep lowest enrollment ID per student+class+term
DELETE e1 FROM enrollments e1
JOIN enrollments e2
  ON e1.student_id = e2.student_id
  AND e1.class_id  = e2.class_id
  AND e1.term_id   = e2.term_id
  AND e1.school_id = e2.school_id
  AND e1.id > e2.id
WHERE e1.school_id = 8002
  AND e1.term_id   = 30004;

SELECT ROW_COUNT() as duplicate_enrollments_deleted;

-- STEP 2: VALIDATION
SELECT 'POST-CLEANUP: enrollment counts' as phase;
SELECT COUNT(*) as total_term3_enrollments,
  COUNT(DISTINCT student_id) as distinct_students
FROM enrollments WHERE school_id=8002 AND term_id=30004;

-- No more duplicates
SELECT 'Remaining duplicates (must be 0):' as check_label;
SELECT student_id, class_id, COUNT(*) cnt
FROM enrollments
WHERE school_id=8002 AND term_id=30004
GROUP BY student_id, class_id
HAVING cnt > 1;

-- Final breakdown by class
SELECT c.name as class_name, COUNT(e.id) as enrollments
FROM enrollments e
JOIN classes c ON e.class_id=c.id
WHERE e.school_id=8002 AND e.term_id=30004
GROUP BY c.name
ORDER BY c.id;

SELECT 'Migration 025 COMPLETE' as status;
