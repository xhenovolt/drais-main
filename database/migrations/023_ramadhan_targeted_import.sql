-- =============================================================================
-- MIGRATION 023: Ramadhan Targeted Import — Albayan Tahfiz Program
-- =============================================================================
-- Purpose:
--   1. Activate Tahfiz students for Term I 2026 (continuing from Term III 2025)
--   2. Set theology_class_id on their new enrollments so the Tahfiz API (/api/tahfiz/students)
--      can correctly surface these students (it filters on theology_class_id IS NOT NULL)
--   3. Fix the gap from migration 022 which did not map theology_class_id at all
--
-- Source data: database/albayanRamadhanrefined.sql
-- All base data (students, people, classes, subjects, class_results) was
-- already imported via migration 022 from drais_albayan.  This migration only
-- performs the targeted enrolment step for the active term.
--
-- Key IDs (verified in production):
--   school_id      = 8002  (Albayan Quran Memorization Center)
--   TAHFIZ class   = 392013
--   Term III 2025  = 30004  (completed, academic_year 8001)
--   Term I 2026    = 30005  (active,    academic_year 8002)
--   OFFSET         = 392000 (source ID + OFFSET = drais ID)
-- =============================================================================

SET @SCHOOL_ID    = 8002;
SET @TERM3_2025   = 30004;   -- Term III 2025 (historical completed term)
SET @TERM1_2026   = 30005;   -- Term I 2026   (currently active term)
SET @AY_2026      = 8002;    -- Academic Year 2026
SET @TAHFIZ_CLASS = 392013;  -- TAHFIZ class (source id 13 + OFFSET 392000)

-- =============================================================================
-- PHASE 1: Verify baseline counts before import
-- =============================================================================
SELECT 
  (SELECT COUNT(*) FROM enrollments
   WHERE school_id=@SCHOOL_ID AND class_id=@TAHFIZ_CLASS AND term_id=@TERM3_2025 AND status='completed')
   AS tahfiz_term3_completed,
  (SELECT COUNT(*) FROM enrollments
   WHERE school_id=@SCHOOL_ID AND class_id=@TAHFIZ_CLASS AND term_id=@TERM1_2026)
   AS tahfiz_term1_existing,
  (SELECT COUNT(*) FROM enrollments
   WHERE school_id=@SCHOOL_ID AND theology_class_id IS NOT NULL)
   AS enrollments_with_theology_class_id;

-- =============================================================================
-- PHASE 2: Create active Term I 2026 enrollments for Tahfiz students
-- Selects all students who completed Tahfiz in Term III 2025 and creates new
-- active Term I 2026 enrolments, with theology_class_id=Tahfiz class so the
-- /api/tahfiz/students endpoint can surface them correctly.
-- Uses NOT EXISTS to be fully idempotent (safe to re-run).
-- =============================================================================
INSERT INTO enrollments
  (student_id, school_id, class_id, theology_class_id,
   academic_year_id, term_id, status, enrollment_type, enrollment_date, created_at)
SELECT DISTINCT
  e.student_id,
  @SCHOOL_ID,
  @TAHFIZ_CLASS,
  @TAHFIZ_CLASS,      -- theology_class_id mirrors class_id so Tahfiz API can find them
  @AY_2026,
  @TERM1_2026,
  'active',
  'returning',        -- these are returning Tahfiz students
  '2026-02-10',       -- Term I 2026 start date
  NOW()
FROM enrollments e
WHERE e.school_id  = @SCHOOL_ID
  AND e.class_id   = @TAHFIZ_CLASS
  AND e.term_id    = @TERM3_2025
  AND e.status     = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM enrollments ex
    WHERE ex.student_id = e.student_id
      AND ex.school_id  = @SCHOOL_ID
      AND ex.class_id   = @TAHFIZ_CLASS
      AND ex.term_id    = @TERM1_2026
  );

SELECT CONCAT('INFO: Active Tahfiz enrollments created for Term I 2026: ', ROW_COUNT()) AS phase2_result;

-- =============================================================================
-- PHASE 3: Update theology_class_id on existing Term III 2025 Tahfiz enrollments
-- (Backfill the column that 022 migration left NULL for all enrollments)
-- =============================================================================
UPDATE enrollments
SET    theology_class_id = @TAHFIZ_CLASS,
       updated_at        = NOW()
WHERE  school_id         = @SCHOOL_ID
  AND  class_id          = @TAHFIZ_CLASS
  AND  theology_class_id IS NULL;

SELECT CONCAT('INFO: Backfilled theology_class_id on existing Tahfiz enrollments: ', ROW_COUNT()) AS phase3_result;

-- =============================================================================
-- PHASE 4: Validation — Confirm Tahfiz data is complete
-- =============================================================================
SELECT 'VALIDATION RESULTS' AS section;

-- Tahfiz enrollments per term
SELECT
  t.name AS term_name,
  COUNT(e.id)       AS tahfiz_enrollments,
  SUM(CASE WHEN e.status = 'active'    THEN 1 ELSE 0 END) AS active,
  SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS completed
FROM enrollments e
JOIN terms t ON e.term_id = t.id
WHERE e.school_id = @SCHOOL_ID
  AND e.class_id  = @TAHFIZ_CLASS
GROUP BY t.name;

-- theology_class_id count
SELECT
  COUNT(*) AS enrollments_with_theology_class_id
FROM enrollments
WHERE school_id         = @SCHOOL_ID
  AND theology_class_id = @TAHFIZ_CLASS;

-- Tahfiz subject results
SELECT sub.name AS subject, COUNT(cr.id) AS result_count
FROM class_results cr
JOIN subjects sub ON cr.subject_id = sub.id
WHERE sub.school_id   = @SCHOOL_ID
  AND sub.subject_type = 'tahfiz'
GROUP BY sub.name
ORDER BY sub.name;

-- Active Term I 2026 Tahfiz students (should be non-zero)
SELECT COUNT(DISTINCT e.student_id) AS active_tahfiz_students_term1
FROM enrollments e
WHERE e.school_id = @SCHOOL_ID
  AND e.class_id  = @TAHFIZ_CLASS
  AND e.term_id   = @TERM1_2026
  AND e.status    = 'active';

SELECT 'Migration 023 complete.' AS status;
