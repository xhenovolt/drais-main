-- ==================================================
-- MIGRATION: Add Promotion Tracking Columns to Students
-- Purpose: Enable proper promotion status tracking
-- Date: 2025-02-14
-- ==================================================

-- Step 1: Add promotion-related columns to students table
ALTER TABLE students
ADD COLUMN promotion_status VARCHAR(50) DEFAULT 'pending' AFTER status,
ADD COLUMN last_promoted_at TIMESTAMP NULL AFTER promotion_status,
ADD COLUMN previous_class_id BIGINT DEFAULT NULL AFTER last_promoted_at,
ADD COLUMN previous_year_id BIGINT DEFAULT NULL AFTER previous_class_id;

-- Step 2: Add indexes for promotion queries
ALTER TABLE students
ADD INDEX idx_promotion_status (promotion_status),
ADD INDEX idx_last_promoted_at (last_promoted_at),
ADD INDEX idx_school_status_promotion (school_id, status, promotion_status);

-- Step 3: Create promotions tracking table to maintain audit history
CREATE TABLE IF NOT EXISTS promotions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  student_id BIGINT NOT NULL,
  from_class_id BIGINT NOT NULL,
  to_class_id BIGINT NOT NULL,
  from_academic_year_id BIGINT DEFAULT NULL,
  to_academic_year_id BIGINT DEFAULT NULL,
  promotion_status VARCHAR(50) NOT NULL,
  term_used VARCHAR(100) DEFAULT NULL,
  promotion_reason VARCHAR(100) DEFAULT 'manual',
  criteria_used TEXT DEFAULT NULL,
  promotion_notes TEXT DEFAULT NULL,
  promoted_by BIGINT DEFAULT NULL,
  promoted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_year_promotion (student_id, to_academic_year_id),
  INDEX idx_student_id (student_id),
  INDEX idx_from_to_class (from_class_id, to_class_id),
  INDEX idx_promoted_at (promoted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Step 4: Initialize default status for all active students
UPDATE students 
SET promotion_status = 'pending' 
WHERE promotion_status IS NULL AND status = 'active';

-- Migration complete
SELECT 
  COUNT(*) as total_students,
  COUNT(DISTINCT promotion_status) as unique_statuses,
  promotion_status as status,
  COUNT(*) as count
FROM students
GROUP BY promotion_status
ORDER BY count DESC;
