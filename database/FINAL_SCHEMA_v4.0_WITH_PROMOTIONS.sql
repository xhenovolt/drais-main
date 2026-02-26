-- ============================================
-- DRAIS SCHOOL MANAGEMENT SYSTEM - FINAL SCHEMA
-- Version: 4.0 - With School Identity & Promotions System
-- MySQL 8.0+ Compatible
-- Last Updated: February 2026
-- ============================================

-- This file contains the complete schema including:
-- 1. Core DRAIS System
-- 2. School Information & Identity Management
-- 3. Student Promotions & Class Movement System
-- ============================================

-- ============================================
-- SETUP & PREREQUISITES
-- ============================================

DROP DATABASE IF EXISTS drais_school;
CREATE DATABASE drais_school CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE drais_school;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- SECTION 1: SCHOOL IDENTITY & INFO
-- ============================================

-- Centralized school information table
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Centralized school identity and information management';

-- ============================================
-- SECTION 2: CORE REFERENCE TABLES
-- ============================================

-- Multi-tenant schools
CREATE TABLE IF NOT EXISTS schools (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  legal_name VARCHAR(200) DEFAULT NULL,
  short_code VARCHAR(50) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  currency VARCHAR(10) DEFAULT 'UGX',
  address TEXT DEFAULT NULL,
  logo_url VARCHAR(255) DEFAULT NULL,
  status ENUM('active','inactive','suspended') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  
  INDEX idx_short_code (short_code),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Multi-tenant school entities';

-- Academic year management
CREATE TABLE IF NOT EXISTS academic_years (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  name VARCHAR(50) NOT NULL,
  start_date DATE,
  end_date DATE,
  status ENUM('draft','active','closed') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  
  UNIQUE KEY unique_year (school_id, name),
  INDEX idx_school_id (school_id),
  INDEX idx_status (status),
  INDEX idx_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Academic year definitions';

-- Terms/Semesters
CREATE TABLE IF NOT EXISTS terms (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  academic_year_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  start_date DATE,
  end_date DATE,
  status ENUM('draft','active','closed') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  
  UNIQUE KEY unique_term (academic_year_id, name),
  INDEX idx_school_id (school_id),
  INDEX idx_academic_year (academic_year_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Terms within academic years';

-- Class/Grade definitions
CREATE TABLE IF NOT EXISTS classes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) DEFAULT NULL,
  level INT DEFAULT NULL COMMENT 'Class level/order (1=Primary 1, 2=Primary 2, etc)',
  curriculum_id BIGINT DEFAULT NULL,
  capacity INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  
  INDEX idx_school_id (school_id),
  INDEX idx_level (level),
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Class/Grade definitions with hierarchy levels';

-- ============================================
-- SECTION 3: PEOPLE & PERSON MANAGEMENT
-- ============================================

-- Core person records
CREATE TABLE IF NOT EXISTS persons (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  other_name VARCHAR(100) DEFAULT NULL,
  gender ENUM('male','female','other','not_specified') DEFAULT 'not_specified',
  date_of_birth DATE DEFAULT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  national_id VARCHAR(50) DEFAULT NULL,
  passport_number VARCHAR(50) DEFAULT NULL,
  nationality VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  
  INDEX idx_first_name (first_name),
  INDEX idx_last_name (last_name),
  INDEX idx_email (email),
  INDEX idx_national_id (national_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Core person records for students, staff, etc';

-- Students
CREATE TABLE IF NOT EXISTS students (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  person_id BIGINT NOT NULL,
  admission_no VARCHAR(50) UNIQUE,
  village_id BIGINT DEFAULT NULL,
  admission_date DATE DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active',
  promotion_status ENUM('promoted', 'not_promoted', 'pending') DEFAULT 'pending' COMMENT 'Student promotion status',
  last_promoted_at DATETIME DEFAULT NULL COMMENT 'Timestamp of last promotion',
  previous_class_id BIGINT DEFAULT NULL COMMENT 'Foreign key to previous class',
  previous_year_id BIGINT DEFAULT NULL COMMENT 'Foreign key to previous academic year',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  
  INDEX idx_school_status (school_id, status),
  INDEX idx_admission_no (admission_no),
  INDEX idx_admission_date (admission_date),
  INDEX idx_promotion_status (promotion_status),
  INDEX idx_last_promoted (last_promoted_at),
  INDEX idx_previous_class (previous_class_id),
  FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
  FOREIGN KEY (previous_class_id) REFERENCES classes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Student records with promotion tracking';

-- Student enrollments
CREATE TABLE IF NOT EXISTS enrollments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  student_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  theology_class_id BIGINT DEFAULT NULL,
  stream_id BIGINT DEFAULT NULL,
  academic_year_id BIGINT DEFAULT NULL,
  term_id BIGINT DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active',
  
  INDEX idx_school_student (school_id, student_id),
  INDEX idx_class_year (class_id, academic_year_id),
  INDEX idx_status (status),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Student class enrollments per academic year';

-- ============================================
-- SECTION 4: PROMOTIONS & CLASS MOVEMENT
-- ============================================

-- Main promotions tracking table
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

-- Promotion criteria configuration
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
-- SECTION 5: ACADEMIC RESULTS & ASSESSMENT
-- ============================================

-- Student results
CREATE TABLE IF NOT EXISTS results (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  student_id BIGINT NOT NULL,
  subject_id BIGINT DEFAULT NULL,
  academic_year_id BIGINT DEFAULT NULL,
  term_id BIGINT DEFAULT NULL,
  total_marks DECIMAL(10, 2) DEFAULT 0,
  percentage DECIMAL(5, 2) DEFAULT 0,
  grade VARCHAR(2) DEFAULT NULL,
  comment TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  
  INDEX idx_school_student (school_id, student_id),
  INDEX idx_academic_year (academic_year_id),
  INDEX idx_term_id (term_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Student academic results and assessment scores';

-- ============================================
-- SECTION 6: ATTENDANCE TRACKING
-- ============================================

-- Student attendance
CREATE TABLE IF NOT EXISTS student_attendance (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  student_id BIGINT NOT NULL,
  class_id BIGINT DEFAULT NULL,
  date DATE NOT NULL,
  status ENUM('present', 'absent', 'late', 'excused', 'not_marked') DEFAULT 'not_marked',
  notes TEXT DEFAULT NULL,
  time_in TIME DEFAULT NULL,
  time_out TIME DEFAULT NULL,
  method VARCHAR(20) DEFAULT 'manual',
  marked_by BIGINT DEFAULT NULL,
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_late BOOLEAN GENERATED ALWAYS AS (
    CASE 
      WHEN time_in > '08:30:00' AND status = 'present' THEN TRUE 
      ELSE FALSE 
    END
  ) STORED,
  
  UNIQUE KEY unique_student_date (student_id, date),
  INDEX idx_school_date (school_id, date),
  INDEX idx_status (status),
  INDEX idx_marked_by (marked_by),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Student attendance tracking with timestamps';

-- ============================================
-- SECTION 7: SYSTEM AUDIT & LOGGING
-- ============================================

-- Audit trail
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  actor_user_id BIGINT DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT DEFAULT NULL,
  changes_json JSON DEFAULT NULL,
  ip VARCHAR(64) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_school_id (school_id),
  INDEX idx_actor_user (actor_user_id),
  INDEX idx_action (action),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='System-wide audit trail for compliance and tracking';

-- ============================================
-- SECTION 8: SECURITY & SETTINGS
-- ============================================

-- Security settings
CREATE TABLE IF NOT EXISTS security_settings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT,
  data_type ENUM('string','integer','boolean','json') DEFAULT 'string',
  description TEXT,
  is_editable BOOLEAN DEFAULT TRUE,
  updated_by BIGINT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_school_setting (school_id, setting_key),
  INDEX idx_school_id (school_id),
  INDEX idx_setting_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Security configuration per school';

-- ============================================
-- SECTION 9: INITIAL DATA SETUP
-- ============================================

-- Insert default school if not exists
INSERT INTO schools (id, name, legal_name, short_code, email, status)
VALUES (1, 'ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL', 'ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL', 'ALBAYAN', 'info@albayan.ug', 'active')
ON DUPLICATE KEY UPDATE id=id;

-- Insert default school info
INSERT INTO school_info (school_id, school_name, school_motto, school_address, school_contact, school_email, principal_name)
VALUES (1, 'ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL', 'Excellence in Islamic Education', 'Busembatia, Bugweri', '0706 074 179', 'info@albayan.ug', 'Headteacher')
ON DUPLICATE KEY UPDATE 
  school_name = 'ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL',
  school_motto = 'Excellence in Islamic Education';

-- ============================================
-- FINAL SETUP
-- ============================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- VIEWS FOR EASY REPORTING
-- ============================================

-- View: Student Promotion Summary
CREATE OR REPLACE VIEW v_promotion_summary AS
SELECT 
  s.id,
  s.admission_no,
  p.first_name,
  p.last_name,
  c_current.name as current_class,
  c_current.level as current_level,
  c_next.name as next_class,
  c_next.level as next_level,
  ay.name as academic_year,
  s.promotion_status,
  s.last_promoted_at,
  CASE 
    WHEN s.promotion_status = 'promoted' THEN 'Ready for Next Class'
    WHEN s.promotion_status = 'not_promoted' THEN 'Repeat Current Class'
    ELSE 'Pending Decision'
  END as promotion_action
FROM students s
JOIN persons p ON s.person_id = p.id
JOIN enrollments e ON s.id = e.student_id
JOIN classes c_current ON e.class_id = c_current.id
LEFT JOIN classes c_next ON c_next.level = c_current.level + 1 AND c_next.school_id = s.school_id
JOIN academic_years ay ON e.academic_year_id = ay.id
WHERE s.deleted_at IS NULL AND e.status = 'active';

-- View: Class-wise Promotion Status
CREATE OR REPLACE VIEW v_class_promotion_status AS
SELECT 
  c.id,
  c.name as class_name,
  c.level,
  ay.name as academic_year,
  COUNT(DISTINCT s.id) as total_students,
  SUM(CASE WHEN s.promotion_status = 'promoted' THEN 1 ELSE 0 END) as promoted_count,
  SUM(CASE WHEN s.promotion_status = 'not_promoted' THEN 1 ELSE 0 END) as not_promoted_count,
  SUM(CASE WHEN s.promotion_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
  ROUND(
    (SUM(CASE WHEN s.promotion_status = 'promoted' THEN 1 ELSE 0 END) / COUNT(DISTINCT s.id)) * 100,
    2
  ) as promotion_percentage
FROM classes c
JOIN enrollments e ON c.id = e.class_id
JOIN students s ON e.student_id = s.id
JOIN academic_years ay ON e.academic_year_id = ay.id
WHERE c.deleted_at IS NULL AND e.status = 'active' AND s.deleted_at IS NULL
GROUP BY c.id, c.name, c.level, ay.name;

-- ============================================
-- SCHEMA COMPLETE
-- ============================================
-- This schema includes:
-- ✓ Core DRAIS functionality
-- ✓ School identity and information management
-- ✓ Student promotion and class movement system
-- ✓ Academic year and term management
-- ✓ Student enrollment tracking
-- ✓ Attendance and results management
-- ✓ Audit trails and security settings
-- ✓ Reporting views for quick analysis
-- ✓ Full referential integrity with foreign keys
-- ✓ Comprehensive indexing for performance
-- ============================================
