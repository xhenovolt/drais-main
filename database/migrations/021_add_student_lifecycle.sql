-- Migration: Add student lifecycle columns
-- Created: 2026-03-24
-- Purpose: Enable status tracking, soft deletes, and leave reasons

-- Add columns to students table
ALTER TABLE students 
ADD COLUMN status ENUM('active','left','graduated','suspended') DEFAULT 'active' AFTER school_id,
ADD COLUMN left_at DATETIME AFTER status,
ADD COLUMN left_reason TEXT AFTER left_at;

-- Create index for status filtering
CREATE INDEX idx_students_status ON students(school_id, status);

-- Create index for left_at (for reporting)
CREATE INDEX idx_students_left_at ON students(left_at);

-- Verify migration
SELECT 'Migration complete - Student lifecycle columns added' AS status;
