import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logAudit, AuditAction } from '@/lib/audit';

const SESSION_COOKIE_NAME = 'drais_session';

/**
 * POST /api/auth/logout
 * Invalidates the current session and clears cookies
 */
export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    // Invalidate session in database if token exists
    if (sessionToken) {
      try {
        // Resolve the actor BEFORE invalidating, so logout is attributable (P2).
        const who = (await query(
          `SELECT user_id, school_id FROM sessions WHERE session_token = ? LIMIT 1`, [sessionToken],
        ).catch(() => [])) as any[];
        await query(
          `UPDATE sessions SET is_active = FALSE, updated_at = NOW() WHERE session_token = ?`,
          [sessionToken]
        );
        if (who[0]?.user_id) {
          void logAudit({
            schoolId: Number(who[0].school_id) || 0, userId: Number(who[0].user_id),
            action: AuditAction.LOGOUT, entityType: 'user', entityId: Number(who[0].user_id),
            ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null,
            userAgent: request.headers.get('user-agent'),
          });
        }
      } catch (dbError) {
        // Log but don't fail - we still want to clear the cookie
        console.error('Failed to invalidate session in database:', dbError);
      }
    }

    // Create response
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });

    // Clear all auth-related cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 0, // Expire immediately
    };

    // Clear session cookie
    response.cookies.set(SESSION_COOKIE_NAME, '', cookieOptions);
    
    // Clear school_id cookie
    response.cookies.set('drais_school_id', '', {
      ...cookieOptions,
      httpOnly: false,
    });

    // Clear role cookie
    response.cookies.set('drais_role', '', {
      ...cookieOptions,
      httpOnly: false,
    });

    // Clear legacy auth-token cookie (for backward compatibility)
    response.cookies.set('auth-token', '', cookieOptions);

    return response;

  } catch (error) {
    console.error('Logout error:', error);
    
    // Even on error, try to clear cookies
    const response = NextResponse.json(
      { 
        success: false, 
        error: { 
          message: 'An error occurred during logout',
          code: 'LOGOUT_ERROR'
        }
      },
      { status: 500 }
    );

    // Still clear cookies on error
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  }
}
