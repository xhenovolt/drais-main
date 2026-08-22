/**
 * Session-based authentication helpers for multi-tenant school isolation.
 *
 * Every API route MUST use getSessionSchoolId() to derive the school_id
 * from the authenticated session — never from query params or request body.
 */
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getDbMode } from '@/lib/db/db-mode';

const SESSION_COOKIE_NAME = 'drais_session';

// The sessions.impersonated_by_control_user column is referenced in the hot
// session query below. Guarantee it exists (promise-gated, runs the ALTER
// once at runtime, then caches) BEFORE the query references it — otherwise a
// fresh deploy would reference a missing column and break every login.
let _impCol: Promise<void> | null = null;
function ensureImpersonationColumn(): Promise<void> {
  if (_impCol) return _impCol;
  _impCol = (async () => {
    try { await query(`ALTER TABLE sessions ADD COLUMN impersonated_by_control_user BIGINT DEFAULT NULL`, []); }
    catch { /* already exists — fine */ }
  })();
  return _impCol;
}

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
  // Offline branch — additive only, per docs/architecture/
  // DRAIS_V2_ARCHITECTURE_AUDIT.md §25a. Dynamic import, not static:
  // this file is loaded by ~every API route, including on hosted/
  // serverless where better-sqlite3 may not even be installed (it's an
  // optionalDependency) — a static import would pull it into every
  // request's module graph regardless of mode. Everything below this
  // block is completely unmodified from before this branch existed.
  if (getDbMode() === 'local-sqlite') {
    const { getOfflineSessionInfo } = await import('@/lib/repo/offline-auth/route-bridge');
    return getOfflineSessionInfo(request);
  }

  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionToken) return null;

    await ensureImpersonationColumn(); // guaranteed before the SELECT references it

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
        sc.id             AS school_row_id,
        sc.subscription_status   AS subscription_status,
        sc.subscription_end_date AS subscription_end_date,
        sc.trial_end_date        AS trial_end_date,
        EXISTS(
          /* Defense in depth: a user is super-admin if ANY role they hold
             has is_super_admin=TRUE, slug='super_admin', or name matches
             'super admin' (case-insensitive, trimmed). Slug is the canonical
             stable contract — production roles have historically been created
             with the flag forgotten (e.g. ALBAYAN role 180011). */
          SELECT 1 FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE ur.user_id = s.user_id
            AND (ur.school_id = s.school_id OR ur.school_id IS NULL)
            AND ur.is_active = TRUE
            AND r.is_active  = TRUE
            AND (
                  r.is_super_admin = TRUE
               OR LOWER(r.slug) = 'super_admin'
               OR LOWER(TRIM(r.name)) IN ('super admin', 'superadmin')
            )
        ) AS is_super_admin,
        s.impersonated_by_control_user AS impersonated_by_control_user
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

    // Block a soft-deleted school: the session names a school_id but it no
    // longer resolves to a live (non-deleted) row via the join above.
    if (s.school_id && !s.school_row_id) {
      console.warn(`[Auth] SCHOOL_DELETED: school_id=${s.school_id} blocked — school is soft-deleted`);
      return null;
    }

    // Block suspended or archived schools on every protected request
    if (s.school_status === 'suspended' || s.school_status === 'archived') {
      console.warn(`[Auth] SCHOOL_${String(s.school_status).toUpperCase()}: school_id=${s.school_id} blocked — reactivate to restore access`);
      return null;
    }

    // Block expired subscriptions on every protected request. Open-ended
    // active accounts (no end date) are never blocked here. Treating a blocked
    // session like an invalid one sends the user to /login, which states why.
    {
      const now = Date.now();
      const subEnd   = s.subscription_end_date ? new Date(s.subscription_end_date).getTime() : null;
      const trialEnd = s.trial_end_date ? new Date(s.trial_end_date).getTime() : null;
      const ss = s.subscription_status;
      const expired =
        ss === 'expired' ||
        ss === 'inactive' ||
        (ss === 'active' && subEnd != null && subEnd < now) ||
        (ss === 'trial'  && trialEnd != null && trialEnd < now);
      if (expired) {
        console.warn(`[Auth] SUBSCRIPTION_EXPIRED: school_id=${s.school_id} blocked — renew to restore access`);
        return null;
      }
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
      // A Control-Center impersonation is minted only by a verified Xhenvolt
      // super-admin, so it carries full access regardless of the operated-as
      // user's own roles — that's the point of "operate the school fully".
      isSuperAdmin:       Boolean(s.is_super_admin) || s.impersonated_by_control_user != null,
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
