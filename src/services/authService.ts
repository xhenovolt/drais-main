import bcrypt from 'bcryptjs';
import { query, getConnection } from '@/lib/db';
import {
  User,
  UserWithRoles,
  Role,
  Permission,
} from '@/types/saas';

// ============================================
// PASSWORD HASHING & VERIFICATION
// ============================================

/**
 * Hash a plain text password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  return bcrypt.hash(password, rounds);
}

/**
 * Compare plain text password with hash
 */
export async function verifyPassword(
  plainPassword: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash);
}

// JWT token management has been removed.
// The system uses server-side session cookies (drais_session) for authentication.

// ============================================
// USER RETRIEVAL & ROLES/PERMISSIONS
// ============================================

/**
 * Get user with all roles and permissions
 */
export async function getUserWithRoles(
  userId: bigint,
  schoolId: bigint
): Promise<UserWithRoles | null> {
  const connection = await getConnection();

  try {
    // Get user
    const [users] = await connection.execute<any[]>(
      'SELECT * FROM users WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
      [userId, schoolId]
    );

    if (users.length === 0) return null;
    const user = users[0];

    // Get roles
    const [roleRows] = await connection.execute<any[]>(
      `SELECT r.* FROM roles r
       INNER JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = ? AND ur.is_active = TRUE AND r.is_active = TRUE`,
      [userId]
    );

    // Get all permissions from roles
    const [permissionRows] = await connection.execute<any[]>(
      `SELECT DISTINCT p.* FROM permissions p
       INNER JOIN role_permissions rp ON p.id = rp.permission_id
       INNER JOIN user_roles ur ON rp.role_id = ur.role_id
       WHERE ur.user_id = ? AND ur.is_active = TRUE AND p.is_active = TRUE`,
      [userId]
    );

    return {
      ...user,
      roles: roleRows,
      permissions: permissionRows,
    };
  } finally {
    await connection.end();
  }
}

/**
 * Get all permissions for a role
 */
export async function getRolePermissions(roleId: bigint): Promise<Permission[]> {
  const [permissions] = await query<Permission[]>(
    `SELECT p.* FROM permissions p
     INNER JOIN role_permissions rp ON p.id = rp.permission_id
     WHERE rp.role_id = ? AND p.is_active = TRUE`,
    [roleId]
  );

  return permissions || [];
}

/**
 * Check if user has a specific permission
 */
export async function hasPermission(
  userId: bigint,
  permissionCode: string,
  schoolId: bigint
): Promise<boolean> {
  // SuperAdmin has all permissions
  const [superAdminRole] = await query<Role[]>(
    'SELECT * FROM roles WHERE school_id = ? AND is_super_admin = TRUE AND is_active = TRUE LIMIT 1',
    [schoolId]
  );

  if (superAdminRole && superAdminRole.length > 0) {
    const [userHasSuperAdmin] = await query<any[]>(
      'SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ? AND is_active = TRUE LIMIT 1',
      [userId, superAdminRole[0].id]
    );

    if (userHasSuperAdmin && userHasSuperAdmin.length > 0) {
      return true;
    }
  }

  // Check specific permission
  const [results] = await query<any[]>(
    `SELECT 1 FROM permissions p
     INNER JOIN role_permissions rp ON p.id = rp.permission_id
     INNER JOIN user_roles ur ON rp.role_id = ur.role_id
     WHERE ur.user_id = ? AND p.code = ? AND ur.is_active = TRUE AND p.is_active = TRUE
     LIMIT 1`,
    [userId, permissionCode]
  );

  return results && results.length > 0;
}

/**
 * Get all permissions for a user
 */
export async function getUserPermissions(userId: bigint): Promise<Permission[]> {
  const [permissions] = await query<Permission[]>(
    `SELECT DISTINCT p.* FROM permissions p
     INNER JOIN role_permissions rp ON p.id = rp.permission_id
     INNER JOIN user_roles ur ON rp.role_id = ur.role_id
     WHERE ur.user_id = ? AND ur.is_active = TRUE AND p.is_active = TRUE`,
    [userId]
  );

  return permissions || [];
}

// ============================================
// SCHOOL SETUP & INITIALIZATION
// ============================================

/**
 * Create default roles for a new school
 */
export async function createDefaultRoles(schoolId: bigint): Promise<Role[]> {
  const roles = [];
  const connection = await getConnection();

  try {
    // Create SuperAdmin role
    const [superAdminResult] = await connection.execute<any>(
      `INSERT INTO roles (school_id, name, description, role_type, is_super_admin, is_active)
       VALUES (?, ?, ?, ?, TRUE, TRUE)`,
      [schoolId, 'SuperAdmin', 'School Administrator with full system access', 'system']
    );

    // Create other default roles
    const defaultRoles = [
      { name: 'Admin', description: 'Administrator who can manage users and settings' },
      { name: 'Teacher', description: 'Teacher who can manage classes and marks' },
      { name: 'Bursar', description: 'Finance officer who manages fees and payments' },
      { name: 'Warden', description: 'Discipline officer who manages student conduct' },
      { name: 'Receptionist', description: 'Receptionist for visitor and student management' },
      { name: 'Staff', description: 'General staff member with basic access' },
      { name: 'Parent', description: 'Parent with access to own student records' },
    ];

    for (const roleData of defaultRoles) {
      const [result] = await connection.execute<any>(
        `INSERT INTO roles (school_id, name, description, role_type, is_active)
         VALUES (?, ?, ?, ?, TRUE)`,
        [schoolId, roleData.name, roleData.description, 'system']
      );

      roles.push({
        id: result.insertId as any,
        school_id: schoolId,
        name: roleData.name,
        description: roleData.description,
        role_type: 'system',
        is_super_admin: roleData.name === 'SuperAdmin',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    return roles;
  } finally {
    await connection.end();
  }
}

/**
 * Assign permissions to a role
 */
export async function assignPermissionsToRole(
  roleId: bigint,
  permissionCodes: string[]
): Promise<void> {
  const connection = await getConnection();

  try {
    // Get permission IDs by code
    const [permissions] = await connection.execute<any[]>(
      `SELECT id FROM permissions WHERE code IN (${permissionCodes.map(() => '?').join(',')})`,
      permissionCodes
    );

    if (permissions.length === 0) {
      throw new Error('No permissions found for the given codes');
    }

    // Delete existing permissions for this role
    await connection.execute('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);

    // Insert new permissions
    for (const perm of permissions) {
      await connection.execute(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [roleId, perm.id]
      );
    }
  } finally {
    await connection.end();
  }
}

/**
 * Setup SuperAdmin permissions (full access)
 */
export async function setupSuperAdminRole(superAdminRoleId: bigint): Promise<void> {
  const connection = await getConnection();

  try {
    // Get all permissions
    const [permissions] = await connection.execute<any[]>(
      'SELECT id FROM permissions WHERE is_active = TRUE'
    );

    // Assign all permissions to SuperAdmin
    for (const perm of permissions) {
      await connection.execute(
        'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [superAdminRoleId, perm.id]
      );
    }
  } finally {
    await connection.end();
  }
}

/**
 * Setup default role permissions
 */
export async function setupDefaultRolePermissions(schoolId: bigint): Promise<void> {
  const connection = await getConnection();

  try {
    // Get all roles for this school
    const [roles] = await connection.execute<any[]>(
      'SELECT * FROM roles WHERE school_id = ? AND role_type = ?',
      [schoolId, 'system']
    );

    // Define default permissions for each role
    const rolePermissions: Record<string, string[]> = {
      Admin: [
        'user.create',
        'user.read',
        'user.update',
        'user.activate',
        'role.read',
        'school.read',
        'school.update',
        'academics.classes.manage',
        'academics.students.manage',
        'analytics.view',
      ],
      Teacher: [
        'academics.classes.manage',
        'academics.students.manage',
        'academics.results.enter',
        'academics.timetable.manage',
        'attendance.view',
        'attendance.manage',
      ],
      Bursar: [
        'finance.view',
        'finance.fees.manage',
        'finance.payments.view',
        'finance.reports.view',
        'school.read',
      ],
      Warden: [
        'academics.students.manage',
        'attendance.view',
        'attendance.manage',
        'school.read',
      ],
      Receptionist: [
        'academics.students.manage',
        'school.read',
        'user.read',
      ],
      Staff: [
        'academics.students.manage',
        'school.read',
      ],
      Parent: [
        'academics.results.view',
        'school.read',
      ],
    };

    // Assign permissions to each role
    for (const role of roles) {
      const permissions = rolePermissions[role.name] || [];
      if (permissions.length > 0) {
        await assignPermissionsToRole(role.id, permissions);
      }
    }
  } finally {
    await connection.end();
  }
}

// ============================================
// AUDIT LOGGING
// ============================================

/**
 * Log an action to audit trail
 */
export async function logAuditAction(
  schoolId: bigint,
  action: string,
  entityType: string,
  entityId?: bigint,
  userId?: bigint,
  details?: {
    old_values?: Record<string, any>;
    new_values?: Record<string, any>;
    ip_address?: string;
    user_agent?: string;
    status?: 'success' | 'failure';
    error_message?: string;
  }
): Promise<void> {
  const [result] = await query(
    `INSERT INTO audit_logs 
     (school_id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      schoolId,
      userId || null,
      action,
      entityType,
      entityId || null,
      details?.old_values ? JSON.stringify(details.old_values) : null,
      details?.new_values ? JSON.stringify(details.new_values) : null,
      details?.ip_address || null,
      details?.user_agent || null,
      details?.status || 'success',
      details?.error_message || null,
    ]
  );
}

// ============================================
// ACCOUNT SECURITY
// ============================================

/**
 * Record failed login attempt
 */
export async function recordFailedLogin(userId: bigint): Promise<void> {
  const connection = await getConnection();

  try {
    // Increment failed attempts and lock account after 5 attempts
    await connection.execute(
      `UPDATE users 
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE 
             WHEN failed_login_attempts >= 4 THEN DATE_ADD(NOW(), INTERVAL 30 MINUTE)
             ELSE locked_until
           END
       WHERE id = ?`,
      [userId]
    );
  } finally {
    await connection.end();
  }
}

/**
 * Clear failed login attempts on successful login
 */
export async function clearFailedLoginAttempts(userId: bigint): Promise<void> {
  await query(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?',
    [userId]
  );
}

/**
 * Check if account is locked
 */
export async function isAccountLocked(userId: bigint): Promise<boolean> {
  const [results] = await query<any[]>(
    'SELECT locked_until FROM users WHERE id = ? AND locked_until > NOW()',
    [userId]
  );

  return results && results.length > 0;
}
