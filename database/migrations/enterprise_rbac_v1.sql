-- ============================================================================
-- DRAIS Enterprise RBAC v1 Migration
-- Phase 1–11: Unified Staff-User model, Deep RBAC, Org Hierarchy,
--             Session Monitoring, Audit Trail enhancements.
-- Safe to re-run: all statements use IF NOT EXISTS / CALL safe_add_column.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- § 1  STAFF TABLE — add hierarchy + direct contact columns
-- ──────────────────────────────────────────────────────────────────────────────

-- Org hierarchy: self-referencing manager chain
ALTER TABLE staff ADD COLUMN IF NOT EXISTS manager_id   BIGINT        DEFAULT NULL   COMMENT 'FK → staff.id (direct manager)';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS email        VARCHAR(255)  DEFAULT NULL   COMMENT 'Work email (denormalised from people for faster lookup)';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone        VARCHAR(50)   DEFAULT NULL   COMMENT 'Work phone (denormalised)';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS first_name   VARCHAR(100)  DEFAULT NULL   COMMENT 'Denormalised first name';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS last_name    VARCHAR(100)  DEFAULT NULL   COMMENT 'Denormalised last name';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMP     NULL DEFAULT NULL;

-- Index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_staff_manager  ON staff (manager_id);
CREATE INDEX IF NOT EXISTS idx_staff_email    ON staff (email);
CREATE INDEX IF NOT EXISTS idx_staff_deleted  ON staff (deleted_at);

-- ──────────────────────────────────────────────────────────────────────────────
-- § 2  USERS TABLE — link users to staff + first-login enforcement
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_id              BIGINT  DEFAULT NULL COMMENT 'FK → staff.id (null if user is not a staff member)';
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password  BOOLEAN DEFAULT FALSE COMMENT 'Force password reset on next login';

CREATE INDEX IF NOT EXISTS idx_users_staff_id ON users (staff_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- § 3  PERMISSIONS TABLE — add module / route / action columns
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE permissions ADD COLUMN IF NOT EXISTS module VARCHAR(100) DEFAULT NULL COMMENT 'Functional module (e.g. academics)';
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS route  VARCHAR(255) DEFAULT NULL COMMENT 'UI/API route (e.g. /academics/results)';
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS action VARCHAR(50)  DEFAULT NULL COMMENT 'Operation: create|read|update|delete|approve|export';

CREATE INDEX IF NOT EXISTS idx_permissions_module_action ON permissions (module, action);

-- ──────────────────────────────────────────────────────────────────────────────
-- § 4  DEPARTMENTS TABLE — add timestamps + soft-delete
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE departments ADD COLUMN IF NOT EXISTS description VARCHAR(500) DEFAULT NULL;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMP NULL DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_departments_school ON departments (school_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- § 5  STAFF_ROLES — role assignments for staff (incl. those without accounts)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `staff_roles` (
  `id`          BIGINT PRIMARY KEY AUTO_INCREMENT,
  `staff_id`    BIGINT   NOT NULL,
  `role_id`     BIGINT   NOT NULL,
  `school_id`   BIGINT   NOT NULL,
  `assigned_by` BIGINT   DEFAULT NULL  COMMENT 'user_id of assigner',
  `assigned_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY `uq_staff_role_school` (`staff_id`, `role_id`, `school_id`),
  INDEX `idx_sr_staff`  (`staff_id`),
  INDEX `idx_sr_role`   (`role_id`),
  INDEX `idx_sr_school` (`school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Role assignments per staff member (bypasses user account requirement)';

-- ──────────────────────────────────────────────────────────────────────────────
-- § 6  SESSIONS TABLE — add activity tracking + device info
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP NULL  DEFAULT NULL COMMENT 'Updated by heartbeat API';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS logout_time      TIMESTAMP NULL  DEFAULT NULL COMMENT 'Set on explicit logout';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_info      VARCHAR(500)    DEFAULT NULL COMMENT 'Parsed UA: browser/OS/device';

CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions (last_activity_at);

-- ──────────────────────────────────────────────────────────────────────────────
-- § 7  AUDIT_LOGS — add source + details columns if missing
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS details   JSON         DEFAULT NULL  COMMENT 'Rich context (old/new values, diff, metadata)';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS source    VARCHAR(50)  DEFAULT 'WEB' COMMENT 'WEB | MOBILE | API | JETON | SYSTEM';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_source  ON audit_logs (source);

-- ──────────────────────────────────────────────────────────────────────────────
-- § 8  SEED CORE PERMISSIONS (idempotent)
-- ──────────────────────────────────────────────────────────────────────────────

INSERT IGNORE INTO permissions (code, name, description, category, module, route, action) VALUES
  -- Staff management
  ('staff.read',           'View Staff',           'View staff list and profiles',           'staff',       'staff',       '/admin/staff',                 'read'),
  ('staff.create',         'Create Staff',         'Add new staff members',                  'staff',       'staff',       '/admin/staff',                 'create'),
  ('staff.update',         'Update Staff',         'Edit existing staff records',            'staff',       'staff',       '/admin/staff/{id}',             'update'),
  ('staff.delete',         'Delete Staff',         'Soft-delete / terminate staff',          'staff',       'staff',       '/admin/staff/{id}',             'delete'),
  ('staff.account.manage','Manage Staff Accounts', 'Create/disable user accounts for staff', 'staff',       'staff',       '/admin/staff/{id}/account',     'update'),
  -- Departments
  ('departments.read',    'View Departments',      'View department list',                   'departments', 'departments', '/admin/departments',            'read'),
  ('departments.manage',  'Manage Departments',    'Create/edit/delete departments',         'departments', 'departments', '/admin/departments',            'create'),
  -- Roles & Permissions
  ('roles.read',          'View Roles',            'View role definitions',                  'roles',       'roles',       '/admin/roles',                  'read'),
  ('roles.manage',        'Manage Roles',          'Create/edit/delete roles',               'roles',       'roles',       '/admin/roles',                  'create'),
  ('permissions.manage',  'Manage Permissions',    'Assign permissions to roles',            'roles',       'roles',       '/admin/roles/{id}',             'update'),
  -- Audit
  ('audit.read',          'View Audit Logs',       'Access the full audit trail',            'audit',       'audit',       '/admin/audit-logs',             'read'),
  -- User sessions
  ('sessions.monitor',    'Monitor Sessions',      'View live user sessions',                'sessions',    'sessions',    '/admin/user-sessions',          'read'),
  ('sessions.terminate',  'Terminate Sessions',    'Force-logout any user session',          'sessions',    'sessions',    '/admin/user-sessions',          'delete'),
  -- Academics
  ('academics.results.read',   'View Results',     'Read exam results',                      'academics',   'academics',   '/academics/results',            'read'),
  ('academics.results.update', 'Edit Results',     'Update exam results',                    'academics',   'academics',   '/academics/results',            'update'),
  ('academics.results.export', 'Export Results',   'Export results to CSV/PDF',              'academics',   'academics',   '/academics/results',            'export'),
  ('academics.results.approve','Approve Results',  'Final approval of result records',       'academics',   'academics',   '/academics/results',            'approve'),
  -- Finance
  ('finance.read',        'View Finance',          'View financial records',                 'finance',     'finance',     '/finance',                      'read'),
  ('finance.manage',      'Manage Finance',        'Create/update financial transactions',   'finance',     'finance',     '/finance',                      'create'),
  ('finance.export',      'Export Finance',        'Export financial data',                  'finance',     'finance',     '/finance',                      'export'),
  -- Students
  ('students.read',       'View Students',         'View student records',                   'students',    'students',    '/students',                     'read'),
  ('students.manage',     'Manage Students',       'Enrol, update, transfer students',       'students',    'students',    '/students',                     'create'),
  ('students.promote',    'Promote Students',      'Run promotions',                         'students',    'students',    '/students/promote',             'approve');

-- ──────────────────────────────────────────────────────────────────────────────
-- § 9  GRANT ALL PERMISSIONS TO EXISTING super_admin ROLE
-- ──────────────────────────────────────────────────────────────────────────────

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'super_admin';

-- Grant admin all permissions except sessions.terminate and permissions.manage
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug = 'admin'
  AND p.code NOT IN ('sessions.terminate', 'permissions.manage');
