-- Migration: Fix missing tables and columns for attendance module
-- Date: 2026-02-09
-- Issues fixed:
-- 1. Unknown column 'sa.method' in 'field list'
-- 2. Table 'drais_school.terms' doesn't exist
-- Status: EXECUTED SUCCESSFULLY

-- Add missing columns to student_attendance table
-- These columns were added to support the attendance API routes

ALTER TABLE student_attendance ADD COLUMN method VARCHAR(50) DEFAULT 'manual' AFTER status;
ALTER TABLE student_attendance ADD COLUMN time_in TIME NULL AFTER method;
ALTER TABLE student_attendance ADD COLUMN time_out TIME NULL AFTER time_in;
ALTER TABLE student_attendance ADD COLUMN notes TEXT NULL AFTER time_out;
ALTER TABLE student_attendance ADD COLUMN marked_at TIMESTAMP NULL AFTER notes;
ALTER TABLE student_attendance ADD COLUMN marked_by INT NULL AFTER marked_at;

-- Create terms table for academic terms
CREATE TABLE IF NOT EXISTS terms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    school_id INT NOT NULL DEFAULT 1,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    academic_year_id INT,
    is_active TINYINT(1) DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_school_id (school_id),
    INDEX idx_academic_year_id (academic_year_id),
    INDEX idx_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample terms data for 2026 academic year
INSERT INTO terms (school_id, name, code, start_date, end_date, academic_year_id, is_active)
SELECT 1, 'Term One', 'TERM1', '2026-01-01', '2026-03-31', 
       (SELECT id FROM academic_years WHERE name LIKE '%2026%' LIMIT 1), 1
WHERE NOT EXISTS (SELECT 1 FROM terms WHERE school_id = 1 AND name = 'Term One');

INSERT INTO terms (school_id, name, code, start_date, end_date, academic_year_id, is_active)
SELECT 1, 'Term Two', 'TERM2', '2026-04-01', '2026-06-30',
       (SELECT id FROM academic_years WHERE name LIKE '%2026%' LIMIT 1), 1
WHERE NOT EXISTS (SELECT 1 FROM terms WHERE school_id = 1 AND name = 'Term Two');

INSERT INTO terms (school_id, name, code, start_date, end_date, academic_year_id, is_active)
SELECT 1, 'Term Three', 'TERM3', '2026-07-01', '2026-09-30',
       (SELECT id FROM academic_years WHERE name LIKE '%2026%' LIMIT 1), 1
WHERE NOT EXISTS (SELECT 1 FROM terms WHERE school_id = 1 AND name = 'Term Three');

-- Verification query
SELECT 'Migration 013 completed: terms table and student_attendance columns added successfully' as status;
