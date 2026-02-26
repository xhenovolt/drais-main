-- Migration: Add missing columns for Finance Module
-- Execute this migration to fix the missing columns issue

-- =====================================================
-- Add status column to terms table if missing
-- =====================================================
ALTER TABLE terms 
ADD COLUMN IF NOT EXISTS status ENUM('draft', 'active', 'completed', 'archived') DEFAULT 'draft' AFTER end_date;

-- =====================================================
-- Add first_name and last_name columns to students table
-- These columns are needed for direct queries without joins
-- =====================================================
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) AFTER person_id,
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) AFTER first_name,
ADD COLUMN IF NOT EXISTS other_name VARCHAR(100) AFTER last_name;

-- =====================================================
-- Update students table with names from people table
-- This populates the new columns with existing data
-- =====================================================
UPDATE students s
LEFT JOIN people p ON s.person_id = p.id
SET 
    s.first_name = COALESCE(s.first_name, p.first_name),
    s.last_name = COALESCE(s.last_name, p.last_name),
    s.other_name = COALESCE(s.other_name, p.other_name)
WHERE s.first_name IS NULL OR s.last_name IS NULL;

-- =====================================================
-- Create index on students for faster name searches
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_students_name ON students(last_name, first_name);

-- =====================================================
-- Create index on enrollments for active enrollments
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_enrollments_active ON enrollments(student_id, status) WHERE status = 'active';

-- =====================================================
-- Update terms API to work with the status column
-- =====================================================
-- Note: The terms table now has status column with values:
-- 'draft' - Term is being prepared
-- 'active' - Current active term
-- 'completed' - Term has ended
-- 'archived' - Old term archived

-- =====================================================
-- Verification queries
-- =====================================================

-- Check if terms has status column
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'terms' AND column_name = 'status';

-- Check if students has name columns
-- SELECT first_name, last_name, other_name FROM students LIMIT 1;

-- =====================================================
-- Rollback (if needed)
-- =====================================================
-- ALTER TABLE terms DROP COLUMN IF EXISTS status;
-- ALTER TABLE students DROP COLUMN IF EXISTS first_name;
-- ALTER TABLE students DROP COLUMN IF EXISTS last_name;
-- ALTER TABLE students DROP COLUMN IF EXISTS other_name;
-- DROP INDEX IF EXISTS idx_students_name;
-- DROP INDEX IF EXISTS idx_enrollments_active;
