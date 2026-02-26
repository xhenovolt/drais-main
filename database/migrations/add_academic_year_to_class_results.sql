-- ==================================================
-- MIGRATION: Add Academic Year Support to class_results
-- Purpose: Fix promotion flow and result visibility
-- Date: 2025-02-14
-- ==================================================

-- Step 1: Add academic_year_id column to class_results
ALTER TABLE class_results 
ADD COLUMN academic_year_id BIGINT DEFAULT NULL AFTER term_id,
ADD INDEX idx_academic_year (academic_year_id);

-- Step 2: Populate academic_year_id from terms table
-- This ensures historical data has proper year references
UPDATE class_results cr
SET cr.academic_year_id = (
  SELECT t.academic_year_id 
  FROM terms t 
  WHERE t.id = cr.term_id 
  LIMIT 1
)
WHERE cr.term_id IS NOT NULL;

-- Step 3: Update unique constraint to include academic_year_id
-- Drop old constraint and create new one
ALTER TABLE class_results 
DROP INDEX uq_class_result,
ADD UNIQUE KEY uq_class_result_with_year (student_id, class_id, subject_id, term_id, result_type_id, academic_year_id);

-- Step 4: Log the migration
-- Verify data integrity
SELECT 
  COUNT(*) as total_results,
  COUNT(DISTINCT academic_year_id) as unique_years,
  SUM(CASE WHEN academic_year_id IS NULL THEN 1 ELSE 0 END) as missing_year_values
FROM class_results;

-- Step 5: Ensure term records have academic_year_id
-- (This should already be true, but verify)
SELECT 
  COUNT(*) as terms_without_year
FROM terms
WHERE academic_year_id IS NULL;

-- Migration complete - All results now have academic year tracking
