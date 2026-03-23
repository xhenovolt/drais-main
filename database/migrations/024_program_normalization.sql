-- ============================================================
-- MIGRATION 024 — Program Normalization & Enrollment Cleanup
-- School: Al-Bayan (school_id=8002)
-- Date: 2025
-- ============================================================
-- SCOPE:
--   1. Fix curriculum_id on all Albayan classes (secular=1, Tahfiz=2)
--   2. Remove duplicate secular enrollments (keep class with results)
--   3. Remove duplicate Tahfiz enrollments (keep oldest)
--   4. Assign curriculum programs via student_curriculums table
--      - Secular-only students → curriculum_id=1
--      - Tahfiz-only students  → curriculum_id=2
--      - Dual-program students → curriculum_id=1 AND curriculum_id=2
--   5. Validate final state
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- STEP 0: PRE-CHECK BASELINE
-- ─────────────────────────────────────────────────────────────
SELECT 'PRE-CHECK' as phase;

SELECT
  (SELECT COUNT(*) FROM enrollments WHERE school_id=8002 AND term_id=30004) as total_term3_enrollments,
  (SELECT COUNT(DISTINCT student_id) FROM enrollments WHERE school_id=8002 AND term_id=30004) as distinct_students,
  (SELECT COUNT(*) FROM student_curriculums sc JOIN students s ON sc.student_id=s.id WHERE s.school_id=8002) as existing_curriculum_assignments,
  (SELECT COUNT(*) FROM classes WHERE school_id=8002 AND curriculum_id IS NOT NULL) as classes_with_curriculum;

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Fix curriculum_id on Albayan classes
-- ─────────────────────────────────────────────────────────────
SELECT 'STEP 1: Fix curriculum_id on classes' as phase;

-- Secular classes (all non-Tahfiz) → curriculum_id=1
UPDATE classes
SET curriculum_id = 1
WHERE school_id = 8002
  AND id != 392013
  AND (curriculum_id IS NULL OR curriculum_id != 1);

-- Tahfiz class → curriculum_id=2
UPDATE classes
SET curriculum_id = 2
WHERE school_id = 8002
  AND id = 392013
  AND (curriculum_id IS NULL OR curriculum_id != 2);

-- Verify
SELECT id, name, curriculum_id FROM classes WHERE school_id=8002 ORDER BY id;

-- ─────────────────────────────────────────────────────────────
-- STEP 2: Remove duplicate SECULAR enrollments
--   Keep: PRIMARY SIX (class 392010) for 10 P6/P7 duplicates
--   Keep: PRIMARY FIVE (e392602) for IMRAN KIBUDE (student 392578)
--   Delete: PRIMARY SEVEN (392011) enrollments for those students
--   Delete: TOP CLASS (e392601) for IMRAN KIBUDE
-- ─────────────────────────────────────────────────────────────
SELECT 'STEP 2: Remove duplicate secular enrollments' as phase;

-- P6/P7 duplicates: delete the PRIMARY SEVEN enrollment
-- Enrollment IDs for PRIMARY SEVEN were: 392671,392672,392673,392674,392675,392676,392677,392678,392679,392680
DELETE FROM enrollments
WHERE id IN (392671,392672,392673,392674,392675,392676,392677,392678,392679,392680)
  AND school_id = 8002
  AND class_id = 392011;

-- IMRAN KIBUDE: delete TOP CLASS enrollment (student 392578, results are in PRIMARY FIVE)
DELETE FROM enrollments
WHERE id = 392601
  AND student_id = 392578
  AND school_id = 8002
  AND class_id = 392004;

SELECT ROW_COUNT() as deleted_secular_duplicate_top_class;

-- ─────────────────────────────────────────────────────────────
-- STEP 3: Remove duplicate TAHFIZ enrollments
--   SALIM MUZAALE (student 392029): keep 392135 (oldest), delete 392148+392664
--   TILIBUZA SHADAD (student 392585): keep 392615 (oldest), delete 392616
-- ─────────────────────────────────────────────────────────────
SELECT 'STEP 3: Remove duplicate Tahfiz enrollments' as phase;

DELETE FROM enrollments
WHERE id IN (392148, 392664)
  AND student_id = 392029
  AND school_id = 8002
  AND class_id = 392013;

DELETE FROM enrollments
WHERE id = 392616
  AND student_id = 392585
  AND school_id = 8002
  AND class_id = 392013;

-- Verify: no more duplicate enrollments per student per term
SELECT 'Remaining duplicates (should be 0):' as check_label;
SELECT student_id, COUNT(*) cnt
FROM enrollments
WHERE school_id=8002 AND term_id=30004 AND class_id=392013
GROUP BY student_id
HAVING cnt > 1;

-- ─────────────────────────────────────────────────────────────
-- STEP 4: Assign curriculum programs via student_curriculums
--   student_curriculums has no unique constraint — use WHERE NOT EXISTS guard
-- ─────────────────────────────────────────────────────────────
SELECT 'STEP 4: Assign curriculum programs' as phase;

-- 4a. Secular-only students → curriculum_id=1 (SECULAR)
INSERT INTO student_curriculums (student_id, curriculum_id, active, assigned_at)
SELECT DISTINCT e.student_id, 1, 1, NOW()
FROM enrollments e
WHERE e.school_id = 8002
  AND e.term_id = 30004
  AND e.class_id != 392013
  AND NOT EXISTS (
    SELECT 1 FROM student_curriculums sc
    WHERE sc.student_id = e.student_id AND sc.curriculum_id = 1
  );

SELECT ROW_COUNT() as secular_program_assignments_inserted;

-- 4b. All Tahfiz students → curriculum_id=2 (Islamic/Tahfiz)
--   This includes dual-program students (they get both 1 and 2)
INSERT INTO student_curriculums (student_id, curriculum_id, active, assigned_at)
SELECT DISTINCT e.student_id, 2, 1, NOW()
FROM enrollments e
WHERE e.school_id = 8002
  AND e.term_id = 30004
  AND e.class_id = 392013
  AND NOT EXISTS (
    SELECT 1 FROM student_curriculums sc
    WHERE sc.student_id = e.student_id AND sc.curriculum_id = 2
  );

SELECT ROW_COUNT() as tahfiz_program_assignments_inserted;

-- ─────────────────────────────────────────────────────────────
-- STEP 5: VALIDATION
-- ─────────────────────────────────────────────────────────────
SELECT 'STEP 5: VALIDATION' as phase;

-- 5a. Class curriculum assignments
SELECT id, name, curriculum_id,
  CASE curriculum_id WHEN 1 THEN 'SECULAR' WHEN 2 THEN 'Islamic/Tahfiz' ELSE 'UNASSIGNED' END as program
FROM classes
WHERE school_id=8002
ORDER BY id;

-- 5b. Total enrollments now
SELECT COUNT(*) as total_term3_enrollments,
  COUNT(DISTINCT student_id) as distinct_students
FROM enrollments
WHERE school_id=8002 AND term_id=30004;

-- 5c. student_curriculums summary
SELECT sc.curriculum_id, c.name as program_name, COUNT(*) as students_assigned
FROM student_curriculums sc
JOIN students s ON sc.student_id=s.id
JOIN curriculums c ON sc.curriculum_id=c.id
WHERE s.school_id=8002
GROUP BY sc.curriculum_id, c.name;

-- 5d. Dual-program students
SELECT 'Dual-program students (enrolled in both SECULAR and Tahfiz):' as info;
SELECT s.id-392000 as src_id, p.last_name, p.first_name
FROM student_curriculums sc1
JOIN student_curriculums sc2 ON sc1.student_id=sc2.student_id AND sc2.curriculum_id=2
JOIN students s ON sc1.student_id=s.id
JOIN people p ON s.person_id=p.id
WHERE sc1.curriculum_id=1 AND s.school_id=8002
ORDER BY p.last_name, p.first_name;

-- 5e. No more duplicate enrollments
SELECT 'Students with > 1 enrollment in Term III per class type:' as check_label;
SELECT student_id, class_id, COUNT(*) as cnt
FROM enrollments
WHERE school_id=8002 AND term_id=30004
GROUP BY student_id, class_id
HAVING cnt > 1;

-- 5f. Tahfiz enrollment count
SELECT 'Tahfiz enrollments Term III:' as label, COUNT(*) as cnt
FROM enrollments
WHERE school_id=8002 AND term_id=30004 AND class_id=392013;

SELECT 'Migration 024 COMPLETE' as status;
