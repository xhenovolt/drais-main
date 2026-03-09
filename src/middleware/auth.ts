import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getUserWithRoles, hasPermission, logAuditAction } from '@/services/authService';
import { AuthenticationError, AuthorizationError, TenantError } from '@/types/saas';

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

/**
 * Extract and verify JWT from request
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError(
      'Missing or invalid authorization header',
      'MISSING_TOKEN'
    );
  }

  const token = authHeader.substring(7);
  
  try {
    const payload = verifyToken(token);
    return payload;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('Invalid token', 'INVALID_TOKEN');
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
    if (!tokenPayload.permissions.includes(permissionCode)) {
      // Log failed permission check
      await logAuditAction(
        tokenPayload.school_id,
        'permission_denied',
        'api_access',
        undefined,
        tokenPayload.user_id,
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

    // Check if user is SuperAdmin - we can pass is_super_admin flag in token
    // For now, check if they have the super admin role
    if (!tokenPayload.roles.includes('SuperAdmin')) {
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

    // Parse schoolId to bigint for comparison
    const requestedSchoolId = BigInt(schoolId);
    if (tokenPayload.school_id !== requestedSchoolId) {
      // Log unauthorized tenant access attempt
      await logAuditAction(
        tokenPayload.school_id,
        'unauthorized_tenant_access',
        'tenant_violation',
        undefined,
        tokenPayload.user_id,
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
    const requestedSchoolId = BigInt(schoolId);
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

      if (!user.permissions.includes(permission)) {
        await logAuditAction(
          user.school_id,
          'permission_denied',
          'api_access',
          undefined,
          user.user_id,
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
