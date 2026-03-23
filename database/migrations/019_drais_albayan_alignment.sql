-- ============================================================================
-- DRAIS V1 — Phase 4: drais_albayan Alignment
-- Migration 019: Add all columns/tables present in drais_albayan but missing
--                from drais (production). Generated from live schema diff.
-- Date: 2026-03-21
-- Safe to run multiple times (all statements use IF NOT EXISTS)
-- Run AFTER 018_schema_stabilization.sql
-- ============================================================================

-- ============================================================================
-- BLOCK 1: audit_log — add school_id for tenant isolation
-- ============================================================================

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS school_id INT NULL COMMENT 'tenant scoping';

CREATE INDEX IF NOT EXISTS idx_audit_log_school_id ON audit_log(school_id);

-- ============================================================================
-- BLOCK 2: class_results — add academic_year_id for year-level queries
-- ============================================================================

ALTER TABLE class_results
  ADD COLUMN IF NOT EXISTS academic_year_id INT NULL;

CREATE INDEX IF NOT EXISTS idx_class_results_year ON class_results(academic_year_id);

-- ============================================================================
-- BLOCK 3: classes — add capacity, code, level, soft-delete
-- ============================================================================

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS capacity   INT NULL          COMMENT 'max student seats',
  ADD COLUMN IF NOT EXISTS code       VARCHAR(100) NULL COMMENT 'short class code e.g. GR1A',
  ADD COLUMN IF NOT EXISTS level      INT NULL          COMMENT 'grade/year level number',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_classes_deleted_at    ON classes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_classes_school_level  ON classes(school_id, level);

-- ============================================================================
-- BLOCK 4: enrollments — add enrolled_at timestamp and school_id
-- ============================================================================

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMP NULL   COMMENT 'when student was enrolled',
  ADD COLUMN IF NOT EXISTS school_id   INT NULL         COMMENT 'tenant scoping';

CREATE INDEX IF NOT EXISTS idx_enrollments_school_id ON enrollments(school_id);
-- student+school compound index (school_id must exist first — added above)
CREATE INDEX IF NOT EXISTS idx_enroll_student ON enrollments(student_id, school_id);

-- ============================================================================
-- BLOCK 5: people — add identity document columns
-- ============================================================================

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS national_id     VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS nationality     VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS passport_number VARCHAR(100) NULL;

CREATE INDEX IF NOT EXISTS idx_people_national_id ON people(national_id);

-- ============================================================================
-- BLOCK 6: permissions — add name, category, timestamps
-- NOTE: 018 creates this table with these columns, but since the table already
-- exists in drais the CREATE TABLE IF NOT EXISTS is a no-op, so we need
-- explicit ADD COLUMN statements.
-- ============================================================================

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS name       VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS category   VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ============================================================================
-- BLOCK 7: role_permissions — add created_at timestamp
-- (same no-op CREATE TABLE IF NOT EXISTS issue as permissions above)
-- ============================================================================

ALTER TABLE role_permissions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

-- ============================================================================
-- BLOCK 8: roles — add hierarchy_level + timestamps
-- (is_system_role, is_super_admin, is_active are added in migration 018)
-- ============================================================================

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS hierarchy_level INT NULL DEFAULT 0 COMMENT '0=lowest, higher=more privileged',
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- ============================================================================
-- BLOCK 9: user_roles — add school_id for tenant-scoped role assignments
-- ============================================================================

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS school_id INT NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_school_id ON user_roles(school_id);

-- ============================================================================
-- BLOCK 10: users — add identity, security, preference, and status columns
-- ============================================================================

ALTER TABLE users
  -- Login identity
  ADD COLUMN IF NOT EXISTS username                 VARCHAR(255) NULL COMMENT 'optional username alias',
  -- Link to people record
  ADD COLUMN IF NOT EXISTS person_id                INT NULL          COMMENT 'FK to people table',
  -- Account status
  ADD COLUMN IF NOT EXISTS status                   VARCHAR(50)  NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS role                     VARCHAR(50)  NULL COMMENT 'denormalized convenience role label',
  -- Profile
  ADD COLUMN IF NOT EXISTS profile_photo            VARCHAR(500) NULL,
  -- Email verification
  ADD COLUMN IF NOT EXISTS email_verified           TINYINT      NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255) NULL,
  -- Brute-force / activity tracking
  ADD COLUMN IF NOT EXISTS login_attempts           INT          NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity            TIMESTAMP    NULL,
  -- Preferences
  ADD COLUMN IF NOT EXISTS preferences              JSON         NULL,
  -- Passcode (PIN / device login)
  ADD COLUMN IF NOT EXISTS passcode_hash            VARCHAR(255) NULL,
  -- 2FA
  ADD COLUMN IF NOT EXISTS two_factor_enabled       TINYINT      NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS two_factor_secret        VARCHAR(255) NULL,
  -- Biometric
  ADD COLUMN IF NOT EXISTS biometric_enabled        TINYINT      NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS biometric_key            TEXT         NULL;

CREATE INDEX IF NOT EXISTS idx_users_username    ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_person_id   ON users(person_id);
CREATE INDEX IF NOT EXISTS idx_users_status      ON users(status);

-- ============================================================================
-- BLOCK 11: security_settings — new table (only in drais_albayan)
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_settings (
  id            BIGINT NOT NULL AUTO_INCREMENT,
  school_id     BIGINT          DEFAULT NULL,
  setting_key   VARCHAR(100)    NOT NULL,
  setting_value TEXT            DEFAULT NULL,
  data_type     ENUM('string','integer','boolean','json') DEFAULT 'string',
  description   TEXT            DEFAULT NULL,
  is_editable   TINYINT(1)      DEFAULT 1,
  updated_by    BIGINT          DEFAULT NULL,
  updated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY unique_school_setting (school_id, setting_key),
  KEY idx_ss_school_id  (school_id),
  KEY idx_ss_setting_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Per-school security configuration key-value store';

-- ============================================================================
-- BLOCK 12: Data backfill — set sensible defaults for new NOT NULL-adjacent cols
-- ============================================================================

-- Stamp enrolled_at for existing enrollments that don't have it
UPDATE enrollments
SET    enrolled_at = created_at
WHERE  enrolled_at IS NULL
  AND  created_at  IS NOT NULL;

-- Back-fill school_id on enrollments from the student record
UPDATE enrollments e
  JOIN students    s ON s.id = e.student_id
SET    e.school_id = s.school_id
WHERE  e.school_id IS NULL
  AND  s.school_id IS NOT NULL;

-- Set users.status = 'active' for all existing users
UPDATE users SET status = 'active' WHERE status IS NULL;

-- ============================================================================
-- END OF MIGRATION 019
-- ============================================================================
