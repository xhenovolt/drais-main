-- ============================================
-- DRAIS V1 Session-Based Authentication Migration
-- Version: 1.0.0
-- Date: March 2026
-- Description: Ensures proper session-based auth tables exist
-- ============================================

-- This migration consolidates the session-based authentication tables
-- It handles both fresh installs and upgrades from JWT-based auth

-- ============================================
-- 1. SESSIONS TABLE (User authentication sessions)
-- ============================================

-- Drop the old user_sessions if it exists and recreate with proper schema
DROP TABLE IF EXISTS sessions;

CREATE TABLE sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  school_id BIGINT DEFAULT NULL,
  session_token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_session_token (session_token),
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_school (school_id),
  INDEX idx_sessions_token (session_token),
  INDEX idx_sessions_expires (expires_at),
  INDEX idx_sessions_active (is_active),
  INDEX idx_sessions_user_school (user_id, school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='User authentication sessions for secure cookie-based auth';

-- ============================================
-- 2. ENSURE SCHOOLS TABLE HAS SETUP FIELDS
-- ============================================

-- Add setup_complete field if not exists (for school setup lock flow)
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS setup_complete BOOLEAN DEFAULT FALSE AFTER status,
  ADD COLUMN IF NOT EXISTS setup_started_at TIMESTAMP NULL DEFAULT NULL AFTER setup_complete,
  ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMP NULL DEFAULT NULL AFTER setup_started_at,
  ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'trial' AFTER setup_completed_at,
  ADD COLUMN IF NOT EXISTS subscription_status ENUM('active','inactive','trial','suspended') DEFAULT 'trial' AFTER subscription_plan,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP NULL DEFAULT NULL AFTER subscription_status,
  ADD COLUMN IF NOT EXISTS school_type VARCHAR(100) DEFAULT NULL AFTER legal_name;

-- ============================================
-- 3. ENSURE USERS TABLE HAS ALL REQUIRED FIELDS
-- ============================================

-- Make sure users table has display_name capability
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(200) AS (CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) STORED AFTER last_name,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE AFTER status,
  MODIFY COLUMN IF EXISTS status ENUM('active','inactive','pending','suspended','locked') DEFAULT 'pending';

-- ============================================
-- 4. ENSURE ROLES TABLE EXISTS WITH PROPER STRUCTURE
-- ============================================

-- Add is_super_admin flag if not exists
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE AFTER is_system_role,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE AFTER is_super_admin;

-- ============================================
-- 5. USER ROLES JUNCTION TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS user_roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_by BIGINT DEFAULT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_user_role (user_id, role_id, school_id),
  INDEX idx_user_roles_user (user_id),
  INDEX idx_user_roles_role (role_id),
  INDEX idx_user_roles_school (school_id),
  INDEX idx_user_roles_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='User-role assignments for RBAC';

-- ============================================
-- 6. PERMISSIONS TABLE 
-- ============================================

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT DEFAULT NULL,
  category VARCHAR(100) DEFAULT 'general',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_permissions_code (code),
  INDEX idx_permissions_category (category),
  INDEX idx_permissions_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='System permission definitions';

-- ============================================
-- 7. ROLE PERMISSIONS JUNCTION TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  role_id BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_role_permission (role_id, permission_id),
  INDEX idx_role_permissions_role (role_id),
  INDEX idx_role_permissions_permission (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Role-permission assignments';

-- ============================================
-- 8. INSERT DEFAULT PERMISSIONS
-- ============================================

INSERT IGNORE INTO permissions (code, name, description, category) VALUES
-- User Management
('manage_users', 'Manage Users', 'Create, edit, delete, and activate users', 'users'),
('view_users', 'View Users', 'View user list and details', 'users'),
('activate_users', 'Activate Users', 'Approve and activate new user accounts', 'users'),

-- Role Management
('manage_roles', 'Manage Roles', 'Create, edit, and delete roles', 'roles'),
('assign_roles', 'Assign Roles', 'Assign roles to users', 'roles'),
('view_roles', 'View Roles', 'View role list and permissions', 'roles'),

-- Student Management
('manage_students', 'Manage Students', 'Full student management access', 'students'),
('view_students', 'View Students', 'View student list and details', 'students'),
('edit_students', 'Edit Students', 'Edit student information', 'students'),
('delete_students', 'Delete Students', 'Delete student records', 'students'),
('admit_students', 'Admit Students', 'Add new student admissions', 'students'),

-- Class Management
('manage_classes', 'Manage Classes', 'Create and manage classes', 'academics'),
('view_classes', 'View Classes', 'View class information', 'academics'),
('assign_class_teachers', 'Assign Class Teachers', 'Assign teachers to classes', 'academics'),

-- Attendance
('manage_attendance', 'Manage Attendance', 'Full attendance management', 'attendance'),
('take_attendance', 'Take Attendance', 'Record student attendance', 'attendance'),
('view_attendance', 'View Attendance', 'View attendance records', 'attendance'),
('edit_attendance', 'Edit Attendance', 'Edit attendance records', 'attendance'),

-- Finance
('manage_finances', 'Manage Finances', 'Full financial management', 'finance'),
('view_finances', 'View Finances', 'View financial records', 'finance'),
('collect_fees', 'Collect Fees', 'Record fee payments', 'finance'),
('generate_invoices', 'Generate Invoices', 'Create fee invoices', 'finance'),

-- Reports
('view_reports', 'View Reports', 'Access system reports', 'reports'),
('export_reports', 'Export Reports', 'Export reports to PDF/Excel', 'reports'),

-- Settings
('manage_school_settings', 'Manage School Settings', 'Configure school settings', 'settings'),
('view_audit_logs', 'View Audit Logs', 'Access system audit logs', 'settings'),

-- Staff Management
('manage_staff', 'Manage Staff', 'Full staff management', 'staff'),
('view_staff', 'View Staff', 'View staff list and details', 'staff');

-- ============================================
-- 9. INSERT DEFAULT SYSTEM ROLES
-- ============================================

-- Note: school_id = NULL means system-wide templates
-- When a school is created, these are copied with the school's ID

INSERT IGNORE INTO roles (school_id, name, slug, description, is_system_role, is_super_admin, hierarchy_level, is_active) VALUES
(NULL, 'Super Admin', 'super_admin', 'Full system access for school owners', TRUE, TRUE, 100, TRUE),
(NULL, 'Admin', 'admin', 'Administrative access with limited system settings', TRUE, FALSE, 90, TRUE),
(NULL, 'Teacher', 'teacher', 'Teaching staff access', TRUE, FALSE, 50, TRUE),
(NULL, 'Accountant', 'accountant', 'Financial management access', TRUE, FALSE, 60, TRUE),
(NULL, 'Staff', 'staff', 'General staff with basic access', TRUE, FALSE, 40, TRUE);

-- ============================================
-- 10. AUDIT LOGS TABLE (if not exists)
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  user_id BIGINT DEFAULT NULL,
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT DEFAULT NULL,
  old_value JSON DEFAULT NULL,
  new_value JSON DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_audit_school (school_id),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_action (action_type),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='System audit trail for critical actions';

-- ============================================
-- DONE
-- ============================================
