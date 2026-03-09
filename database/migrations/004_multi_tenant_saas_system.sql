-- ============================================
-- DRAIS V1 Multi-Tenant SaaS System Schema
-- ============================================
-- This migration sets up the complete multi-tenant 
-- authentication, authorization, and RBAC system

-- ============================================
-- 1. SCHOOLS (Tenants)
-- ============================================
CREATE TABLE IF NOT EXISTS schools (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  logo_url VARCHAR(500),
  website VARCHAR(255),
  
  -- School Configuration
  curriculum VARCHAR(100) DEFAULT 'Kenya',
  country VARCHAR(100) DEFAULT 'Kenya',
  timezone VARCHAR(100) DEFAULT 'Africa/Nairobi',
  
  -- Setup Status
  setup_complete BOOLEAN DEFAULT FALSE,
  setup_started_at TIMESTAMP NULL,
  setup_completed_at TIMESTAMP NULL,
  
  -- School Status
  status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
  
  -- Subscription
  subscription_plan VARCHAR(50) DEFAULT 'standard',
  subscription_status ENUM('active', 'inactive', 'trial') DEFAULT 'trial',
  trial_ends_at TIMESTAMP NULL,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  
  UNIQUE KEY uq_school_email (email),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. ROLES
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Role Type
  role_type ENUM('system', 'custom') DEFAULT 'custom',
  
  -- Special designation
  is_super_admin BOOLEAN DEFAULT FALSE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  UNIQUE KEY uq_school_role (school_id, name),
  INDEX idx_school_id (school_id),
  INDEX idx_role_type (role_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. PERMISSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Permission Category
  category VARCHAR(50) NOT NULL, -- e.g., 'user_management', 'academics', 'finance', 'attendance'
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_category (category),
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. ROLE PERMISSIONS (Junction Table)
-- ============================================
CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  role_id BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_role_permission (role_id, permission_id),
  INDEX idx_role_id (role_id),
  INDEX idx_permission_id (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. USERS (Multi-Tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  
  -- User Info
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  avatar_url VARCHAR(500),
  
  -- Authentication
  password_hash VARCHAR(255) NOT NULL,
  password_reset_token VARCHAR(255) NULL,
  password_reset_expires TIMESTAMP NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT FALSE, -- First user auto-activated, others need activation
  is_verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(255) NULL,
  verification_expires TIMESTAMP NULL,
  
  -- Last Activity
  last_login_at TIMESTAMP NULL,
  last_password_change TIMESTAMP NULL,
  
  -- Account Security
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP NULL,
  
  -- Audit
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_school_email (school_id, email),
  INDEX idx_school_id (school_id),
  INDEX idx_email (email),
  INDEX idx_is_active (is_active),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. USER ROLES (User can have multiple roles)
-- ============================================
CREATE TABLE IF NOT EXISTS user_roles (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  assigned_by BIGINT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_user_role (user_id, role_id),
  INDEX idx_user_id (user_id),
  INDEX idx_role_id (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 7. AUDIT LOG (Track sensitive actions)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  
  -- Action Info
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL, -- e.g., 'user_login', 'permission_change', 'role_assignment'
  entity_id BIGINT NULL,
  
  -- Details
  old_values JSON NULL,
  new_values JSON NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  status VARCHAR(20) DEFAULT 'success', -- success, failure
  error_message TEXT NULL,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_school_id (school_id),
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8. UPDATE EXISTING TABLES FOR MULTI-TENANCY
-- ============================================
-- Add school_id to existing tables (if not already present)

ALTER TABLE students ADD COLUMN school_id BIGINT NULL AFTER id, ADD FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE, ADD INDEX idx_school_id (school_id);
ALTER TABLE classes ADD COLUMN school_id BIGINT NULL AFTER id, ADD FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE, ADD INDEX idx_school_id (school_id);
ALTER TABLE staff ADD COLUMN school_id BIGINT NULL AFTER id, ADD FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE, ADD INDEX idx_school_id (school_id);
ALTER TABLE subjects ADD COLUMN school_id BIGINT NULL AFTER id, ADD FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE, ADD INDEX idx_school_id (school_id);
ALTER TABLE exams ADD COLUMN school_id BIGINT NULL AFTER id, ADD FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE, ADD INDEX idx_school_id (school_id);
ALTER TABLE attendance_logs ADD COLUMN school_id BIGINT NULL AFTER id, ADD FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE, ADD INDEX idx_school_id (school_id);

-- ============================================
-- 9. DEFAULT SYSTEM PERMISSIONS
-- ============================================
INSERT IGNORE INTO permissions (code, name, description, category) VALUES
-- User Management
('user.create', 'Create Users', 'Create new users in the school', 'user_management'),
('user.read', 'View Users', 'View user information', 'user_management'),
('user.update', 'Edit Users', 'Update user information and roles', 'user_management'),
('user.delete', 'Delete Users', 'Delete user accounts', 'user_management'),
('user.activate', 'Activate/Deactivate Users', 'Activate or deactivate user accounts', 'user_management'),

-- Role Management
('role.create', 'Create Roles', 'Create custom roles', 'role_management'),
('role.read', 'View Roles', 'View role details', 'role_management'),
('role.update', 'Edit Roles', 'Update role properties', 'role_management'),
('role.delete', 'Delete Roles', 'Delete roles', 'role_management'),
('role.permission_manage', 'Manage Permissions', 'Assign/revoke permissions from roles', 'role_management'),

-- School Settings
('school.read', 'View School Info', 'View school information', 'school_settings'),
('school.update', 'Edit School Info', 'Update school settings and information', 'school_settings'),
('school.setup', 'Setup School', 'Complete initial school setup', 'school_settings'),

-- Academics
('academics.classes.manage', 'Manage Classes', 'Create/edit/delete classes', 'academics'),
('academics.subjects.manage', 'Manage Subjects', 'Create/edit/delete subjects', 'academics'),
('academics.students.manage', 'Manage Students', 'Create/edit/delete student records', 'academics'),
('academics.exams.manage', 'Manage Exams', 'Create/edit/delete exams', 'academics'),
('academics.results.view', 'View Results', 'View student results and marks', 'academics'),
('academics.results.enter', 'Enter Results', 'Enter and publish student marks', 'academics'),
('academics.timetable.manage', 'Manage Timetable', 'Create/edit school timetable', 'academics'),

-- Attendance
('attendance.view', 'View Attendance', 'View attendance records', 'attendance'),
('attendance.manage', 'Manage Attendance', 'Create/edit attendance records', 'attendance'),
('attendance.devices.manage', 'Manage Devices', 'Configure biometric devices', 'attendance'),

-- Finance
('finance.view', 'View Financial Data', 'View all financial records', 'finance'),
('finance.fees.manage', 'Manage Fees', 'Create/edit fee structures and payments', 'finance'),
('finance.payments.view', 'View Payments', 'View payment records', 'finance'),
('finance.reports.view', 'View Financial Reports', 'Generate/view financial reports', 'finance'),

-- Reports
('reports.view', 'View Reports', 'View all system reports', 'reports'),
('reports.generate', 'Generate Reports', 'Generate custom reports', 'reports'),

-- Analytics
('analytics.view', 'View Analytics', 'View system analytics and dashboards', 'analytics');

-- ============================================
-- 10. DEFAULT SYSTEM ROLES (per school)
-- ============================================
-- Note: These will be created during school initialization
-- Schema is here for reference

-- SuperAdmin: Full system access
-- Admin: Can manage users, roles, and most school settings
-- Teacher: Can manage classes, attendance, marks
-- Bursar: Can manage fees and financial records
-- Warden: Can manage discipline and student records
-- Receptionist: Can manage visitor logs, student info
-- Staff: Basic access to student/class info
-- Parent: Can view own child's records
