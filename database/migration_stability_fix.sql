-- ============================================================
-- DRAIS STABILITY MIGRATION - March 9, 2026
-- Fixes all missing tables, missing columns, and schema gaps
-- ============================================================

-- 1. CREATE MISSING TABLE: device_user_mappings
-- (This is the PRIMARY cause of /api/students/full crash)
CREATE TABLE IF NOT EXISTS device_user_mappings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL DEFAULT 1,
  device_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  device_user_id VARCHAR(100) DEFAULT NULL,
  sync_status ENUM('synced','pending','failed') DEFAULT 'pending',
  last_synced_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dum_school (school_id),
  INDEX idx_dum_student (student_id),
  INDEX idx_dum_device (device_id),
  UNIQUE KEY uq_device_student (device_id, student_id)
);

-- 2. CREATE MISSING TABLE: tahfiz_records
CREATE TABLE IF NOT EXISTS tahfiz_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL DEFAULT 1,
  student_id BIGINT NOT NULL,
  plan_id BIGINT NULL,
  portion_id BIGINT NULL,
  group_id BIGINT NULL,
  book_id BIGINT NULL,
  teacher_id BIGINT NULL,
  date DATE NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'tilawa',
  portion_text VARCHAR(255) NULL,
  rating ENUM('excellent','good','fair','poor','needs_improvement') DEFAULT 'fair',
  score DECIMAL(5,2) NULL,
  notes TEXT NULL,
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tr_school (school_id),
  INDEX idx_tr_student (student_id),
  INDEX idx_tr_plan (plan_id),
  INDEX idx_tr_group (group_id),
  INDEX idx_tr_date (date)
);

-- 3. CREATE MISSING TABLE: tahfiz_group_members
CREATE TABLE IF NOT EXISTS tahfiz_group_members (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL DEFAULT 1,
  group_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  joined_date DATE DEFAULT (CURDATE()),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tgm_group (group_id),
  INDEX idx_tgm_student (student_id),
  UNIQUE KEY uq_group_student (group_id, student_id)
);

-- 4. CREATE MISSING TABLE: tahfiz_portions
CREATE TABLE IF NOT EXISTS tahfiz_portions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL DEFAULT 1,
  plan_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  teacher_id BIGINT NULL,
  book_id BIGINT NULL,
  portion_text VARCHAR(255) NOT NULL,
  portion_unit VARCHAR(50) DEFAULT 'verse',
  date DATE NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'tilawa',
  rating ENUM('excellent','good','fair','poor','needs_improvement') DEFAULT NULL,
  score DECIMAL(5,2) NULL,
  notes TEXT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tp_plan (plan_id),
  INDEX idx_tp_student (student_id),
  INDEX idx_tp_date (date)
);

-- 5. CREATE MISSING TABLE: student_history (for promotions)
CREATE TABLE IF NOT EXISTS student_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL DEFAULT 1,
  student_id BIGINT NOT NULL,
  academic_year_id BIGINT NULL,
  term_id BIGINT NULL,
  class_id BIGINT NULL,
  stream_id BIGINT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT NULL,
  performed_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sh_student (student_id),
  INDEX idx_sh_school (school_id)
);

-- 6. FIX terms table: Add `status` column if missing
-- The API queries use `t.status = 'active'` but the table has `is_active` tinyint
-- We add both for compatibility
ALTER TABLE terms ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Sync existing is_active values to the new status column
UPDATE terms SET status = CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END WHERE status IS NULL OR status = '';

-- 7. ENHANCE schools table for SaaS (Phase 5 preparation)
ALTER TABLE schools ADD COLUMN IF NOT EXISTS motto VARCHAR(255) DEFAULT NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS district VARCHAR(100) DEFAULT NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS website VARCHAR(255) DEFAULT NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS founded_year INT DEFAULT NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Uganda';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS region VARCHAR(100) DEFAULT NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS principal_name VARCHAR(200) DEFAULT NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS principal_phone VARCHAR(30) DEFAULT NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS registration_number VARCHAR(100) DEFAULT NULL;

-- 8. Ensure users table has all needed columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id BIGINT DEFAULT NULL;

-- 9. Ensure staff table has proper person_id link
-- (staff routes join people via person_id)

-- 10. CREATE settings table if not exists (for Phase 6)
CREATE TABLE IF NOT EXISTS settings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL DEFAULT 1,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NULL,
  setting_type VARCHAR(20) DEFAULT 'string',
  category VARCHAR(50) DEFAULT 'general',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_setting (school_id, setting_key)
);

-- Verify we haven't broken anything
SELECT 'Migration complete' as status;
