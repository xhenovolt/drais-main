-- DRAIS RBAC Permissions Seeding Migration
-- Date: 2026-03-29
-- Purpose: Seed all permission codes used across API routes and map them to roles
-- This enables the full RBAC permission system to work end-to-end.

-- ═══════════════════════════════════════════════════════════════════
-- 1. SEED PERMISSIONS (idempotent — skips if code already exists)
-- ═══════════════════════════════════════════════════════════════════

INSERT IGNORE INTO permissions (code, name, description, category, is_active) VALUES
-- User management
('user.create',       'Create Users',       'Create new user accounts',                'users',        1),
('user.read',         'View Users',         'View user details and listings',          'users',        1),
('user.update',       'Update Users',       'Update user account details',             'users',        1),
('user.activate',     'Activate Users',     'Activate or deactivate user accounts',    'users',        1),

-- Roles & Permissions
('role.read',         'View Roles',         'View role details',                       'roles',        1),
('roles.read',        'List Roles',         'List all roles',                          'roles',        1),
('roles.manage',      'Manage Roles',       'Create, update, delete roles',            'roles',        1),
('permissions.manage','Manage Permissions', 'Assign/revoke permissions to roles',      'roles',        1),

-- Staff
('staff.read',           'View Staff',           'View staff list and details',         'staff',        1),
('staff.create',         'Create Staff',         'Add new staff members',               'staff',        1),
('staff.update',         'Update Staff',         'Update staff details',                'staff',        1),
('staff.delete',         'Delete Staff',         'Delete or suspend staff',             'staff',        1),
('staff.account.manage', 'Manage Staff Accounts','Create/manage staff user accounts',   'staff',        1),

-- Departments
('departments.read',   'View Departments',   'View department listings',               'departments',  1),
('departments.manage', 'Manage Departments', 'Create, update, delete departments',     'departments',  1),

-- Academics
('academics.classes.manage',    'Manage Classes',    'Create and manage classes',        'academics',    1),
('academics.students.manage',   'Manage Students',   'Enroll, transfer, manage students','academics',   1),
('academics.results.enter',     'Enter Results',     'Enter student exam results',       'academics',    1),
('academics.results.view',      'View Results',      'View student results',             'academics',    1),
('academics.timetable.manage',  'Manage Timetable',  'Create and manage timetables',     'academics',    1),

-- Attendance
('attendance.view',   'View Attendance',   'View attendance records',                  'attendance',   1),
('attendance.manage', 'Manage Attendance', 'Mark and manage attendance',               'attendance',   1),

-- Finance
('finance.view',           'View Finance',     'View financial overview',               'finance',      1),
('finance.fees.manage',    'Manage Fees',      'Create and manage fee structures',      'finance',      1),
('finance.payments.view',  'View Payments',    'View payment records',                  'finance',      1),
('finance.reports.view',   'View Reports',     'View financial reports',                'finance',      1),

-- School settings
('school.read',   'View School',   'View school information',                          'school',       1),
('school.update', 'Update School', 'Update school settings',                           'school',       1),

-- Analytics
('analytics.view', 'View Analytics', 'View analytics and dashboards',                  'analytics',    1),

-- Audit & Sessions
('audit.read',          'View Audit Logs',     'View system audit logs',               'admin',        1),
('sessions.monitor',    'Monitor Sessions',    'View active user sessions',            'admin',        1),
('sessions.terminate',  'Terminate Sessions',  'Force-terminate user sessions',        'admin',        1);


-- ═══════════════════════════════════════════════════════════════════
-- 2. MAP PERMISSIONS TO ROLES (for school_id = 1 base roles)
--    SuperAdmin (id=11) bypasses checks via isSuperAdmin flag,
--    but we still map all perms for completeness.
-- ═══════════════════════════════════════════════════════════════════

-- Helper: Admin role (id=12) — full management except superadmin-only
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 12, p.id FROM permissions p WHERE p.code IN (
  'user.create', 'user.read', 'user.update', 'user.activate',
  'role.read', 'roles.read',
  'staff.read', 'staff.create', 'staff.update', 'staff.delete', 'staff.account.manage',
  'departments.read', 'departments.manage',
  'academics.classes.manage', 'academics.students.manage', 'academics.results.enter', 'academics.results.view', 'academics.timetable.manage',
  'attendance.view', 'attendance.manage',
  'finance.view', 'finance.fees.manage', 'finance.payments.view', 'finance.reports.view',
  'school.read', 'school.update',
  'analytics.view',
  'audit.read', 'sessions.monitor'
) AND p.is_active = 1;

-- Teacher role (id=13)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 13, p.id FROM permissions p WHERE p.code IN (
  'academics.classes.manage', 'academics.students.manage',
  'academics.results.enter', 'academics.results.view', 'academics.timetable.manage',
  'attendance.view', 'attendance.manage',
  'school.read'
) AND p.is_active = 1;

-- Bursar role (id=14)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 14, p.id FROM permissions p WHERE p.code IN (
  'finance.view', 'finance.fees.manage', 'finance.payments.view', 'finance.reports.view',
  'school.read'
) AND p.is_active = 1;

-- Warden role (id=15)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 15, p.id FROM permissions p WHERE p.code IN (
  'academics.students.manage',
  'attendance.view', 'attendance.manage',
  'school.read'
) AND p.is_active = 1;

-- Receptionist role (id=16)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 16, p.id FROM permissions p WHERE p.code IN (
  'academics.students.manage',
  'school.read', 'user.read'
) AND p.is_active = 1;

-- Staff role (id=17)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 17, p.id FROM permissions p WHERE p.code IN (
  'academics.students.manage',
  'school.read'
) AND p.is_active = 1;

-- Parent role (id=18)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 18, p.id FROM permissions p WHERE p.code IN (
  'academics.results.view',
  'school.read'
) AND p.is_active = 1;

-- ═══════════════════════════════════════════════════════════════════
-- 3. ALSO map permissions for duplicate role sets (id 19-26, same school)
-- ═══════════════════════════════════════════════════════════════════

-- Admin (id=20)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 20, p.id FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = 12;

-- Teacher (id=21)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 21, p.id FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = 13;

-- Bursar (id=22)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 22, p.id FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = 14;

-- Warden (id=23)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 23, p.id FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = 15;

-- Receptionist (id=24)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 24, p.id FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = 16;

-- Staff (id=25)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 25, p.id FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = 17;

-- Parent (id=26)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 26, p.id FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = 18;

-- Admin (id=30011)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 30011, p.id FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = 12;

-- Teacher (id=30012)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 30012, p.id FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = 13;

-- School 8002 roles
-- Admin (id=180012)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 180012, p.id FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = 12;

-- Teacher (id=180013)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 180013, p.id FROM permissions p
INNER JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = 13;
