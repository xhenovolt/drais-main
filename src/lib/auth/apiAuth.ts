// src/lib/auth/apiAuth.ts
// API Authentication and Authorization utilities for DRAIS V1
// Provides consistent session validation and permission checking across all API routes

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { RowDataPacket } from 'mysql2';

// ============================================
// TYPES
// ============================================

export interface SessionUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  schoolId: number;
  status: string;
  isSuperAdmin: boolean;
  roles: string[];
  permissions: string[];
}

export interface AuthContext {
  user: SessionUser;
  schoolId: number;
  hasPermission: (permission: string) => boolean;
  hasRole: (roleSlug: string) => boolean;
}

interface AuthResult {
  success: true;
  context: AuthContext;
}

interface AuthError {
  success: false;
  response: NextResponse;
}

// ============================================
// CONSTANTS
// ============================================

const SESSION_COOKIE_NAME = 'drais_session';

// ============================================
// ERROR RESPONSES
// ============================================

function createErrorResponse(
  message: string,
  code: string,
  status: number,
  details?: Record<string, any>
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { message, code, ...details },
    },
    { status }
  );
}

// ============================================
// SESSION VALIDATION
// ============================================

/**
 * Validate session and return user context
 * Use this at the start of any protected API route
 */
export async function validateApiSession(
  request: NextRequest
): Promise<AuthResult | AuthError> {
  try {
    // Get session token from cookie
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return {
        success: false,
        response: createErrorResponse(
          'Not authenticated',
          'NOT_AUTHENTICATED',
          401
        ),
      };
    }

    // Validate session in database
    const sessions = await query(
      `SELECT 
        s.id as session_id,
        s.user_id,
        s.school_id,
        s.expires_at,
        s.is_active,
        u.email,
        u.first_name,
        u.last_name,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as display_name,
        u.status
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ?
        AND s.is_active = TRUE
        AND s.expires_at > NOW()
        AND u.deleted_at IS NULL
      LIMIT 1`,
      [sessionToken]
    ) as RowDataPacket[];

    // Fallback to staff table
    if (!sessions || sessions.length === 0) {
      const staffSessions = await query(
        `SELECT 
          s.id as session_id,
          s.user_id,
          s.school_id,
          s.expires_at,
          s.is_active,
          st.email,
          st.name as first_name,
          '' as last_name,
          st.name as display_name,
          st.status
        FROM sessions s
        JOIN staff st ON s.user_id = st.id
        WHERE s.session_token = ?
          AND s.is_active = TRUE
          AND s.expires_at > NOW()
          AND st.deleted_at IS NULL
        LIMIT 1`,
        [sessionToken]
      ) as RowDataPacket[];

      if (!staffSessions || staffSessions.length === 0) {
        return {
          success: false,
          response: createErrorResponse(
            'Session expired or invalid',
            'SESSION_EXPIRED',
            401
          ),
        };
      }

      sessions.push(staffSessions[0]);
    }

    const session = sessions[0];

    // Check user status
    if (session.status === 'pending') {
      return {
        success: false,
        response: createErrorResponse(
          'Your account is pending approval',
          'ACCOUNT_PENDING',
          403
        ),
      };
    }

    if (['inactive', 'suspended', 'locked'].includes(session.status)) {
      return {
        success: false,
        response: createErrorResponse(
          'Your account has been deactivated',
          'ACCOUNT_INACTIVE',
          403
        ),
      };
    }

    // Check school status
    if (session.school_id) {
      const schools = await query(
        `SELECT status FROM schools WHERE id = ? AND deleted_at IS NULL`,
        [session.school_id]
      ) as RowDataPacket[];

      if (schools && schools.length > 0 && schools[0].status !== 'active') {
        return {
          success: false,
          response: createErrorResponse(
            'This school account is not active',
            'SCHOOL_INACTIVE',
            403
          ),
        };
      }
    }

    // Get user roles
    const roles = await query(
      `SELECT r.slug, r.is_super_admin
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = ?
         AND r.school_id = ?
         AND ur.is_active = TRUE
         AND r.is_active = TRUE`,
      [session.user_id, session.school_id]
    ).catch(() => []) as RowDataPacket[];

    const isSuperAdmin = roles.some((r: RowDataPacket) => r.is_super_admin);
    const roleList = roles.map((r: RowDataPacket) => r.slug as string);

    // Get permissions
    let permissionList: string[] = [];
    if (isSuperAdmin) {
      permissionList = ['*'];
    } else {
      const perms = await query(
        `SELECT DISTINCT p.code
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         JOIN role_permissions rp ON r.id = rp.role_id
         JOIN permissions p ON rp.permission_id = p.id
         WHERE ur.user_id = ?
           AND r.school_id = ?
           AND ur.is_active = TRUE
           AND r.is_active = TRUE
           AND p.is_active = TRUE`,
        [session.user_id, session.school_id]
      ).catch(() => []) as RowDataPacket[];

      permissionList = perms.map((p: RowDataPacket) => p.code as string);
    }

    // Build user object
    const user: SessionUser = {
      id: Number(session.user_id),
      email: session.email,
      firstName: session.first_name || '',
      lastName: session.last_name || '',
      displayName: session.display_name?.trim() || session.email,
      schoolId: Number(session.school_id),
      status: session.status,
      isSuperAdmin,
      roles: roleList,
      permissions: permissionList,
    };

    // Build auth context with helper methods
    const context: AuthContext = {
      user,
      schoolId: user.schoolId,
      hasPermission: (permission: string) => {
        if (user.isSuperAdmin || user.permissions.includes('*')) {
          return true;
        }
        return user.permissions.includes(permission);
      },
      hasRole: (roleSlug: string) => {
        return user.roles.includes(roleSlug);
      },
    };

    return { success: true, context };

  } catch (error) {
    console.error('API session validation error:', error);
    return {
      success: false,
      response: createErrorResponse(
        'An error occurred during authentication',
        'AUTH_ERROR',
        500
      ),
    };
  }
}

// ============================================
// PERMISSION CHECKING
// ============================================

/**
 * Validate session and require specific permission
 * Returns error response if permission is missing
 */
export async function requirePermission(
  request: NextRequest,
  permission: string
): Promise<AuthResult | AuthError> {
  const authResult = await validateApiSession(request);

  if (!authResult.success) {
    return authResult;
  }

  if (!authResult.context.hasPermission(permission)) {
    return {
      success: false,
      response: createErrorResponse(
        'You do not have permission to access this resource',
        'FORBIDDEN',
        403,
        { requiredPermission: permission }
      ),
    };
  }

  return authResult;
}

/**
 * Validate session and require any of the specified permissions
 */
export async function requireAnyPermission(
  request: NextRequest,
  permissions: string[]
): Promise<AuthResult | AuthError> {
  const authResult = await validateApiSession(request);

  if (!authResult.success) {
    return authResult;
  }

  const hasAny = permissions.some(p => authResult.context.hasPermission(p));

  if (!hasAny) {
    return {
      success: false,
      response: createErrorResponse(
        'You do not have permission to access this resource',
        'FORBIDDEN',
        403,
        { requiredPermissions: permissions }
      ),
    };
  }

  return authResult;
}

/**
 * Validate session and require all of the specified permissions
 */
export async function requireAllPermissions(
  request: NextRequest,
  permissions: string[]
): Promise<AuthResult | AuthError> {
  const authResult = await validateApiSession(request);

  if (!authResult.success) {
    return authResult;
  }

  const hasAll = permissions.every(p => authResult.context.hasPermission(p));

  if (!hasAll) {
    return {
      success: false,
      response: createErrorResponse(
        'You do not have all required permissions for this resource',
        'FORBIDDEN',
        403,
        { requiredPermissions: permissions }
      ),
    };
  }

  return authResult;
}

/**
 * Validate session and require specific role
 */
export async function requireRole(
  request: NextRequest,
  roleSlug: string
): Promise<AuthResult | AuthError> {
  const authResult = await validateApiSession(request);

  if (!authResult.success) {
    return authResult;
  }

  // Super admins have all roles implicitly
  if (authResult.context.user.isSuperAdmin) {
    return authResult;
  }

  if (!authResult.context.hasRole(roleSlug)) {
    return {
      success: false,
      response: createErrorResponse(
        'You do not have the required role for this resource',
        'FORBIDDEN',
        403,
        { requiredRole: roleSlug }
      ),
    };
  }

  return authResult;
}

// ============================================
// MULTI-TENANT ISOLATION
// ============================================

/**
 * Get the school_id for the current session
 * Always use this when making database queries to ensure tenant isolation
 */
export function getSchoolIdFromContext(context: AuthContext): number {
  return context.schoolId;
}

/**
 * Validate that an entity belongs to the user's school
 * Use this before accessing any tenant-scoped resource
 */
export async function validateTenantAccess(
  context: AuthContext,
  tableName: string,
  entityId: number
): Promise<boolean> {
  try {
    const results = await query(
      `SELECT school_id FROM ${tableName} WHERE id = ? LIMIT 1`,
      [entityId]
    ) as RowDataPacket[];

    if (!results || results.length === 0) {
      return false;
    }

    return Number(results[0].school_id) === context.schoolId;
  } catch (error) {
    console.error('Tenant validation error:', error);
    return false;
  }
}

// ============================================
// AUDIT LOGGING
// ============================================

/**
 * Log an action for audit purposes
 */
export async function logAuditAction(
  context: AuthContext,
  actionType: string,
  entityType: string,
  entityId?: number,
  oldValue?: Record<string, any>,
  newValue?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (school_id, user_id, action_type, entity_type, entity_id, old_value, new_value, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        context.schoolId,
        context.user.id,
        actionType,
        entityType,
        entityId || null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ipAddress || null,
        userAgent || null,
      ]
    );
  } catch (error) {
    // Don't fail the request if audit logging fails
    console.error('Audit logging error:', error);
  }
}
