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
  userId:              number;
  schoolId:            number;
  email:               string;
  firstName:           string;
  lastName:            string;
  isSuperAdmin:        boolean;
  /** FK → staff.id — null if this user is not linked to a staff record */
  staffId:             number | null;
  /** If true the user must change their password before doing anything else */
  mustChangePassword:  boolean;
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
        stf.id            AS staff_id,
        u.must_change_password,
        sc.status         AS school_status,
        EXISTS(
          SELECT 1 FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE ur.user_id = s.user_id
            AND (ur.school_id = s.school_id OR ur.school_id IS NULL)
            AND ur.is_active = TRUE
            AND r.is_super_admin = TRUE
            AND r.is_active = TRUE
        ) AS is_super_admin
      FROM sessions s
      JOIN  users u  ON u.id             = s.user_id
      LEFT JOIN staff stf
            ON stf.person_id = u.person_id
           AND stf.school_id = s.school_id
           AND stf.deleted_at IS NULL
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

    // Update last_activity_at in the background — non-blocking, never throws
    query(
      'UPDATE sessions SET last_activity_at = NOW() WHERE session_token = ? AND is_active = TRUE',
      [sessionToken]
    ).catch(() => {});

    return {
      userId:             Number(s.user_id),
      schoolId:           Number(s.school_id),
      email:              s.email || '',
      firstName:          s.first_name || '',
      lastName:           s.last_name || '',
      isSuperAdmin:       Boolean(s.is_super_admin),
      staffId:            s.staff_id ? Number(s.staff_id) : null,
      mustChangePassword: Boolean(s.must_change_password),
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
