-- ============================================================================
-- Migration: Add Enrollment History Tracking
-- Date: 2026-03-29
-- Purpose: Track all class reassignments with full audit trail
-- ============================================================================

-- Step 1: Ensure enrollments table has timestamps if it doesn't already
ALTER TABLE enrollments 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER status;

-- Step 2: Create enrollment history table for tracking class changes
CREATE TABLE IF NOT EXISTS enrollment_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  enrollment_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  old_class_id BIGINT,
  new_class_id BIGINT NOT NULL,
  changed_by BIGINT NOT NULL,
  reason TEXT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_school_id (school_id),
  INDEX idx_enrollment_id (enrollment_id),
  INDEX idx_student_id (student_id),
  INDEX idx_changed_by (changed_by),
  INDEX idx_created_at (created_at),
  CONSTRAINT fk_enrollment_history_enrollment FOREIGN KEY (enrollment_id) 
    REFERENCES enrollments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Audit trail for enrollment class changes';

-- ============================================================================
-- Done
-- ============================================================================
