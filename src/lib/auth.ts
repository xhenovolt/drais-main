/**
 * Session-based authentication helpers for multi-tenant school isolation.
 * 
 * Every API route MUST use getSessionSchoolId() to derive the school_id
 * from the authenticated session — never from query params or request body.
 */
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';

const SESSION_COOKIE_NAME = 'drais_session';

export interface SessionInfo {
  userId: number;
  schoolId: number;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
}

/**
 * Extract and validate the authenticated user's school_id from their session cookie.
 * Returns SessionInfo with the TRUSTED school_id, or null if not authenticated.
 * 
 * Usage in API routes:
 *   const session = await getSessionSchoolId(request);
 *   if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
 *   const schoolId = session.schoolId;  // TRUSTED — derived from DB session
 */
export async function getSessionSchoolId(request: NextRequest): Promise<SessionInfo | null> {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionToken) return null;

    const sessions: any = await query(
      `SELECT
        s.user_id,
        s.school_id,
        u.email,
        u.first_name,
        u.last_name,
        sc.status AS school_status
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN schools sc ON s.school_id = sc.id AND sc.deleted_at IS NULL
      WHERE s.session_token = ?
        AND s.is_active = TRUE
        AND s.expires_at > NOW()
        AND u.deleted_at IS NULL
      LIMIT 1`,
      [sessionToken]
    );

    if (!sessions || sessions.length === 0) return null;

    const s = sessions[0];

    // Block suspended schools on every protected request
    if (s.school_status === 'suspended') {
      console.warn(`[Auth] SCHOOL_SUSPENDED: school_id=${s.school_id} blocked — all requests rejected until reactivated`);
      return null;
    }

    return {
      userId: Number(s.user_id),
      schoolId: Number(s.school_id),
      email: s.email || '',
      firstName: s.first_name || '',
      lastName: s.last_name || '',
      isSuperAdmin: false, // Determined by roles table, not a column
    };
  } catch (error) {
    console.error('[Auth] Session validation error:', error);
    return null;
  }
}

/**
 * Require authentication — returns SessionInfo or throws.
 * Convenience wrapper that returns a 401-appropriate error message.
 */
export async function requireSession(request: NextRequest): Promise<SessionInfo> {
  const session = await getSessionSchoolId(request);
  if (!session) {
    throw new Error('NOT_AUTHENTICATED');
  }
  return session;
}
