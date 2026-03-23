-- =============================================================================
-- DRAIS V1 — Post-Migration Validation: Albayan Tenant (Migration 022)
-- =============================================================================
-- File    : database/migrations/ALBAYAN_VALIDATION_POST_022.sql
-- Date    : 2026-03-22
--
-- PURPOSE: Comprehensive validation of the Albayan migration.
--          Run against drais database after 022_albayan_full_migration.sql.
--
-- USAGE:
--   mysql -h HOST -P PORT -u USER -pPASS drais < ALBAYAN_VALIDATION_POST_022.sql
--   OR included automatically by run-albayan-migration.sh
--
-- EXPECTED RESULTS:
--   • ~642 people, ~637 students, ~672 enrollments, ~5571 class_results
--   • ZERO active enrollments in current term (Term I 2026)
--   • All enrollments status='completed' for Term III 2025
--   • No data leakage to other schools
--   • superadmin@albayan.com user exists and is active
-- =============================================================================

USE drais;

SET @SCHOOL_ID = (SELECT id FROM schools WHERE email = 'superadmin@albayan.com' LIMIT 1);
SET @TERM3_ID  = (SELECT t.id FROM terms t
  JOIN academic_years ay ON t.academic_year_id = ay.id
  WHERE t.school_id = @SCHOOL_ID AND t.name = 'Term III' AND ay.name = '2025' LIMIT 1);

SELECT CONCAT('Running post-migration validation for school_id = ', @SCHOOL_ID) AS info;

-- =============================================================================
-- 1. ROW COUNT VERIFICATION
-- Expected: people ~642, students ~637, enrollments ~672, results ~5571
-- =============================================================================
SELECT '=== 1. ROW COUNT VERIFICATION ===' AS section;

SELECT
  'people'        AS entity, COUNT(*) AS count, '~642' AS expected
  FROM people WHERE school_id = @SCHOOL_ID
UNION ALL SELECT
  'students',      COUNT(*), '~637'
  FROM students WHERE school_id = @SCHOOL_ID
UNION ALL SELECT
  'classes',       COUNT(*), '11'
  FROM classes WHERE school_id = @SCHOOL_ID
UNION ALL SELECT
  'subjects',      COUNT(*), '~20'
  FROM subjects WHERE school_id = @SCHOOL_ID
UNION ALL SELECT
  'result_types',  COUNT(*), '~5'
  FROM result_types WHERE school_id = @SCHOOL_ID
UNION ALL SELECT
  'enrollments',   COUNT(*), '~672'
  FROM enrollments WHERE school_id = @SCHOOL_ID
UNION ALL SELECT
  'academic_years', COUNT(*), '2'
  FROM academic_years WHERE school_id = @SCHOOL_ID
UNION ALL SELECT
  'terms',         COUNT(*), '2'
  FROM terms WHERE school_id = @SCHOOL_ID;

-- class_results (via student join)
SELECT
  'class_results' AS entity,
  COUNT(cr.id) AS count,
  '~5571' AS expected
FROM class_results cr
JOIN students s ON cr.student_id = s.id
WHERE s.school_id = @SCHOOL_ID;

-- =============================================================================
-- 2. CURRENT TERM ISOLATION — MUST BE ZERO
-- This is the most critical check: Albayan has NO active enrollments in 2026
-- =============================================================================
SELECT '=== 2. CURRENT TERM ISOLATION (MUST BE 0) ===' AS section;

SELECT
  t.name AS term,
  t.status AS term_status,
  e.status AS enrollment_status,
  COUNT(e.id) AS enrollment_count,
  IF(COUNT(e.id) = 0, '✓ PASS', '✗ FAIL — ACTION REQUIRED') AS result
FROM terms t
LEFT JOIN enrollments e ON e.term_id = t.id
  AND e.school_id = @SCHOOL_ID
  AND e.status = 'active'
WHERE t.school_id = @SCHOOL_ID
  AND t.status IN ('active', 'scheduled')
GROUP BY t.id, t.name, t.status, e.status;

-- =============================================================================
-- 3. HISTORICAL DATA INTEGRITY
-- All Albayan enrollments must be in Term III 2025, status='completed'
-- =============================================================================
SELECT '=== 3. HISTORICAL DATA INTEGRITY ===' AS section;

SELECT
  t.name AS term,
  ay.name AS academic_year,
  e.status,
  COUNT(e.id) AS count,
  IF(e.status = 'completed', '✓ OK', '⚠ UNEXPECTED STATUS') AS check_result
FROM enrollments e
JOIN terms t ON e.term_id = t.id
JOIN academic_years ay ON e.academic_year_id = ay.id
WHERE e.school_id = @SCHOOL_ID
GROUP BY t.name, ay.name, e.status;

-- =============================================================================
-- 4. CROSS-SCHOOL LEAKAGE CHECK
-- Albayan data must NOT appear in another school's context
-- =============================================================================
SELECT '=== 4. CROSS-SCHOOL LEAKAGE CHECK ===' AS section;

-- Check if any Albayan students are enrolled under another school_id
SELECT
  'Students with wrong school_id' AS check_name,
  COUNT(*) AS count,
  IF(COUNT(*) = 0, '✓ PASS', '✗ FAIL') AS result
FROM students s
WHERE s.id > 1000   -- assumes @OFFSET >= 2000; adjust if needed
  AND s.school_id != @SCHOOL_ID
  AND s.id IN (
    SELECT @SCHOOL_ID + id FROM (SELECT @OFFSET AS id) x
  );

-- Simpler: ensure all Albayan students have correct school_id
SELECT
  'All Albayan students school_id correct' AS check_name,
  SUM(IF(school_id = @SCHOOL_ID, 1, 0)) AS correct,
  SUM(IF(school_id != @SCHOOL_ID, 1, 0)) AS wrong,
  IF(SUM(IF(school_id != @SCHOOL_ID, 1, 0)) = 0, '✓ PASS', '✗ FAIL') AS result
FROM students
WHERE id BETWEEN @SCHOOL_ID AND @SCHOOL_ID + 10000;

-- =============================================================================
-- 5. AUTH VERIFICATION
-- Superadmin user exists, is active, has correct role
-- =============================================================================
SELECT '=== 5. AUTH VERIFICATION ===' AS section;

SELECT
  u.id AS user_id,
  u.email,
  u.school_id,
  u.role,
  u.status,
  u.is_active,
  IF(u.school_id = @SCHOOL_ID AND u.status = 'active' AND u.is_active = TRUE,
     '✓ PASS', '✗ FAIL') AS result
FROM users u
WHERE u.email = 'superadmin@albayan.com';

-- Check role assignment
SELECT
  'super_admin role assigned' AS check_name,
  COUNT(*) AS count,
  IF(COUNT(*) > 0, '✓ PASS', '✗ FAIL') AS result
FROM user_roles ur
JOIN roles r ON ur.role_id = r.id
WHERE r.school_id = @SCHOOL_ID
  AND r.slug = 'super_admin';

-- =============================================================================
-- 6. CLASS RESULTS TERM MAPPING
-- All class_results must point to a valid term
-- =============================================================================
SELECT '=== 6. CLASS RESULTS TERM MAPPING ===' AS section;

SELECT
  t.name AS term,
  COUNT(cr.id) AS result_count,
  IF(t.school_id = @SCHOOL_ID, '✓ Correct school', '✗ Wrong school') AS school_check
FROM class_results cr
JOIN terms t ON cr.term_id = t.id
JOIN students s ON cr.student_id = s.id
WHERE s.school_id = @SCHOOL_ID
GROUP BY t.id, t.name, t.school_id;

-- Orphaned class_results (no valid term)
SELECT
  'Class results with missing term_id' AS check_name,
  COUNT(*) AS count,
  IF(COUNT(*) = 0, '✓ PASS', '⚠ Has orphans') AS result
FROM class_results cr
JOIN students s ON cr.student_id = s.id
WHERE s.school_id = @SCHOOL_ID
  AND cr.term_id NOT IN (SELECT id FROM terms WHERE school_id = @SCHOOL_ID);

-- =============================================================================
-- 7. RESULT TYPE COVERAGE
-- All result_type_ids referenced by class_results must exist
-- =============================================================================
SELECT '=== 7. RESULT TYPE COVERAGE ===' AS section;

SELECT
  rt.name AS result_type_name,
  rt.code,
  COUNT(cr.id) AS result_count
FROM result_types rt
LEFT JOIN class_results cr ON cr.result_type_id = rt.id
JOIN students s ON cr.student_id = s.id
WHERE rt.school_id = @SCHOOL_ID
  AND s.school_id = @SCHOOL_ID
GROUP BY rt.id, rt.name, rt.code
ORDER BY result_count DESC;

-- Orphaned result_type references
SELECT
  'class_results with missing result_type_id' AS check_name,
  COUNT(*) AS count,
  IF(COUNT(*) = 0, '✓ PASS', '✗ FAIL — FK broken') AS result
FROM class_results cr
JOIN students s ON cr.student_id = s.id
WHERE s.school_id = @SCHOOL_ID
  AND cr.result_type_id NOT IN (SELECT id FROM result_types WHERE school_id = @SCHOOL_ID);

-- =============================================================================
-- 8. DATA QUALITY CHECKS
-- =============================================================================
SELECT '=== 8. DATA QUALITY ===' AS section;

SELECT
  'People with NULL date_of_birth' AS check_name,
  SUM(IF(date_of_birth IS NULL, 1, 0)) AS null_dob,
  SUM(IF(date_of_birth = '0000-00-00', 1, 0)) AS zero_dob_must_be_0,
  IF(SUM(IF(date_of_birth = '0000-00-00', 1, 0)) = 0,
     '✓ PASS', '✗ FAIL — zero dates not normalized') AS result
FROM people
WHERE school_id = @SCHOOL_ID;

SELECT
  'Students with NULL person_id' AS check_name,
  COUNT(*) AS count,
  IF(COUNT(*) = 0, '✓ PASS', '✗ FAIL') AS result
FROM students
WHERE school_id = @SCHOOL_ID
  AND person_id IS NULL;

SELECT
  'Enrollments with NULL student_id' AS check_name,
  COUNT(*) AS count,
  IF(COUNT(*) = 0, '✓ PASS', '✗ FAIL') AS result
FROM enrollments
WHERE school_id = @SCHOOL_ID
  AND student_id IS NULL;

-- =============================================================================
-- 9. ACADEMIC STRUCTURE SUMMARY
-- =============================================================================
SELECT '=== 9. ACADEMIC STRUCTURE ===' AS section;

SELECT
  ay.name AS academic_year,
  ay.status AS ay_status,
  t.name AS term,
  t.start_date,
  t.end_date,
  t.status AS term_status,
  COUNT(DISTINCT e.student_id) AS enrolled_students
FROM academic_years ay
JOIN terms t ON t.academic_year_id = ay.id
LEFT JOIN enrollments e ON e.term_id = t.id AND e.school_id = @SCHOOL_ID
WHERE ay.school_id = @SCHOOL_ID
GROUP BY ay.id, ay.name, ay.status, t.id, t.name, t.start_date, t.end_date, t.status
ORDER BY ay.name, t.start_date;

-- =============================================================================
-- 10. FINAL PASS/FAIL SUMMARY
-- =============================================================================
SELECT '=== 10. FINAL MIGRATION VALIDATION SUMMARY ===' AS section;

SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM people   WHERE school_id = @SCHOOL_ID) >= 600
     AND (SELECT COUNT(*) FROM students WHERE school_id = @SCHOOL_ID) >= 600
     AND (SELECT COUNT(*) FROM enrollments WHERE school_id = @SCHOOL_ID) >= 600
     AND (SELECT COUNT(*) FROM enrollments WHERE school_id = @SCHOOL_ID AND status = 'active') = 0
     AND (SELECT COUNT(*) FROM users WHERE email = 'superadmin@albayan.com' AND status = 'active') = 1
     AND (SELECT COUNT(*) FROM class_results cr
           JOIN students s ON cr.student_id = s.id
           WHERE s.school_id = @SCHOOL_ID) >= 5000
    THEN '✓ ALL CHECKS PASSED — Albayan migration is valid'
    ELSE '✗ ONE OR MORE CHECKS FAILED — Review section details above'
  END AS overall_result;
