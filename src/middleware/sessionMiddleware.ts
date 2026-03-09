// src/middleware/sessionMiddleware.ts
// Session-based authentication middleware for DRAIS V1
// Validates session tokens from HTTP-only cookies

import { NextRequest, NextResponse } from 'next/server';
import {
  validateSession,
  getUserPermissions,
  getUserRoles,
  SESSION_CONFIG,
} from '@/services/sessionService';

export interface SessionContext {
  user: {
    id: bigint;
    school_id: bigint;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    display_name: string;
  };
  schoolId: bigint;
  permissions: string[];
  roles: string[];
}

/**
 * Extract session token from cookies
 */
function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_CONFIG.COOKIE_NAME)?.value || null;
}

/**
 * Get client IP address (supports proxies)
 */
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

/**
 * Validate session from request
 * Extracts session token from cookie, validates it, and returns user context
 */
export async function validateSessionFromRequest(
  request: NextRequest
): Promise<SessionContext | null> {
  try {
    const sessionToken = getSessionToken(request);

    if (!sessionToken) {
      return null;
    }

    // Extract school_id from request headers or URL
    // This can be passed via x-school-id header or derived from request
    const schoolIdHeader = request.headers.get('x-school-id');
    const schoolId = schoolIdHeader ? BigInt(schoolIdHeader) : null;

    if (!schoolId) {
      console.warn('School ID not provided in request');
      return null;
    }

    const ipAddress = getClientIp(request);

    // Validate session in database
    const user = await validateSession(sessionToken, schoolId, ipAddress);

    if (!user) {
      return null;
    }

    // Get user permissions and roles
    const [permissions, roles] = await Promise.all([
      getUserPermissions(user.id, schoolId),
      getUserRoles(user.id, schoolId),
    ]);

    return {
      user: {
        id: user.id,
        school_id: user.school_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
        display_name: user.display_name,
      },
      schoolId,
      permissions,
      roles,
    };
  } catch (error) {
    console.error('Error validating session:', error);
    return null;
  }
}

/**
 * Create error response
 */
function createErrorResponse(
  message: string,
  status: number,
  code: string = 'ERROR'
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        message,
        code,
      },
    },
    { status }
  );
}

/**
 * Middleware: Require authenticated session
 * Usage: const handler = withAuth(async (req, session) => {...})
 */
export function withSession<T extends (...args: any[]) => any>(
  handler: (req: NextRequest, session: SessionContext) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const session = await validateSessionFromRequest(request);

    if (!session) {
      return createErrorResponse('Unauthorized - No valid session', 401, 'UNAUTHORIZED');
    }

    try {
      return await handler(request, session);
    } catch (error) {
      console.error('Error in protected route handler:', error);
      return createErrorResponse('Internal server error', 500, 'INTERNAL_ERROR');
    }
  };
}

/**
 * Middleware: Require specific permission
 * Usage: const handler = withPermission('user.create', async (req, session) => {...})
 */
export function withPermission(
  requiredPermission: string,
  handler: (req: NextRequest, session: SessionContext) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const session = await validateSessionFromRequest(request);

    if (!session) {
      return createErrorResponse('Unauthorized - No valid session', 401, 'UNAUTHORIZED');
    }

    // Check if user is SuperAdmin (has * permission)
    if (!session.permissions.includes('*') && !session.permissions.includes(requiredPermission)) {
      return createErrorResponse(
        `Forbidden - Permission "${requiredPermission}" required`,
        403,
        'FORBIDDEN'
      );
    }

    try {
      return await handler(request, session);
    } catch (error) {
      console.error('Error in protected route handler:', error);
      return createErrorResponse('Internal server error', 500, 'INTERNAL_ERROR');
    }
  };
}

/**
 * Middleware: Require specific role
 * Usage: const handler = withRole('SuperAdmin', async (req, session) => {...})
 */
export function withRole(
  requiredRole: string,
  handler: (req: NextRequest, session: SessionContext) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const session = await validateSessionFromRequest(request);

    if (!session) {
      return createErrorResponse('Unauthorized - No valid session', 401, 'UNAUTHORIZED');
    }

    if (!session.roles.includes(requiredRole)) {
      return createErrorResponse(
        `Forbidden - Role "${requiredRole}" required`,
        403,
        'FORBIDDEN'
      );
    }

    try {
      return await handler(request, session);
    } catch (error) {
      console.error('Error in protected route handler:', error);
      return createErrorResponse('Internal server error', 500, 'INTERNAL_ERROR');
    }
  };
}

/**
 * Helper: Create successful response
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
  meta?: any
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(meta && { meta }),
    },
    { status }
  );
}

/**
 * Utility: Verify tenant access (ensure user only accesses their own school data)
 */
export function verifyTenantAccess(
  session: SessionContext,
  requestedSchoolId: bigint
): boolean {
  return session.schoolId === requestedSchoolId;
}
