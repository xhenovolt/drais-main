import { NextRequest, NextResponse } from 'next/server';
import { logAuditAction } from '@/services/authService';
import { query } from '@/lib/db';
import { AuthenticationError, AuthorizationError, TenantError } from '@/types/saas';

const SESSION_COOKIE = 'drais_session';

// ============================================
// SESSION PAYLOAD TYPE
// ============================================

export interface SessionPayload {
  user_id: number;
  /** snake_case alias kept for internal middleware use */
  school_id: number | null;
  /** camelCase alias for API route compatibility */
  schoolId: number | null;
  email: string;
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
}

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

/**
 * Extract and validate the session cookie, returning the authenticated user payload.
 * Throws AuthenticationError if the session is missing or invalid.
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<SessionPayload> {
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    throw new AuthenticationError(
      'No active session. Please log in.',
      'MISSING_SESSION'
    );
  }

  try {
    const sessions: any[] = await query(
      `SELECT s.user_id, s.school_id, u.email,
         (SELECT COUNT(*) FROM user_roles ur2
          JOIN roles r2 ON ur2.role_id = r2.id
          WHERE ur2.user_id = s.user_id
            AND r2.is_super_admin = TRUE
            AND ur2.is_active = TRUE) AS is_super_admin
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.session_token = ?
         AND s.is_active = TRUE
         AND s.expires_at > NOW()
         AND u.deleted_at IS NULL
       LIMIT 1`,
      [sessionToken]
    );

    if (!sessions || sessions.length === 0) {
      throw new AuthenticationError(
        'Session expired or invalid. Please log in again.',
        'SESSION_EXPIRED'
      );
    }

    const s = sessions[0];
    const isSuperAdmin = Number(s.is_super_admin) > 0;

    const roleRows: any[] = await query(
      `SELECT r.name
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = ? AND r.school_id = ? AND ur.is_active = TRUE`,
      [s.user_id, s.school_id]
    ).catch(() => []);
    const roles: string[] = Array.isArray(roleRows) ? roleRows.map((r: any) => r.name) : [];

    let permissions: string[] = [];
    if (isSuperAdmin) {
      permissions = ['*'];
    } else {
      const permRows: any[] = await query(
        `SELECT DISTINCT p.code
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         JOIN role_permissions rp ON r.id = rp.role_id
         JOIN permissions p ON rp.permission_id = p.id
         WHERE ur.user_id = ? AND r.school_id = ? AND ur.is_active = TRUE`,
        [s.user_id, s.school_id]
      ).catch(() => []);
      permissions = Array.isArray(permRows) ? permRows.map((p: any) => p.code) : [];
    }

    const schoolIdNum = s.school_id ? Number(s.school_id) : null;
    return {
      user_id: Number(s.user_id),
      school_id: schoolIdNum,
      schoolId: schoolIdNum,
      email: s.email,
      roles,
      permissions,
      isSuperAdmin,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    console.error('[Auth] Session validation error:', error);
    throw new AuthenticationError('Authentication failed. Please log in again.', 'AUTH_ERROR');
  }
}

/**
 * Middleware to require authentication
 */
export async function requireAuth(request: NextRequest) {
  try {
    return await getAuthenticatedUser(request);
  } catch (error) {
    return createErrorResponse(
      'Unauthorized',
      401,
      'UNAUTHORIZED',
      error instanceof Error ? error.message : 'Authentication failed'
    );
  }
}

// ============================================
// AUTHORIZATION MIDDLEWARE
// ============================================

/**
 * Middleware to check if user has specific permission
 */
export async function requirePermission(
  request: NextRequest,
  permissionCode: string
) {
  try {
    const tokenPayload = await getAuthenticatedUser(request);

    // Check if user has permission
    if (!tokenPayload.permissions.includes(permissionCode) && !tokenPayload.isSuperAdmin) {
      // Log failed permission check
      await logAuditAction(
        BigInt(tokenPayload.school_id!),
        'permission_denied',
        'api_access',
        undefined,
        BigInt(tokenPayload.user_id),
        {
          status: 'failure',
          error_message: `Missing permission: ${permissionCode}`,
          ip_address: request.ip,
          user_agent: request.headers.get('user-agent') || undefined,
        }
      );

      throw new AuthorizationError(
        `Missing required permission: ${permissionCode}`,
        'FORBIDDEN',
        permissionCode
      );
    }

    return tokenPayload;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return createErrorResponse(
        'Unauthorized',
        401,
        'UNAUTHORIZED',
        error.message
      );
    }

    if (error instanceof AuthorizationError) {
      return createErrorResponse(
        'Forbidden',
        403,
        error.code,
        error.message
      );
    }

    return createErrorResponse(
      'Internal Server Error',
      500,
      'INTERNAL_ERROR',
      'Authorization check failed'
    );
  }
}

/**
 * Middleware to check if user is SuperAdmin
 */
export async function requireSuperAdmin(request: NextRequest) {
  try {
    const tokenPayload = await getAuthenticatedUser(request);

    // Check if user is SuperAdmin
    if (!tokenPayload.isSuperAdmin && !tokenPayload.roles.includes('SuperAdmin')) {
      throw new AuthorizationError(
        'SuperAdmin access required',
        'FORBIDDEN'
      );
    }

    return tokenPayload;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return createErrorResponse(
        'Unauthorized',
        401,
        'UNAUTHORIZED',
        error.message
      );
    }

    if (error instanceof AuthorizationError) {
      return createErrorResponse(
        'Forbidden',
        403,
        error.code,
        error.message
      );
    }

    throw error;
  }
}

// ============================================
// TENANT ISOLATION MIDDLEWARE
// ============================================

/**
 * Verify that user is accessing their own school's data
 */
export async function verifyTenantAccess(
  request: NextRequest,
  schoolId: string | number
) {
  try {
    const tokenPayload = await getAuthenticatedUser(request);

    // Compare school IDs as numbers
    const requestedSchoolId = Number(schoolId);
    if (tokenPayload.school_id !== requestedSchoolId) {
      // Log unauthorized tenant access attempt
      await logAuditAction(
        BigInt(tokenPayload.school_id!),
        'unauthorized_tenant_access',
        'tenant_violation',
        undefined,
        BigInt(tokenPayload.user_id),
        {
          status: 'failure',
          error_message: `Attempted access to school: ${schoolId}`,
          ip_address: request.ip,
          user_agent: request.headers.get('user-agent') || undefined,
        }
      );

      throw new TenantError(
        'Access denied to this school',
        'TENANT_VIOLATION'
      );
    }

    return tokenPayload;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return createErrorResponse(
        'Unauthorized',
        401,
        'UNAUTHORIZED',
        error.message
      );
    }

    if (error instanceof TenantError) {
      return createErrorResponse(
        'Forbidden',
        403,
        error.code,
        error.message
      );
    }

    throw error;
  }
}

// ============================================
// SCHOOL SETUP ENFORCEMENT
// ============================================

/**
 * Require that school setup is complete
 */
export async function requireSchoolSetup(
  request: NextRequest,
  schoolId: string | number
) {
  try {
    const tokenPayload = await getAuthenticatedUser(request);

    // Verify tenant access first
    const requestedSchoolId = Number(schoolId);
    if (tokenPayload.school_id !== requestedSchoolId) {
      throw new TenantError('Access denied to this school', 'TENANT_VIOLATION');
    }

    // Note: You'll need to fetch school info from DB
    // This is a simplified version - actual implementation would query the school
    // For now, this is a placeholder that trusts the token

    return tokenPayload;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return createErrorResponse(
        'Unauthorized',
        401,
        'UNAUTHORIZED',
        error.message
      );
    }

    if (error instanceof TenantError) {
      return createErrorResponse(
        'Forbidden',
        403,
        error.code,
        error.message
      );
    }

    throw error;
  }
}

// ============================================
// ERROR RESPONSE BUILDERS
// ============================================

/**
 * Create standardized error response
 */
export function createErrorResponse(
  message: string,
  status: number,
  code: string,
  details?: string
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}

/**
 * Create standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
  meta?: Record<string, any>
) {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    },
    { status }
  );
}

// ============================================
// TYPED MIDDLEWARE BUILDERS
// ============================================

/**
 * Higher-order function to create protected API routes
 */
export function withAuth(
  handler: (req: NextRequest, user: any) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    try {
      const user = await getAuthenticatedUser(req);
      return await handler(req, user);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return createErrorResponse(
          'Unauthorized',
          401,
          error.code,
          error.message
        );
      }
      throw error;
    }
  };
}

/**
 * Higher-order function to create protected routes with permission check
 */
export function withPermission(
  permission: string,
  handler: (req: NextRequest, user: any) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    try {
      const user = await getAuthenticatedUser(req);

      if (!user.permissions.includes(permission) && !user.isSuperAdmin) {
        await logAuditAction(
          BigInt(user.school_id!),
          'permission_denied',
          'api_access',
          undefined,
          BigInt(user.user_id),
          {
            status: 'failure',
            error_message: `Missing permission: ${permission}`,
            ip_address: req.ip,
            user_agent: req.headers.get('user-agent') || undefined,
          }
        );

        return createErrorResponse(
          'Forbidden',
          403,
          'FORBIDDEN',
          `Missing required permission: ${permission}`
        );
      }

      return await handler(req, user);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return createErrorResponse(
          'Unauthorized',
          401,
          error.code,
          error.message
        );
      }
      throw error;
    }
  };
}

/**
 * Extract tenant ID from URL and verify access
 */
export function extractAndVerifyTenant(req: NextRequest): bigint | NextResponse {
  const schoolId = req.nextUrl.searchParams.get('school_id');
  
  if (!schoolId) {
    return createErrorResponse(
      'Bad Request',
      400,
      'MISSING_SCHOOL_ID',
      'school_id parameter is required'
    );
  }

  try {
    return BigInt(schoolId);
  } catch {
    return createErrorResponse(
      'Bad Request',
      400,
      'INVALID_SCHOOL_ID',
      'school_id must be a valid number'
    );
  }
}
