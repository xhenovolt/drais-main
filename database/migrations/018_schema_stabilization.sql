-- ============================================================================
-- DRAIS V1 — Phase 3: Schema Stabilization
-- Migration 018: Close all schema gaps between code and database
-- Date: 2026-03-21
-- Safe to run multiple times (all adds use IF NOT EXISTS)
-- NOTE: No AFTER clauses — TiDB rejects forward-reference AFTER within a
--       single multi-column ALTER TABLE statement.
-- ============================================================================

-- BLOCK 1: schools table
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS setup_complete          BOOLEAN    DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_status     ENUM('active','inactive','trial','expired') DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_plan       VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_type       ENUM('none','trial','monthly','yearly') DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS trial_start_date        TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_end_date          TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_end_date   TIMESTAMP NULL DEFAULT NULL;

-- BLOCK 2: users.role_id
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role_id BIGINT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- BLOCK 3: roles flags
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS is_system_role TINYINT  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN  DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS permissions    JSON     DEFAULT NULL;

-- BLOCK 4: user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  role_id     BIGINT NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  assigned_by BIGINT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_role (user_id, role_id),
  INDEX idx_ur_user_id (user_id),
  INDEX idx_ur_role_id (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BLOCK 5: permissions + role_permissions tables
CREATE TABLE IF NOT EXISTS permissions (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(100) NOT NULL,
  name       VARCHAR(150) DEFAULT NULL,
  module     VARCHAR(100) DEFAULT NULL,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_perm_code (code),
  INDEX idx_perm_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  role_id       BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_role_perm (role_id, permission_id),
  INDEX idx_rp_role_id (role_id),
  INDEX idx_rp_perm_id (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- BLOCK 6: enrollments soft-delete + tracking
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS enrollment_type VARCHAR(50)    DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS enrollment_date DATE           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS joined_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_enroll_deleted ON enrollments(deleted_at);
CREATE INDEX IF NOT EXISTS idx_enroll_term    ON enrollments(term_id);
CREATE INDEX IF NOT EXISTS idx_enroll_year    ON enrollments(academic_year_id);

-- BLOCK 7: academic_years soft-delete
ALTER TABLE academic_years
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

-- BLOCK 8: terms soft-delete
ALTER TABLE terms
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

-- BLOCK 9: Seed default admin role per school (idempotent)
INSERT IGNORE INTO roles (school_id, name, slug, is_system_role, is_super_admin, is_active)
SELECT DISTINCT s.id, 'Administrator', 'admin', TRUE, TRUE, TRUE
FROM schools s
WHERE NOT EXISTS (
  SELECT 1 FROM roles r WHERE r.school_id = s.id AND r.slug = 'admin'
);
