-- ============================================
-- ALBAYAN QURAN MEMORIZATION CENTER
-- SAFE DATABASE MIGRATION TO DRAIS v4.0
-- ============================================
-- Date: March 14, 2026
-- Source: AlbayanSecular2026.sql (phpMyAdmin dump, MariaDB 10.4)
-- Target: DRAIS v4.0 schema (MySQL 8.0+ / TiDB compatible)
--
-- RULES:
--   1. NEVER delete existing Albayan data
--   2. Add missing tables with IF NOT EXISTS
--   3. Add missing columns using safe defaults
--   4. Add indexes for performance
--   5. Preserve all existing Albayan data
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- ============================================
-- HELPER: Safe column addition procedure
-- ============================================
DROP PROCEDURE IF EXISTS safe_add_column;
DELIMITER //
CREATE PROCEDURE safe_add_column(
  IN tbl VARCHAR(64),
  IN col VARCHAR(64),
  IN col_def TEXT
)
BEGIN
  SET @db_name = DATABASE();
  SELECT COUNT(*) INTO @col_exists
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = tbl
    AND COLUMN_NAME = col;
  IF @col_exists = 0 THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', col_def);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- ============================================
-- HELPER: Safe index addition procedure
-- ============================================
DROP PROCEDURE IF EXISTS safe_add_index;
DELIMITER //
CREATE PROCEDURE safe_add_index(
  IN tbl VARCHAR(64),
  IN idx_name VARCHAR(64),
  IN idx_def TEXT
)
BEGIN
  SET @db_name = DATABASE();
  SELECT COUNT(*) INTO @idx_exists
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = tbl
    AND INDEX_NAME = idx_name;
  IF @idx_exists = 0 THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx_name, '` (', idx_def, ')');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- ============================================
-- HELPER: Safe unique key addition procedure
-- ============================================
DROP PROCEDURE IF EXISTS safe_add_unique;
DELIMITER //
CREATE PROCEDURE safe_add_unique(
  IN tbl VARCHAR(64),
  IN idx_name VARCHAR(64),
  IN idx_def TEXT
)
BEGIN
  SET @db_name = DATABASE();
  SELECT COUNT(*) INTO @idx_exists
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = tbl
    AND INDEX_NAME = idx_name;
  IF @idx_exists = 0 THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD UNIQUE KEY `', idx_name, '` (', idx_def, ')');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;


-- ============================================
-- PHASE 1: FIX TABLE STRUCTURE (PKs + AUTO_INCREMENT)
-- ============================================
-- The Albayan dump creates tables without PRIMARY KE or AUTO_INCREMENT.
-- We must fix these before adding columns/data. We use dynamic SQL
-- to safely check before altering.

-- Helper: Add PK + AUTO_INCREMENT if missing
-- Also handles duplicate id=0 rows by renumbering them first
DROP PROCEDURE IF EXISTS safe_fix_pk;
DELIMITER //
CREATE PROCEDURE safe_fix_pk(IN tbl VARCHAR(64))
BEGIN
  SET @db_name = DATABASE();
  
  -- Check if PK exists
  SELECT COUNT(*) INTO @has_pk FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = tbl AND CONSTRAINT_TYPE = 'PRIMARY KEY';
  
  IF @has_pk = 0 THEN
    -- Before adding PK, fix duplicate id values
    -- Find MAX(id) and renumber any duplicate ids starting from MAX(id)+1
    SET @ddl = CONCAT('SELECT MAX(id) INTO @max_id FROM `', tbl, '`');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    IF @max_id IS NULL THEN
      SET @max_id = 0;
    END IF;
    
    -- Check for duplicate id values
    SET @ddl = CONCAT(
      'SELECT COUNT(*) INTO @dup_count FROM (SELECT id, COUNT(*) as cnt FROM `', tbl, 
      '` GROUP BY id HAVING cnt > 1) t'
    );
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    
    IF @dup_count > 0 THEN
      -- Add a temporary unique column to identify rows
      SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `_tmp_rownum` BIGINT DEFAULT NULL');
      PREPARE stmt FROM @ddl;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
      
      -- Assign sequential numbers to all rows
      SET @rn = 0;
      SET @ddl = CONCAT('UPDATE `', tbl, '` SET `_tmp_rownum` = (@rn := @rn + 1)');
      PREPARE stmt FROM @ddl;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
      
      -- Update id to be the sequential number for ALL rows (guarantees uniqueness)
      SET @ddl = CONCAT('UPDATE `', tbl, '` SET `id` = `_tmp_rownum`');
      PREPARE stmt FROM @ddl;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
      
      -- Remove temp column
      SET @ddl = CONCAT('ALTER TABLE `', tbl, '` DROP COLUMN `_tmp_rownum`');
      PREPARE stmt FROM @ddl;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;

    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` ADD PRIMARY KEY (`id`)');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
  
  -- Check if AUTO_INCREMENT exists
  SELECT COUNT(*) INTO @has_ai FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = tbl AND COLUMN_NAME = 'id' AND EXTRA LIKE '%auto_increment%';
  
  IF @has_ai = 0 THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` MODIFY COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL safe_fix_pk('academic_years');
CALL safe_fix_pk('audit_log');
CALL safe_fix_pk('classes');
CALL safe_fix_pk('enrollments');
CALL safe_fix_pk('people');
CALL safe_fix_pk('results');
CALL safe_fix_pk('roles');
CALL safe_fix_pk('permissions');
CALL safe_fix_pk('schools');
CALL safe_fix_pk('student_attendance');
CALL safe_fix_pk('subjects');

DROP PROCEDURE IF EXISTS safe_fix_pk;


-- ============================================
-- PHASE 2: ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================

-- ----- 1.1 academic_years -----
ALTER TABLE `academic_years` MODIFY COLUMN `name` VARCHAR(50) NOT NULL;
ALTER TABLE `academic_years` MODIFY COLUMN `status` VARCHAR(20) DEFAULT 'active';

CALL safe_add_column('academic_years', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
CALL safe_add_column('academic_years', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL safe_add_column('academic_years', 'deleted_at', 'TIMESTAMP NULL DEFAULT NULL');

CALL safe_add_index('academic_years', 'idx_school_id', 'school_id');
CALL safe_add_index('academic_years', 'idx_status', 'status');
CALL safe_add_index('academic_years', 'idx_dates', 'start_date, end_date');
CALL safe_add_unique('academic_years', 'unique_year', 'school_id, name');

-- ----- 1.2 audit_log -----
CALL safe_add_column('audit_log', 'school_id', 'BIGINT DEFAULT NULL AFTER `id`');

CALL safe_add_index('audit_log', 'idx_school_id', 'school_id');
CALL safe_add_index('audit_log', 'idx_actor_user', 'actor_user_id');
CALL safe_add_index('audit_log', 'idx_action', 'action');
CALL safe_add_index('audit_log', 'idx_entity', 'entity_type, entity_id');
CALL safe_add_index('audit_log', 'idx_created_at', 'created_at');

-- Backfill school_id
UPDATE `audit_log` SET `school_id` = 1 WHERE `school_id` IS NULL;

-- ----- 1.3 classes -----
CALL safe_add_column('classes', 'code', 'VARCHAR(50) DEFAULT NULL AFTER `name`');
CALL safe_add_column('classes', 'level', 'INT DEFAULT NULL AFTER `code`');
CALL safe_add_column('classes', 'capacity', 'INT DEFAULT NULL AFTER `level`');
CALL safe_add_column('classes', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
CALL safe_add_column('classes', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL safe_add_column('classes', 'deleted_at', 'TIMESTAMP NULL DEFAULT NULL');

-- Copy class_level -> level (only for non-nursery classes that had meaningful values)
UPDATE `classes` SET `level` = `class_level` WHERE `level` IS NULL AND `class_level` IS NOT NULL;

-- Set correct sequential levels for all classes by name
UPDATE `classes` SET `level` = 0 WHERE `name` = 'BABY CLASS';
UPDATE `classes` SET `level` = 1 WHERE `name` = 'MIDDLE CLASS';
UPDATE `classes` SET `level` = 2 WHERE `name` = 'TOP CLASS';
UPDATE `classes` SET `level` = 3 WHERE `name` = 'PRIMARY ONE';
UPDATE `classes` SET `level` = 4 WHERE `name` = 'PRIMARY TWO';
UPDATE `classes` SET `level` = 5 WHERE `name` = 'PRIMARY THREE';
UPDATE `classes` SET `level` = 6 WHERE `name` = 'PRIMARY FOUR';
UPDATE `classes` SET `level` = 7 WHERE `name` = 'PRIMARY FIVE';
UPDATE `classes` SET `level` = 8 WHERE `name` = 'PRIMARY SIX';
UPDATE `classes` SET `level` = 9 WHERE `name` = 'PRIMARY SEVEN';
UPDATE `classes` SET `level` = 10 WHERE `name` = 'TAHFIZ';

-- Generate codes
UPDATE `classes` SET `code` = UPPER(REPLACE(`name`, ' ', '_')) WHERE `code` IS NULL;

CALL safe_add_index('classes', 'idx_school_id', 'school_id');
CALL safe_add_index('classes', 'idx_level', 'level');
CALL safe_add_index('classes', 'idx_code', 'code');

-- ----- 1.4 schools -----
CALL safe_add_column('schools', 'status', "ENUM('active','inactive','suspended') DEFAULT 'active'");
CALL safe_add_column('schools', 'setup_complete', 'BOOLEAN DEFAULT FALSE');
CALL safe_add_column('schools', 'subscription_plan', "VARCHAR(50) DEFAULT 'trial'");
CALL safe_add_column('schools', 'subscription_status', "ENUM('active','inactive','trial','suspended') DEFAULT 'active'");
CALL safe_add_column('schools', 'school_type', 'VARCHAR(100) DEFAULT NULL');

UPDATE `schools` SET `status` = 'active', `setup_complete` = TRUE, `subscription_status` = 'active' WHERE `id` = 1;

CALL safe_add_index('schools', 'idx_short_code', 'short_code');
CALL safe_add_index('schools', 'idx_status', 'status');
CALL safe_add_index('schools', 'idx_created_at', 'created_at');

-- ----- 1.5 school_info -----
INSERT INTO `school_info` (`school_id`, `school_name`, `school_motto`, `school_address`, `school_contact`, `school_email`, `principal_name`)
SELECT 1, 'Albayan Quran Memorization Centre Nursery and Primary School', 'Excellence in Islamic Education', 'Kampala, Uganda', '+256 700 123 456', 'info@albayan.ac.ug', 'Headteacher'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `school_info` WHERE `school_id` = 1);

-- ----- 1.6 people -----
CALL safe_add_column('people', 'national_id', 'VARCHAR(50) DEFAULT NULL');
CALL safe_add_column('people', 'passport_number', 'VARCHAR(50) DEFAULT NULL');
CALL safe_add_column('people', 'nationality', 'VARCHAR(100) DEFAULT NULL');

CALL safe_add_index('people', 'idx_first_name', 'first_name');
CALL safe_add_index('people', 'idx_last_name', 'last_name');
CALL safe_add_index('people', 'idx_email', 'email');

-- ----- 1.7 students -----
CALL safe_add_index('students', 'idx_school_status', 'school_id, status');
CALL safe_add_index('students', 'idx_admission_no', 'admission_no');
CALL safe_add_index('students', 'idx_admission_date', 'admission_date');

-- ----- 1.8 enrollments -----
CALL safe_add_column('enrollments', 'school_id', 'BIGINT NOT NULL DEFAULT 1 AFTER `id`');
CALL safe_add_column('enrollments', 'enrolled_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

CALL safe_add_index('enrollments', 'idx_school_student', 'school_id, student_id');
CALL safe_add_index('enrollments', 'idx_class_year', 'class_id, academic_year_id');
CALL safe_add_index('enrollments', 'idx_status', 'status');

UPDATE `enrollments` SET `school_id` = 1 WHERE `school_id` = 0;

-- ----- 1.9 student_attendance -----
CALL safe_add_column('student_attendance', 'school_id', 'BIGINT NOT NULL DEFAULT 1 AFTER `id`');
CALL safe_add_column('student_attendance', 'class_id', 'BIGINT DEFAULT NULL');
CALL safe_add_column('student_attendance', 'time_in', 'TIME DEFAULT NULL');
CALL safe_add_column('student_attendance', 'time_out', 'TIME DEFAULT NULL');
CALL safe_add_column('student_attendance', 'method', "VARCHAR(20) DEFAULT 'manual'");
CALL safe_add_column('student_attendance', 'marked_by', 'BIGINT DEFAULT NULL');
CALL safe_add_column('student_attendance', 'marked_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
CALL safe_add_column('student_attendance', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

CALL safe_add_index('student_attendance', 'idx_school_date', 'school_id, date');
CALL safe_add_index('student_attendance', 'idx_status', 'status');
CALL safe_add_index('student_attendance', 'idx_marked_by', 'marked_by');
CALL safe_add_unique('student_attendance', 'unique_student_date', 'student_id, date');

-- ----- 1.10 results -----
CALL safe_add_column('results', 'school_id', 'BIGINT NOT NULL DEFAULT 1 AFTER `id`');
CALL safe_add_column('results', 'subject_id', 'BIGINT DEFAULT NULL');
CALL safe_add_column('results', 'academic_year_id', 'BIGINT DEFAULT NULL');
CALL safe_add_column('results', 'term_id', 'BIGINT DEFAULT NULL');
CALL safe_add_column('results', 'total_marks', 'DECIMAL(10,2) DEFAULT 0');
CALL safe_add_column('results', 'percentage', 'DECIMAL(5,2) DEFAULT 0');
CALL safe_add_column('results', 'comment', 'TEXT DEFAULT NULL');
CALL safe_add_column('results', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
CALL safe_add_column('results', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL safe_add_column('results', 'deleted_at', 'TIMESTAMP NULL DEFAULT NULL');

CALL safe_add_index('results', 'idx_school_student', 'school_id, student_id');
CALL safe_add_index('results', 'idx_academic_year', 'academic_year_id');
CALL safe_add_index('results', 'idx_term_id', 'term_id');

-- ----- 1.11 promotion_criteria -----
CALL safe_add_column('promotion_criteria', 'academic_year_id', 'BIGINT DEFAULT NULL');
CALL safe_add_column('promotion_criteria', 'from_class_id', 'BIGINT DEFAULT NULL');
CALL safe_add_column('promotion_criteria', 'to_class_id', 'BIGINT DEFAULT NULL');
CALL safe_add_column('promotion_criteria', 'minimum_total_marks', 'DECIMAL(10,2) DEFAULT NULL');
CALL safe_add_column('promotion_criteria', 'minimum_average_marks', 'DECIMAL(10,2) DEFAULT NULL');
CALL safe_add_column('promotion_criteria', 'minimum_subjects_passed', 'INT DEFAULT NULL');
CALL safe_add_column('promotion_criteria', 'attendance_percentage', 'DECIMAL(5,2) DEFAULT 75.00');

-- ----- 2.12 roles (add new columns + unique constraint) -----
CALL safe_add_column('roles', 'slug', 'VARCHAR(100) DEFAULT NULL');
CALL safe_add_column('roles', 'is_system_role', 'BOOLEAN DEFAULT FALSE');
CALL safe_add_column('roles', 'is_super_admin', 'BOOLEAN DEFAULT FALSE');
CALL safe_add_column('roles', 'hierarchy_level', 'INT DEFAULT 0');
CALL safe_add_column('roles', 'is_active', 'BOOLEAN DEFAULT TRUE');
CALL safe_add_column('roles', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
CALL safe_add_column('roles', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL safe_add_unique('roles', 'unique_school_slug', 'school_id, slug');

-- ----- 2.13 permissions (add new columns + unique constraint) -----
CALL safe_add_column('permissions', 'name', 'VARCHAR(150) DEFAULT NULL');
CALL safe_add_column('permissions', 'category', "VARCHAR(100) DEFAULT 'general'");
CALL safe_add_column('permissions', 'is_active', 'BOOLEAN DEFAULT TRUE');
CALL safe_add_column('permissions', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
CALL safe_add_column('permissions', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL safe_add_unique('permissions', 'unique_code', 'code');

-- ----- 2.14 role_permissions -----
CALL safe_add_column('role_permissions', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
CALL safe_add_unique('role_permissions', 'unique_role_perm', 'role_id, permission_id');


-- ============================================
-- PHASE 2: CREATE MISSING TABLES
-- ============================================

-- ----- 2.1 terms -----
CREATE TABLE IF NOT EXISTS `terms` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `school_id` BIGINT NOT NULL DEFAULT 1,
  `academic_year_id` BIGINT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `start_date` DATE DEFAULT NULL,
  `end_date` DATE DEFAULT NULL,
  `status` ENUM('draft','active','closed') DEFAULT 'draft',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  
  INDEX `idx_school_id` (`school_id`),
  INDEX `idx_academic_year` (`academic_year_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Terms within academic years';

-- ----- 2.2 security_settings -----
CREATE TABLE IF NOT EXISTS `security_settings` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `school_id` BIGINT DEFAULT NULL,
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT,
  `data_type` ENUM('string','integer','boolean','json') DEFAULT 'string',
  `description` TEXT,
  `is_editable` BOOLEAN DEFAULT TRUE,
  `updated_by` BIGINT DEFAULT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY `unique_school_setting` (`school_id`, `setting_key`),
  INDEX `idx_school_id` (`school_id`),
  INDEX `idx_setting_key` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Security configuration per school';

-- ----- 2.3 users -----
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `school_id` BIGINT DEFAULT NULL,
  `person_id` BIGINT DEFAULT NULL,
  `first_name` VARCHAR(100) DEFAULT NULL,
  `last_name` VARCHAR(100) DEFAULT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `username` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(30) DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(200) DEFAULT 'teacher',
  `status` ENUM('active','inactive','pending','suspended','locked') DEFAULT 'active',
  `is_active` BOOLEAN DEFAULT TRUE,
  `is_verified` BOOLEAN DEFAULT FALSE,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  `login_attempts` INT DEFAULT 0,
  `failed_login_attempts` INT DEFAULT 0,
  `locked_until` TIMESTAMP NULL DEFAULT NULL,
  `two_factor_enabled` BOOLEAN DEFAULT FALSE,
  `two_factor_secret` VARCHAR(32) DEFAULT NULL,
  `biometric_enabled` BOOLEAN DEFAULT FALSE,
  `biometric_key` TEXT DEFAULT NULL,
  `passcode_hash` TEXT DEFAULT NULL,
  `password_reset_token` VARCHAR(64) DEFAULT NULL,
  `password_reset_expires` TIMESTAMP NULL DEFAULT NULL,
  `email_verified` BOOLEAN DEFAULT FALSE,
  `email_verification_token` VARCHAR(64) DEFAULT NULL,
  `profile_photo` VARCHAR(255) DEFAULT NULL,
  `preferences` JSON DEFAULT NULL,
  `last_activity` TIMESTAMP NULL DEFAULT NULL,
  `created_by` BIGINT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  
  UNIQUE KEY `idx_email` (`email`),
  INDEX `idx_school_id` (`school_id`),
  INDEX `idx_person_id` (`person_id`),
  INDEX `idx_username` (`username`),
  INDEX `idx_status` (`status`),
  INDEX `idx_role` (`role`),
  INDEX `idx_school_status` (`school_id`, `status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User authentication accounts';

-- ----- 2.4 sessions -----
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `school_id` BIGINT DEFAULT NULL,
  `session_token` VARCHAR(255) NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` TEXT DEFAULT NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY `unique_session_token` (`session_token`),
  INDEX `idx_sessions_user` (`user_id`),
  INDEX `idx_sessions_school` (`school_id`),
  INDEX `idx_sessions_token` (`session_token`),
  INDEX `idx_sessions_expires` (`expires_at`),
  INDEX `idx_sessions_active` (`is_active`),
  INDEX `idx_sessions_user_school` (`user_id`, `school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User authentication sessions';

-- ----- 2.5 user_roles -----
CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `role_id` BIGINT NOT NULL,
  `school_id` BIGINT NOT NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `assigned_by` BIGINT DEFAULT NULL,
  `assigned_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY `unique_user_role` (`user_id`, `role_id`, `school_id`),
  INDEX `idx_user_roles_user` (`user_id`),
  INDEX `idx_user_roles_role` (`role_id`),
  INDEX `idx_user_roles_school` (`school_id`),
  INDEX `idx_user_roles_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User-role assignments for RBAC';

-- ----- 2.6 audit_logs (auth system version) -----
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `school_id` BIGINT NOT NULL,
  `user_id` BIGINT DEFAULT NULL,
  `action_type` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(100) NOT NULL,
  `entity_id` BIGINT DEFAULT NULL,
  `old_value` JSON DEFAULT NULL,
  `new_value` JSON DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX `idx_audit_school` (`school_id`),
  INDEX `idx_audit_user` (`user_id`),
  INDEX `idx_audit_action` (`action_type`),
  INDEX `idx_audit_entity` (`entity_type`, `entity_id`),
  INDEX `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='System audit trail for auth actions';


-- ============================================
-- PHASE 3: INSERT DEFAULT SYSTEM DATA
-- ============================================

-- ----- 3.1 Default roles -----
INSERT IGNORE INTO `roles` (`school_id`, `name`, `slug`, `description`, `is_system_role`, `is_super_admin`, `hierarchy_level`, `is_active`) VALUES
(1, 'Super Admin', 'super_admin', 'Full system access for school owners', TRUE, TRUE, 100, TRUE),
(1, 'Admin', 'admin', 'Administrative access with limited system settings', TRUE, FALSE, 90, TRUE),
(1, 'Teacher', 'teacher', 'Teaching staff access', TRUE, FALSE, 50, TRUE),
(1, 'Accountant', 'accountant', 'Financial management access', TRUE, FALSE, 60, TRUE),
(1, 'Staff', 'staff_role', 'General staff with basic access', TRUE, FALSE, 40, TRUE);

-- ----- 3.2 Default permissions -----
INSERT IGNORE INTO `permissions` (`code`, `name`, `description`, `category`) VALUES
('manage_users', 'Manage Users', 'Create, edit, delete, and activate users', 'users'),
('view_users', 'View Users', 'View user list and details', 'users'),
('activate_users', 'Activate Users', 'Approve and activate new user accounts', 'users'),
('manage_roles', 'Manage Roles', 'Create, edit, and delete roles', 'roles'),
('assign_roles', 'Assign Roles', 'Assign roles to users', 'roles'),
('view_roles', 'View Roles', 'View role list and permissions', 'roles'),
('manage_students', 'Manage Students', 'Full student management access', 'students'),
('view_students', 'View Students', 'View student list and details', 'students'),
('edit_students', 'Edit Students', 'Edit student information', 'students'),
('delete_students', 'Delete Students', 'Delete student records', 'students'),
('admit_students', 'Admit Students', 'Add new student admissions', 'students'),
('manage_classes', 'Manage Classes', 'Create and manage classes', 'academics'),
('view_classes', 'View Classes', 'View class information', 'academics'),
('assign_class_teachers', 'Assign Class Teachers', 'Assign teachers to classes', 'academics'),
('manage_attendance', 'Manage Attendance', 'Full attendance management', 'attendance'),
('take_attendance', 'Take Attendance', 'Record student attendance', 'attendance'),
('view_attendance', 'View Attendance', 'View attendance records', 'attendance'),
('edit_attendance', 'Edit Attendance', 'Edit attendance records', 'attendance'),
('manage_finances', 'Manage Finances', 'Full financial management', 'finance'),
('view_finances', 'View Finances', 'View financial records', 'finance'),
('collect_fees', 'Collect Fees', 'Record fee payments', 'finance'),
('generate_invoices', 'Generate Invoices', 'Create fee invoices', 'finance'),
('view_reports', 'View Reports', 'Access system reports', 'reports'),
('export_reports', 'Export Reports', 'Export reports to PDF/Excel', 'reports'),
('manage_school_settings', 'Manage School Settings', 'Configure school settings', 'settings'),
('view_audit_logs', 'View Audit Logs', 'Access system audit logs', 'settings'),
('manage_staff', 'Manage Staff', 'Full staff management', 'staff'),
('view_staff', 'View Staff', 'View staff list and details', 'staff');


-- ============================================
-- PHASE 4: CREATE SUPER ADMIN ACCOUNT
-- ============================================

-- Create person record for super admin
INSERT INTO `people` (`school_id`, `first_name`, `last_name`, `gender`, `email`, `created_at`)
SELECT 1, 'Super', 'Admin', 'male', 'superadmin@albayan.com', NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `people` WHERE `email` = 'superadmin@albayan.com');

-- Create user account (password: superadmin, bcrypt 12 rounds)
INSERT INTO `users` (`school_id`, `person_id`, `first_name`, `last_name`, `email`, `username`, `password_hash`, `role`, `status`, `is_active`, `is_verified`, `email_verified`, `created_at`)
SELECT 
  1, 
  p.id, 
  'Super', 
  'Admin', 
  'superadmin@albayan.com', 
  'superadmin@albayan.com',
  '$2b$12$wYoIgJLQrPYI91KppRlYxOwcOaQnJ0/UD8yAz/t/gUWKnVjMPs.ti',
  'admin',
  'active',
  TRUE,
  TRUE,
  TRUE,
  NOW()
FROM `people` p
WHERE p.email = 'superadmin@albayan.com'
  AND NOT EXISTS (SELECT 1 FROM `users` WHERE `email` = 'superadmin@albayan.com');

-- Assign Super Admin role
INSERT IGNORE INTO `user_roles` (`user_id`, `role_id`, `school_id`, `is_active`)
SELECT 
  u.id,
  r.id,
  1,
  TRUE
FROM `users` u
JOIN `roles` r ON r.name = 'Super Admin' AND r.school_id = 1
WHERE u.email = 'superadmin@albayan.com';

-- Assign all permissions to Super Admin role
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.name = 'Super Admin' AND r.school_id = 1;


-- ============================================
-- PHASE 5: DATA INTEGRITY FIXES
-- ============================================

UPDATE `students` SET `school_id` = 1 WHERE `school_id` IS NULL;

INSERT INTO `schools` (`id`, `name`, `legal_name`, `short_code`, `email`, `phone`, `currency`, `address`)
SELECT 1, 'Albayan Quran Memorization Centre Nursery and Primary School', 'Albayan Quran Memorization Centre Nursery and Primary School', 'ALBAYAN', 'info@albayan.ac.ug', '+256 700 123 456', 'UGX', 'Kampala, Uganda'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `schools` WHERE `id` = 1);


-- ============================================
-- PHASE 6: REPORTING VIEW
-- ============================================

DROP VIEW IF EXISTS `student_attendance_view`;
CREATE VIEW `student_attendance_view` AS
SELECT 
  sa.id,
  sa.student_id,
  sa.school_id,
  sa.class_id,
  sa.date,
  sa.status,
  sa.notes,
  sa.time_in,
  sa.time_out,
  sa.method,
  p.first_name,
  p.last_name,
  s.admission_no,
  c.name as class_name
FROM `student_attendance` sa
JOIN `students` s ON sa.student_id = s.id
JOIN `people` p ON s.person_id = p.id
LEFT JOIN `classes` c ON sa.class_id = c.id;


-- ============================================
-- CLEANUP
-- ============================================
DROP PROCEDURE IF EXISTS safe_add_column;
DROP PROCEDURE IF EXISTS safe_add_index;
DROP PROCEDURE IF EXISTS safe_add_unique;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
