-- ============================================
-- Migration 007: School Identity & Promotions System
-- Description: Add centralized school information and student promotions tracking
-- Version: 1.0
-- ============================================

-- ============================================
-- PART 1: School Information Table
-- ============================================

CREATE TABLE IF NOT EXISTS school_info (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT 1 NOT NULL,
  school_name VARCHAR(255) NOT NULL COMMENT 'Official school name',
  school_motto VARCHAR(255) DEFAULT NULL COMMENT 'School motto or tagline',
  school_address TEXT DEFAULT NULL COMMENT 'Physical school address',
  school_contact VARCHAR(20) DEFAULT NULL COMMENT 'Primary contact phone number',
  school_email VARCHAR(255) DEFAULT NULL COMMENT 'School email address',
  school_logo VARCHAR(255) DEFAULT NULL COMMENT 'Path to school logo image',
  registration_number VARCHAR(100) DEFAULT NULL COMMENT 'Official registration/license number',
  website VARCHAR(255) DEFAULT NULL COMMENT 'School website URL',
  founded_year INT DEFAULT NULL COMMENT 'Year school was founded',
  principal_name VARCHAR(255) DEFAULT NULL COMMENT 'Current principal/headteacher name',
  principal_email VARCHAR(255) DEFAULT NULL COMMENT 'Principal email address',
  principal_phone VARCHAR(20) DEFAULT NULL COMMENT 'Principal phone number',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  
  UNIQUE KEY unique_school (school_id),
  INDEX idx_school_id (school_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Centralized school identity and information';

-- ============================================
-- PART 2: Student Table Enhancements
-- ============================================

-- Add promotion-related columns to students table
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS promotion_status ENUM('promoted', 'not_promoted', 'pending') DEFAULT 'pending' AFTER status COMMENT 'Student promotion status',
ADD COLUMN IF NOT EXISTS last_promoted_at DATETIME DEFAULT NULL AFTER promotion_status COMMENT 'Timestamp of last promotion',
ADD COLUMN IF NOT EXISTS previous_class_id BIGINT DEFAULT NULL AFTER last_promoted_at COMMENT 'Foreign key to previous class',
ADD COLUMN IF NOT EXISTS previous_year_id BIGINT DEFAULT NULL AFTER previous_class_id COMMENT 'Foreign key to previous academic year',
ADD INDEX idx_promotion_status (promotion_status),
ADD INDEX idx_last_promoted (last_promoted_at),
ADD INDEX idx_previous_class (previous_class_id);

-- Add foreign key constraint for previous_class_id
ALTER TABLE students 
ADD CONSTRAINT fk_students_previous_class 
FOREIGN KEY (previous_class_id) REFERENCES classes(id) ON DELETE SET NULL;

-- ============================================
-- PART 3: Promotions Tracking Table
-- ============================================

CREATE TABLE IF NOT EXISTS promotions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  student_id BIGINT NOT NULL,
  from_class_id BIGINT NOT NULL,
  to_class_id BIGINT NOT NULL,
  from_academic_year_id BIGINT DEFAULT NULL,
  to_academic_year_id BIGINT DEFAULT NULL,
  promotion_status ENUM('promoted', 'not_promoted', 'pending', 'deferred') DEFAULT 'pending' COMMENT 'Promotion decision',
  criteria_used JSON DEFAULT NULL COMMENT 'Promotion criteria applied (min_marks, min_average, etc)',
  remarks TEXT DEFAULT NULL COMMENT 'Additional remarks about promotion decision',
  promoted_by BIGINT DEFAULT NULL COMMENT 'User ID of admin who performed promotion',
  approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  approved_by BIGINT DEFAULT NULL COMMENT 'User ID of approver',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  
  UNIQUE KEY unique_promotion_cycle (school_id, student_id, from_academic_year_id),
  INDEX idx_school_id (school_id),
  INDEX idx_student_id (student_id),
  INDEX idx_from_class (from_class_id),
  INDEX idx_to_class (to_class_id),
  INDEX idx_promotion_status (promotion_status),
  INDEX idx_approval_status (approval_status),
  INDEX idx_promoted_by (promoted_by),
  INDEX idx_created_at (created_at),
  
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (from_class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  FOREIGN KEY (to_class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  FOREIGN KEY (from_academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL,
  FOREIGN KEY (to_academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Student promotion history and tracking';

-- ============================================
-- PART 4: Promotion Criteria Configuration Table
-- ============================================

CREATE TABLE IF NOT EXISTS promotion_criteria (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  academic_year_id BIGINT NOT NULL,
  from_class_id BIGINT NOT NULL,
  to_class_id BIGINT NOT NULL,
  minimum_total_marks DECIMAL(10, 2) DEFAULT NULL COMMENT 'Minimum total marks required for promotion',
  minimum_average_marks DECIMAL(10, 2) DEFAULT NULL COMMENT 'Minimum average marks required for promotion',
  minimum_subjects_passed INT DEFAULT NULL COMMENT 'Minimum number of subjects to pass',
  attendance_percentage DECIMAL(5, 2) DEFAULT 75.00 COMMENT 'Minimum attendance percentage',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_criteria (school_id, academic_year_id, from_class_id),
  INDEX idx_school_id (school_id),
  INDEX idx_academic_year (academic_year_id),
  INDEX idx_from_class (from_class_id),
  INDEX idx_to_class (to_class_id),
  
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  FOREIGN KEY (from_class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Promotion criteria configuration per academic year and class transition';

-- ============================================
-- PART 5: Initial Data Setup
-- ============================================

-- Insert default school info if not exists (adjust values as needed)
INSERT INTO school_info (school_id, school_name, school_motto, school_address, school_contact, school_email, principal_name)
VALUES (1, 'ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL', 'Excellence in Islamic Education', 'Busembatia, Bugweri', '0706 074 179', 'info@albayan.ug', 'Headteacher')
ON DUPLICATE KEY UPDATE 
  school_name = 'ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL',
  school_motto = 'Excellence in Islamic Education';

-- ============================================
-- Migration Complete
-- ============================================
-- Next step: Run database API migrations and create frontend components
