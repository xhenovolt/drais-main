-- ============================================
-- Migration: Allow NULL school_id in sessions
-- Purpose: Support users selecting school after login
-- Created: March 1, 2026
-- ============================================

-- Make school_id nullable in sessions table
-- Users can have a session without a school while they select one
ALTER TABLE sessions MODIFY school_id BIGINT NULL;

-- Update the foreign key constraint to allow NULL
ALTER TABLE sessions DROP FOREIGN KEY sessions_ibfk_2;
ALTER TABLE sessions ADD CONSTRAINT sessions_ibfk_2 
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;

-- Create index for finding sessions by user (when school_id is NULL)
ALTER TABLE sessions ADD INDEX idx_user_no_school (user_id, school_id) 
  USING BTREE;
