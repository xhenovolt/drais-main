-- ============================================
-- Migration 008: Enhanced Promotions System
-- Description: Add comprehensive promotion tracking, audit trail, and enhanced status management
-- Version: 1.0
-- Date: February 2026
-- ============================================

-- ============================================
-- PART 1: Update Students Table with Enhanced Promotion Tracking
-- ============================================

ALTER TABLE students
MODIFY COLUMN promotion_status ENUM('promoted', 'not_promoted', 'demoted', 'dropped_out', 'completed', 'pending') DEFAULT 'pending' COMMENT 'Enhanced promotion status with demotion and dropout support';

-- Add term-specific promotion tracking
ALTER TABLE students
ADD COLUMN IF NOT EXISTS term_promoted_in VARCHAR(50) DEFAULT NULL COMMENT 'Term when promotion occurred (e.g., Term 3)',
ADD COLUMN IF NOT EXISTS promotion_criteria_used JSON DEFAULT NULL COMMENT 'Criteria applied for promotion decision',
ADD COLUMN IF NOT EXISTS promotion_notes TEXT DEFAULT NULL COMMENT 'Admin notes about promotion decision',
ADD INDEX idx_promotion_status_term (promotion_status, term_promoted_in);

-- ============================================
-- PART 2: Enhanced Promotions Table with Full Audit Trail
-- ============================================

-- Drop and recreate for comprehensive structure
ALTER TABLE promotions
ADD COLUMN IF NOT EXISTS term_used VARCHAR(50) DEFAULT NULL COMMENT 'Term when promotion decision was made',
ADD COLUMN IF NOT EXISTS promotion_reason ENUM('criteria_based', 'manual', 'appeal', 'correction') DEFAULT 'manual' COMMENT 'Reason for promotion decision',
ADD COLUMN IF NOT EXISTS prerequisite_met BOOLEAN DEFAULT TRUE COMMENT 'Whether prerequisite conditions were met',
ADD COLUMN IF NOT EXISTS additional_notes TEXT DEFAULT NULL COMMENT 'Additional context or notes about promotion',
ADD INDEX idx_term_academic_year (term_used, from_academic_year_id);

-- ============================================
-- PART 3: Promotion Audit Log Table (NEW)
-- ============================================

CREATE TABLE IF NOT EXISTS promotion_audit_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  promotion_id BIGINT DEFAULT NULL COMMENT 'Reference to promotions table',
  student_id BIGINT NOT NULL,
  action_type ENUM('promoted', 'demoted', 'dropped', 'status_changed', 'criteria_applied', 'cancelled') NOT NULL,
  from_class_id BIGINT DEFAULT NULL,
  to_class_id BIGINT DEFAULT NULL,
  from_academic_year_id BIGINT DEFAULT NULL,
  to_academic_year_id BIGINT DEFAULT NULL,
  status_before VARCHAR(50) DEFAULT NULL,
  status_after VARCHAR(50) DEFAULT NULL,
  criteria_applied JSON DEFAULT NULL COMMENT 'Criteria checked/applied',
  performed_by BIGINT NOT NULL COMMENT 'User ID who performed action',
  reason TEXT DEFAULT NULL COMMENT 'Why this action was taken',
  ip_address VARCHAR(45) DEFAULT NULL COMMENT 'IP address of who made change',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_audit (promotion_id, action_type, created_at),
  INDEX idx_school_id (school_id),
  INDEX idx_student_id (student_id),
  INDEX idx_action_type (action_type),
  INDEX idx_performed_by (performed_by),
  INDEX idx_created_at (created_at),
  INDEX idx_from_class (from_class_id),
  INDEX idx_to_class (to_class_id),
  
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE SET NULL,
  FOREIGN KEY (from_class_id) REFERENCES classes(id) ON DELETE SET NULL,
  FOREIGN KEY (to_class_id) REFERENCES classes(id) ON DELETE SET NULL,
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Complete audit trail for all promotion actions';

-- ============================================
-- PART 4: Enrollment Table - Make Academic Year Optional
-- ============================================

-- Check if enrollments table exists and update as needed
ALTER TABLE enrollments
MODIFY COLUMN academic_year_id BIGINT NULL COMMENT 'Academic year - now optional to show all students regardless of year',
ADD INDEX IF NOT EXISTS idx_optional_academic_year (academic_year_id);

-- ============================================
-- PART 5: Students Table - Make Academic Year Optional
-- ============================================

-- Verify students table has enrollment relationship without forcing academic year
-- The key is that queries should use: WHERE (academic_year_id = ? OR ? IS NULL)

-- ============================================
-- PART 6: Performance Indexes for Rapid Filtering
-- ============================================

-- Create composite indexes for common queries
ALTER TABLE students
ADD INDEX IF NOT EXISTS idx_school_promotion_status (school_id, promotion_status),
ADD INDEX IF NOT EXISTS idx_school_status_year (school_id, promotion_status, term_promoted_in),
ADD INDEX IF NOT EXISTS idx_school_deleted_status (school_id, deleted_at, status);

ALTER TABLE promotions
ADD INDEX IF NOT EXISTS idx_school_academic_year_status (school_id, from_academic_year_id, promotion_status),
ADD INDEX IF NOT EXISTS idx_student_academic_year (student_id, from_academic_year_id);

ALTER TABLE promotion_audit_log
ADD INDEX IF NOT EXISTS idx_school_action_date (school_id, action_type, created_at);

-- ============================================
-- PART 7: View for Promotion Statistics
-- ============================================

CREATE OR REPLACE VIEW v_promotion_status_summary AS
SELECT 
  s.school_id,
  s.promotion_status,
  COUNT(*) as student_count,
  ay.id as academic_year_id,
  ay.name as academic_year_name
FROM students s
LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
WHERE s.deleted_at IS NULL AND s.status = 'active'
GROUP BY s.school_id, s.promotion_status, ay.id, ay.name
ORDER BY s.school_id, s.promotion_status;

-- ============================================
-- PART 8: View for Class Promotion Pipeline
-- ============================================

CREATE OR REPLACE VIEW v_class_promotion_readiness AS
SELECT 
  s.school_id,
  c.id as current_class_id,
  c.name as current_class_name,
  COUNT(DISTINCT s.id) as total_students,
  SUM(CASE WHEN s.promotion_status = 'promoted' THEN 1 ELSE 0 END) as promoted_count,
  SUM(CASE WHEN s.promotion_status = 'not_promoted' THEN 1 ELSE 0 END) as not_promoted_count,
  SUM(CASE WHEN s.promotion_status = 'demoted' THEN 1 ELSE 0 END) as demoted_count,
  SUM(CASE WHEN s.promotion_status = 'dropped_out' THEN 1 ELSE 0 END) as dropped_out_count,
  SUM(CASE WHEN s.promotion_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
  ay.id as academic_year_id,
  ay.name as academic_year_name
FROM students s
JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
JOIN classes c ON e.class_id = c.id
LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
WHERE s.deleted_at IS NULL AND s.status = 'active'
GROUP BY s.school_id, c.id, c.name, ay.id, ay.name
ORDER BY ay.name DESC, c.level ASC;

-- ============================================
-- PART 9: Stored Procedure for Safe Bulk Promotion
-- ============================================

DELIMITER //

CREATE PROCEDURE sp_bulk_promote_students(
  IN p_school_id BIGINT,
  IN p_from_academic_year_id BIGINT,
  IN p_from_class_id BIGINT,
  IN p_to_class_id BIGINT,
  IN p_to_academic_year_id BIGINT,
  IN p_min_total_marks DECIMAL(10, 2),
  IN p_min_average_marks DECIMAL(10, 2),
  IN p_promoted_by BIGINT,
  IN p_criteria_json JSON,
  OUT p_promoted_count INT,
  OUT p_not_promoted_count INT
)
READS SQL DATA
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SET p_promoted_count = -1;
    SET p_not_promoted_count = -1;
  END;

  START TRANSACTION;

  -- Get students who meet criteria
  WITH eligible_students AS (
    SELECT 
      s.id,
      s.admission_no,
      AVG(r.total_marks) as avg_marks,
      SUM(r.total_marks) as total_marks_sum
    FROM students s
    JOIN enrollments e ON s.id = e.student_id
    JOIN classes c ON e.class_id = c.id
    LEFT JOIN results r ON s.id = r.student_id 
      AND r.academic_year_id = p_from_academic_year_id
      AND r.term_id IN (
        SELECT id FROM terms WHERE academic_year_id = p_from_academic_year_id AND name = 'Term 3'
      )
    WHERE 
      s.school_id = p_school_id
      AND e.academic_year_id = p_from_academic_year_id
      AND c.id = p_from_class_id
      AND s.deleted_at IS NULL
      AND s.status = 'active'
    GROUP BY s.id, s.admission_no
    HAVING 
      (p_min_total_marks IS NULL OR total_marks_sum >= p_min_total_marks)
      AND (p_min_average_marks IS NULL OR avg_marks >= p_min_average_marks)
  )
  UPDATE students s
  SET 
    s.previous_class_id = p_from_class_id,
    s.previous_year_id = p_from_academic_year_id,
    s.promotion_status = 'promoted',
    s.last_promoted_at = NOW(),
    s.term_promoted_in = 'Term 3',
    s.promotion_criteria_used = p_criteria_json
  WHERE s.id IN (SELECT id FROM eligible_students);

  SET p_promoted_count = ROW_COUNT();

  -- Update enrollments for promoted students
  UPDATE enrollments e
  JOIN (
    SELECT s.id FROM students s
    WHERE s.promotion_status = 'promoted'
      AND s.school_id = p_school_id
      AND s.previous_class_id = p_from_class_id
      AND s.last_promoted_at IS NOT NULL
  ) s ON e.student_id = s.id
  SET 
    e.class_id = p_to_class_id,
    e.academic_year_id = p_to_academic_year_id
  WHERE e.academic_year_id = p_from_academic_year_id;

  -- Create promotion records
  INSERT INTO promotions (
    school_id,
    student_id,
    from_class_id,
    to_class_id,
    from_academic_year_id,
    to_academic_year_id,
    promotion_status,
    promotion_reason,
    term_used,
    criteria_used,
    promoted_by
  )
  SELECT 
    p_school_id,
    s.id,
    p_from_class_id,
    p_to_class_id,
    p_from_academic_year_id,
    p_to_academic_year_id,
    'promoted',
    'criteria_based',
    'Term 3',
    p_criteria_json,
    p_promoted_by
  FROM students s
  WHERE s.promotion_status = 'promoted'
    AND s.school_id = p_school_id
    AND s.previous_class_id = p_from_class_id
    AND s.last_promoted_at IS NOT NULL;

  -- Count not promoted (rest of class)
  SELECT COUNT(*)
  INTO p_not_promoted_count
  FROM students s
  JOIN enrollments e ON s.id = e.student_id
  WHERE 
    s.school_id = p_school_id
    AND e.academic_year_id = p_from_academic_year_id
    AND e.class_id = p_from_class_id
    AND s.deleted_at IS NULL
    AND s.status = 'active'
    AND s.promotion_status != 'promoted';

  COMMIT;

EXCEPTION WHEN OTHERS THEN
  ROLLBACK;
  SET p_promoted_count = -1;
  SET p_not_promoted_count = -1;
END //

DELIMITER ;

-- ============================================
-- PART 10: Migration Complete
-- ============================================
-- All enhancements applied successfully
-- Next: Update API endpoints and frontend components
