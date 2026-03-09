// src/services/sessionService.ts
// Session-based authentication service for DRAIS V1
// Handles session creation, validation, and management

import { randomBytes } from 'crypto';
import { getConnection } from '@/lib/db';
import { User, Session } from '@/types/saas';

// Session configuration
export const SESSION_CONFIG = {
  TOKEN_LENGTH: 32, // 32 bytes = 256 bits
  EXPIRY_DAYS: 7,
  EXPIRY_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  COOKIE_NAME: 'drais_session',
  COOKIE_MAX_AGE: 7 * 24 * 60 * 60, // 7 days in seconds
  COOKIE_OPTIONS: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
};

/**
 * Generate a cryptographically secure session token
 * @returns A random 256-bit hex string
 */
export function generateSessionToken(): string {
  return randomBytes(SESSION_CONFIG.TOKEN_LENGTH).toString('hex');
}

/**
 * Create a new session for a user
 * @param userId - User ID
 * @param schoolId - School/Tenant ID (can be null if user hasn't selected a school yet)
 * @param ipAddress - Optional: Client IP for validation
 * @param userAgent - Optional: User-Agent for validation
 * @returns Session token and session data
 */
export async function createSession(
  userId: bigint,
  schoolId: bigint | null,
  ipAddress?: string,
  userAgent?: string
): Promise<{ sessionToken: string; expiresAt: Date }> {
  const connection = await getConnection();

  try {
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_CONFIG.EXPIRY_MS);

    const query = `
      INSERT INTO sessions (user_id, school_id, session_token, expires_at, ip_address, user_agent, is_active)
      VALUES (?, ?, ?, ?, ?, ?, TRUE)
    `;

    await connection.execute(query, [
      userId,
      schoolId,
      sessionToken,
      expiresAt,
      ipAddress || null,
      userAgent || null,
    ]);

    return { sessionToken, expiresAt };
  } finally {
    await connection.end();
  }
}

/**
 * Validate a session token and return user data
 * @param sessionToken - The session token to validate
 * @param schoolId - The school/tenant ID (for isolation)
 * @param ipAddress - Optional: Client IP for validation
 * @returns User object with session data, or null if invalid
 */
export async function validateSession(
  sessionToken: string,
  schoolId: bigint,
  ipAddress?: string
): Promise<(User & { display_name: string }) | null> {
  const connection = await getConnection();

  try {
    const query = `
      SELECT 
        u.id,
        u.school_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.avatar_url,
        u.is_active,
        u.is_verified,
        u.last_login_at,
        CONCAT(u.first_name, ' ', u.last_name) as display_name,
        s.expires_at,
        s.ip_address as session_ip,
        s.session_token
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ?
        AND s.school_id = ?
        AND s.expires_at > NOW()
        AND s.is_active = TRUE
        AND u.is_active = TRUE
        AND u.deleted_at IS NULL
      LIMIT 1
    `;

    const [rows] = await connection.execute<any[]>(query, [
      sessionToken,
      schoolId,
    ]);

    if (rows.length === 0) {
      return null;
    }

    const sessionRow = rows[0];

    // Optional: Validate IP address for extra security
    if (ipAddress && sessionRow.session_ip && sessionRow.session_ip !== ipAddress) {
      console.warn(
        `IP mismatch for session ${sessionToken.substring(0, 8)}... - ` +
          `original: ${sessionRow.session_ip}, current: ${ipAddress}`
      );
      // Note: Not rejecting based on IP by default to avoid issues with proxies
      // You can enable this security feature per deployment requirements
    }

    // Return user object with display_name
    const { session_ip, expires_at, session_token, ...user } = sessionRow;
    return {
      ...user,
      display_name: sessionRow.display_name,
    };
  } finally {
    await connection.end();
  }
}

/**
 * Get user permissions for the session
 * @param userId - User ID
 * @param schoolId - School/Tenant ID
 * @returns Array of permission codes
 */
export async function getUserPermissions(
  userId: bigint,
  schoolId: bigint
): Promise<string[]> {
  const connection = await getConnection();

  try {
    // Check if user is SuperAdmin
    const superAdminQuery = `
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
        AND r.school_id = ?
        AND r.is_super_admin = TRUE
        AND ur.is_active = TRUE
      LIMIT 1
    `;

    const [superAdminRows] = await connection.execute<any[]>(superAdminQuery, [
      userId,
      schoolId,
    ]);

    // If SuperAdmin, return special token
    if (superAdminRows.length > 0) {
      return ['*']; // Wildcard = all permissions
    }

    // Get permissions from user roles
    const permissionsQuery = `
      SELECT DISTINCT p.code
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      JOIN role_permissions rp ON r.id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = ?
        AND r.school_id = ?
        AND ur.is_active = TRUE
        AND r.is_active = TRUE
        AND p.is_active = TRUE
      ORDER BY p.code
    `;

    const [permissionRows] = await connection.execute<any[]>(
      permissionsQuery,
      [userId, schoolId]
    );

    return permissionRows.map((row: any) => row.code);
  } finally {
    await connection.end();
  }
}

/**
 * Get user roles for the session
 * @param userId - User ID
 * @param schoolId - School/Tenant ID
 * @returns Array of role names
 */
export async function getUserRoles(
  userId: bigint,
  schoolId: bigint
): Promise<string[]> {
  const connection = await getConnection();

  try {
    const query = `
      SELECT r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
        AND r.school_id = ?
        AND ur.is_active = TRUE
        AND r.is_active = TRUE
      ORDER BY r.name
    `;

    const [rows] = await connection.execute<any[]>(query, [userId, schoolId]);

    return rows.map((row: any) => row.name);
  } finally {
    await connection.end();
  }
}

/**
 * Destroy a session (logout)
 * @param sessionToken - The session token to destroy
 * @returns true if session was destroyed, false if not found
 */
export async function destroySession(sessionToken: string): Promise<boolean> {
  const connection = await getConnection();

  try {
    const query = `
      UPDATE sessions
      SET is_active = FALSE, updated_at = NOW()
      WHERE session_token = ? AND is_active = TRUE
    `;

    const result = await connection.execute(query, [sessionToken]);
    const [affectedRows] = result as any[];

    return affectedRows.affectedRows > 0;
  } finally {
    await connection.end();
  }
}

/**
 * Get all active sessions for a user
 * @param userId - User ID
 * @param schoolId - School/Tenant ID
 * @returns Array of session records
 */
export async function getUserSessions(
  userId: bigint,
  schoolId: bigint
): Promise<Session[]> {
  const connection = await getConnection();

  try {
    const query = `
      SELECT id, user_id, school_id, session_token, expires_at, 
             ip_address, user_agent, is_active, created_at, updated_at
      FROM sessions
      WHERE user_id = ? AND school_id = ? AND is_active = TRUE
      ORDER BY created_at DESC
    `;

    const [rows] = await connection.execute<any[]>(query, [userId, schoolId]);

    return rows;
  } finally {
    await connection.end();
  }
}

/**
 * Destroy all sessions for a user (logout all devices)
 * @param userId - User ID
 * @param schoolId - School/Tenant ID
 * @returns Number of sessions destroyed
 */
export async function destroyAllUserSessions(
  userId: bigint,
  schoolId: bigint
): Promise<number> {
  const connection = await getConnection();

  try {
    const query = `
      UPDATE sessions
      SET is_active = FALSE, updated_at = NOW()
      WHERE user_id = ? AND school_id = ? AND is_active = TRUE
    `;

    const result = await connection.execute(query, [userId, schoolId]);
    const [affectedRows] = result as any[];

    return affectedRows.affectedRows;
  } finally {
    await connection.end();
  }
}

/**
 * Clean up expired sessions (can be run as a cron job)
 * @returns Number of sessions deleted
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const connection = await getConnection();

  try {
    const query = `
      DELETE FROM sessions
      WHERE expires_at < NOW() OR (is_active = FALSE AND updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY))
    `;

    const result = await connection.execute(query);
    const [affectedRows] = result as any[];

    return affectedRows.affectedRows;
  } finally {
    await connection.end();
  }
}

/**
 * Check if user has a specific permission
 * @param userId - User ID
 * @param schoolId - School/Tenant ID
 * @param permissionCode - Permission code to check
 * @returns true if user has permission, false otherwise
 */
export async function hasPermission(
  userId: bigint,
  schoolId: bigint,
  permissionCode: string
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, schoolId);

  // Check for SuperAdmin wildcard
  if (permissions.includes('*')) {
    return true;
  }

  return permissions.includes(permissionCode);
}

/**
 * Check if user has a specific role
 * @param userId - User ID
 * @param schoolId - School/Tenant ID
 * @param roleName - Role name to check
 * @returns true if user has role, false otherwise
 */
export async function hasRole(
  userId: bigint,
  schoolId: bigint,
  roleName: string
): Promise<boolean> {
  const roles = await getUserRoles(userId, schoolId);
  return roles.includes(roleName);
}
