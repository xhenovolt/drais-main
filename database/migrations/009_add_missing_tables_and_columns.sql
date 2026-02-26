-- ============================================
-- Migration 009: Add Missing Tables and Columns
-- Description: Add tahfiz_records, student_fingerprints tables and promotion_status column
-- Version: 1.0
-- ============================================

USE drais_school;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- PART 1: Add promotion-related columns to students table
-- ============================================

ALTER TABLE students 
ADD promotion_status ENUM('promoted', 'not_promoted', 'pending') DEFAULT 'pending' AFTER status COMMENT 'Student promotion status';

ALTER TABLE students 
ADD last_promoted_at DATETIME DEFAULT NULL AFTER promotion_status COMMENT 'Timestamp of last promotion';

ALTER TABLE students 
ADD previous_class_id BIGINT DEFAULT NULL AFTER last_promoted_at COMMENT 'Foreign key to previous class';

ALTER TABLE students 
ADD previous_year_id BIGINT DEFAULT NULL AFTER previous_class_id COMMENT 'Foreign key to previous academic year';

ALTER TABLE students 
ADD INDEX idx_promotion_status (promotion_status),
ADD INDEX idx_last_promoted (last_promoted_at),
ADD INDEX idx_previous_class (previous_class_id);

-- Add foreign key constraint for previous_class_id
ALTER TABLE students 
ADD CONSTRAINT fk_students_previous_class_009 FOREIGN KEY (previous_class_id) REFERENCES classes(id) ON DELETE SET NULL;

-- ============================================
-- PART 2: Create tahfiz_records table if missing
-- ============================================

CREATE TABLE IF NOT EXISTS tahfiz_records (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  group_id BIGINT DEFAULT NULL,
  presented TINYINT(1) DEFAULT 0,
  presented_length INT DEFAULT 0,
  retention_score DECIMAL(5,2) DEFAULT NULL,
  mark DECIMAL(5,2) DEFAULT NULL,
  status VARCHAR(30) DEFAULT 'pending',
  notes TEXT DEFAULT NULL,
  recorded_by BIGINT DEFAULT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_school_student (school_id, student_id),
  INDEX idx_plan (plan_id),
  INDEX idx_student_id (student_id),
  INDEX idx_status (status),
  INDEX idx_recorded_at (recorded_at),
  
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES tahfiz_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES tahfiz_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tahfiz records for student memorization tracking';

-- ============================================
-- PART 3: Create student_fingerprints table
-- ============================================

CREATE TABLE IF NOT EXISTS student_fingerprints (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  method VARCHAR(50) NOT NULL COMMENT 'phone, biometric, external',
  credential TEXT NOT NULL COMMENT 'Encrypted fingerprint template data',
  device_info JSON NULL COMMENT 'Device information for debugging',
  quality_score INT DEFAULT 0 COMMENT 'Fingerprint quality score 0-100',
  is_active TINYINT(1) DEFAULT 1 COMMENT 'Whether this fingerprint is currently active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Last time this fingerprint was used',
  
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE KEY unique_student_method (student_id, method),
  INDEX idx_student_id (student_id),
  INDEX idx_method (method),
  INDEX idx_quality (quality_score),
  INDEX idx_is_active (is_active),
  INDEX idx_created_at (created_at),
  INDEX idx_last_used_at (last_used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Student fingerprint biometric data storage';

-- ============================================
-- PART 4: Ensure tahfiz_tables exist
-- ============================================

-- tahfiz_books
CREATE TABLE IF NOT EXISTS tahfiz_books (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  total_units INT DEFAULT NULL,
  unit_type VARCHAR(50) DEFAULT 'verse',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_school_id (school_id),
  INDEX idx_title (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Quran books and related texts for tahfiz tracking';

-- tahfiz_groups
CREATE TABLE IF NOT EXISTS tahfiz_groups (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  teacher_id BIGINT NOT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_school_id (school_id),
  INDEX idx_teacher_id (teacher_id),
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tahfiz groups (halaqat) for organizing students';

-- tahfiz_group_members
CREATE TABLE IF NOT EXISTS tahfiz_group_members (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  group_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  role VARCHAR(30) DEFAULT 'member',
  
  UNIQUE KEY uniq_group_student (group_id, student_id),
  FOREIGN KEY (group_id) REFERENCES tahfiz_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_group_id (group_id),
  INDEX idx_student_id (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tahfiz group membership tracking';

-- tahfiz_plans
CREATE TABLE IF NOT EXISTS tahfiz_plans (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  book_id BIGINT DEFAULT NULL,
  teacher_id BIGINT NOT NULL,
  class_id BIGINT DEFAULT NULL,
  stream_id BIGINT DEFAULT NULL,
  group_id BIGINT DEFAULT NULL,
  assigned_date DATE NOT NULL,
  portion_text VARCHAR(255) NOT NULL,
  portion_unit VARCHAR(50) DEFAULT 'verse',
  expected_length INT DEFAULT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'tilawa' COMMENT 'tilawa, hifz, muraja, or other',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_school_date (school_id, assigned_date),
  INDEX idx_teacher (teacher_id),
  INDEX idx_book_id (book_id),
  INDEX idx_group_id (group_id),
  INDEX idx_class_id (class_id),
  FOREIGN KEY (book_id) REFERENCES tahfiz_books(id) ON DELETE SET NULL,
  FOREIGN KEY (group_id) REFERENCES tahfiz_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tahfiz memorization plans for students';

-- ============================================
-- PART 5: Add missing columns to tahfiz_plans and tahfiz_records
-- ============================================

ALTER TABLE tahfiz_plans
ADD book_id BIGINT DEFAULT NULL AFTER stream_id;

ALTER TABLE tahfiz_plans
ADD group_id BIGINT DEFAULT NULL AFTER book_id;

ALTER TABLE tahfiz_records
ADD group_id BIGINT DEFAULT NULL AFTER student_id;

-- ============================================
-- PART 6: Create tahfiz support tables
-- ============================================

CREATE TABLE IF NOT EXISTS tahfiz_attendance (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  group_id BIGINT NOT NULL,
  date DATE NOT NULL,
  status ENUM('present','absent','late','excused') DEFAULT 'present',
  remarks TEXT DEFAULT NULL,
  recorded_by BIGINT DEFAULT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_school_student (school_id, student_id),
  INDEX idx_group_id (group_id),
  INDEX idx_date (date),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES tahfiz_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tahfiz attendance tracking';

CREATE TABLE IF NOT EXISTS tahfiz_evaluations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  evaluator_id BIGINT NOT NULL,
  type ENUM('monthly','termly','annual','special') DEFAULT 'monthly',
  retention_score DECIMAL(5,2) DEFAULT NULL,
  tajweed_score DECIMAL(5,2) DEFAULT NULL,
  voice_score DECIMAL(5,2) DEFAULT NULL,
  discipline_score DECIMAL(5,2) DEFAULT NULL,
  remarks TEXT DEFAULT NULL,
  evaluated_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_school_student (school_id, student_id),
  INDEX idx_evaluator (evaluator_id),
  INDEX idx_type (type),
  INDEX idx_evaluated_at (evaluated_at),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tahfiz student evaluations and progress assessment';

CREATE TABLE IF NOT EXISTS tahfiz_portions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  student_id BIGINT NOT NULL,
  portion_name VARCHAR(100) NOT NULL,
  surah_name VARCHAR(100) DEFAULT NULL,
  ayah_from INT DEFAULT NULL,
  ayah_to INT DEFAULT NULL,
  juz_number INT DEFAULT NULL,
  page_from INT DEFAULT NULL,
  page_to INT DEFAULT NULL,
  status ENUM('pending', 'in_progress', 'completed', 'skipped', 'review') DEFAULT 'pending',
  difficulty_level ENUM('easy', 'medium', 'hard') DEFAULT 'medium',
  estimated_days INT DEFAULT 1,
  notes TEXT DEFAULT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  reviewed_by BIGINT DEFAULT NULL,
  verified_by BIGINT DEFAULT NULL,
  verification_status ENUM('unverified', 'verified', 'rejected') DEFAULT 'unverified',
  
  INDEX idx_student_id (student_id),
  INDEX idx_status (status),
  INDEX idx_school_id (school_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tahfiz portion tracking and verification';

-- ============================================
-- PART 7: Create audit and logging tables if missing
-- ============================================

CREATE TABLE IF NOT EXISTS fingerprint_capture_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  method VARCHAR(50) NOT NULL,
  capture_result ENUM('success', 'failed', 'timeout') NOT NULL,
  error_message TEXT NULL,
  device_info JSON NULL,
  template_size INT NULL COMMENT 'Size of captured template in bytes',
  quality_score INT NULL COMMENT 'Capture quality 0-100',
  capture_duration INT NULL COMMENT 'Time taken to capture in milliseconds',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_student_id (student_id),
  INDEX idx_method (method),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Fingerprint capture attempt logging';

-- ============================================
-- PART 8: Verify and enable foreign key checks
-- ============================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- Migration complete message
-- ============================================

INSERT INTO tahfiz_migration_log (message) VALUES
  ('Migration 009: Added tahfiz_records table for memorization tracking'),
  ('Migration 009: Added student_fingerprints table for biometric authentication'),
  ('Migration 009: Added promotion_status column to students table'),
  ('Migration 009: Ensured all tahfiz support tables exist (books, groups, plans, evaluations, portions, attendance)'),
  ('Migration 009: All missing tables and columns have been created successfully');
