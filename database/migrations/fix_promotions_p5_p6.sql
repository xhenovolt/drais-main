-- ============================================================================
-- PROMOTIONS MODULE FIX: PRIMARY FIVE & SIX STUDENTS NOT DISPLAYING
-- ============================================================================
-- 
-- Root Cause: Three data integrity issues prevented P5/P6 students from displaying:
--   1. students.class_id = NULL (should be 9 for P5, 10 for P6)
--   2. students.school_id = NULL (should be 1)
--   3. enrollments.academic_year_id = NULL (system-wide issue, non-blocking)
--
-- Fix: Sync students.class_id and students.school_id from enrollments data
-- 
-- Affected: 101 students (60 in P5, 41 in P6)
-- Impact: Enables promotions display and actions for upper primary classes
-- ============================================================================

-- BEFORE FIX DIAGNOSTIC QUERIES

SELECT '========== BEFORE FIX DIAGNOSTIC ==========' as step;
SELECT COUNT(*) as 'P5 students with NULL class_id'
FROM students s
WHERE s.class_id IS NULL
AND s.id IN (SELECT student_id FROM enrollments WHERE class_id = 9)
AND s.status = 'active';

SELECT COUNT(*) as 'P6 students with NULL class_id'
FROM students s
WHERE s.class_id IS NULL
AND s.id IN (SELECT student_id FROM enrollments WHERE class_id = 10)
AND s.status = 'active';

SELECT COUNT(*) as 'P5 students with NULL school_id'
FROM students
WHERE class_id = 9 AND school_id IS NULL;

SELECT COUNT(*) as 'P6 students with NULL school_id'
FROM students
WHERE class_id = 10 AND school_id IS NULL;

-- ============================================================================
-- FIX 1: Synchronize students.class_id from enrollments
-- ============================================================================
UPDATE students s
SET s.class_id = (
  SELECT e.class_id
  FROM enrollments e
  WHERE e.student_id = s.id
  AND e.status = 'active'
  AND e.class_id IN (9, 10)
  ORDER BY e.id DESC
  LIMIT 1
)
WHERE s.class_id IS NULL
AND s.id IN (
  SELECT student_id 
  FROM enrollments 
  WHERE class_id IN (9, 10) AND status = 'active'
)
AND s.status = 'active';

SELECT 'Fix 1: students.class_id synced' as status;
SELECT ROW_COUNT() as rows_updated;

-- ============================================================================
-- FIX 2: Set school_id = 1 for P5/P6 students with NULL school_id
-- ============================================================================
UPDATE students
SET school_id = 1
WHERE class_id IN (9, 10)
AND school_id IS NULL;

SELECT 'Fix 2: students.school_id set to 1' as status;
SELECT ROW_COUNT() as rows_updated;

-- ============================================================================
-- POST-FIX VERIFICATION
-- ============================================================================

SELECT '========== AFTER FIX - VERIFICATION ==========' as step;

SELECT COUNT(*) as 'P5 students with class_id=9'
FROM students
WHERE class_id = 9 AND status = 'active' AND school_id = 1 AND deleted_at IS NULL;

SELECT COUNT(*) as 'P6 students with class_id=10'
FROM students
WHERE class_id = 10 AND status = 'active' AND school_id = 1 AND deleted_at IS NULL;

-- Test exact promotions query
SELECT 'Promotions API Query Test - P5:' as query_test;
SELECT COUNT(*) as 'P5 student count'
FROM students s
JOIN people p ON s.person_id = p.id
LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
LEFT JOIN classes c ON COALESCE(e.class_id, s.class_id) = c.id
LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
WHERE 
  s.school_id = 1 
  AND s.deleted_at IS NULL 
  AND s.status = 'active'
  AND COALESCE(e.class_id, s.class_id) = 9;

SELECT 'Promotions API Query Test - P6:' as query_test;
SELECT COUNT(*) as 'P6 student count'
FROM students s
JOIN people p ON s.person_id = p.id
LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
LEFT JOIN classes c ON COALESCE(e.class_id, s.class_id) = c.id
LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
WHERE 
  s.school_id = 1 
  AND s.deleted_at IS NULL 
  AND s.status = 'active'
  AND COALESCE(e.class_id, s.class_id) = 10;

SELECT '========== FIX COMPLETE ==========' as status;
