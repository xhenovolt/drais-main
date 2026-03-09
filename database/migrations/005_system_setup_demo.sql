-- ============================================
-- System Setup: Permissions, Roles, and Demo Data
-- ============================================

-- ============================================
-- 1. INSERT DEFAULT SYSTEM PERMISSIONS (simplified)
-- ============================================
INSERT IGNORE INTO permissions (code, description) VALUES
('user.create', 'Create Users'),
('user.read', 'View Users'),
('user.update', 'Edit Users'),
('user.delete', 'Delete Users'),
('user.activate', 'Activate/Deactivate Users'),
('role.create', 'Create Roles'),
('role.read', 'View Roles'),
('role.update', 'Edit Roles'),
('role.delete', 'Delete Roles'),
('role.permission_manage', 'Manage Permissions'),
('school.read', 'View School Info'),
('school.update', 'Edit School Info'),
('school.setup', 'Setup School'),
('academics.classes.manage', 'Manage Classes'),
('academics.subjects.manage', 'Manage Subjects'),
('academics.students.manage', 'Manage Students'),
('academics.exams.manage', 'Manage Exams'),
('academics.results.view', 'View Results'),
('academics.results.enter', 'Enter Results'),
('academics.timetable.manage', 'Manage Timetable'),
('attendance.view', 'View Attendance'),
('attendance.manage', 'Manage Attendance'),
('attendance.devices.manage', 'Manage Devices'),
('finance.view', 'View Financial Data'),
('finance.fees.manage', 'Manage Fees'),
('finance.payments.view', 'View Payments'),
('finance.reports.view', 'View Financial Reports'),
('reports.view', 'View Reports'),
('reports.generate', 'Generate Reports'),
('analytics.view', 'View Analytics');

-- ============================================
-- 2. INSERT DEMO SCHOOL (if doesn't exist)
-- ============================================
INSERT IGNORE INTO schools (id, name, address, email, phone, currency) 
VALUES (1, 'Drais Demo School', 'Demo Location', 'demo@draissystem.com', '+254700000000', 'UGX');

-- ============================================
-- 3. INSERT DEFAULT SYSTEM ROLES
-- ============================================
INSERT IGNORE INTO roles (school_id, name, description) 
VALUES 
(1, 'SuperAdmin', 'Full system access'),
(1, 'Admin', 'School administrator with full control'),
(1, 'Teacher', 'Teacher access to classes and marks'),
(1, 'Bursar', 'Finance and fee management'),
(1, 'Warden', 'Student discipline and welfare'),
(1, 'Receptionist', 'Front desk and visitor management'),
(1, 'Staff', 'Basic staff access'),
(1, 'Parent', 'Parent access to child records');

-- ============================================
-- 4. INSERT DEMO ADMIN USER (can login to test)
-- ============================================
-- For testing: admin@draissystem.com / admin@123
INSERT IGNORE INTO users (school_id, first_name, last_name, email, phone, password_hash, is_active, is_verified) 
VALUES 
(1, 'Admin', 'User', 'admin@draissystem.com', '+254700000000', 
'$2b$12$WQsDhJu8m2h8J1.a9Sh5HuvKDXPZWYmJe0xT.Uo.kE8S8S8S8S8S8', TRUE, TRUE);

-- ============================================
-- 5. Assign SuperAdmin role to admin user
-- ============================================
INSERT IGNORE INTO user_roles (user_id, role_id, is_active) 
SELECT u.id, r.id, TRUE 
FROM users u 
CROSS JOIN roles r 
WHERE u.email = 'admin@draissystem.com' AND r.name = 'SuperAdmin' AND r.school_id = 1;
