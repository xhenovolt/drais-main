/**
 * Parent-portal session layer. DELIBERATELY separate from staff auth
 * (src/lib/auth.ts). A parent token lives in its own cookie and its own
 * table — it can never satisfy getSessionSchoolId() and a staff token can
 * never satisfy requireParent(). No shared path = no privilege confusion.
 */
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { query } from '@/lib/db';

export const PARENT_COOKIE_NAME = 'drais_parent_session';
// Long-lived so a parent who has verified a device via OTP stays signed in and
// isn't repeatedly bounced to the login screen. A brand-new device still needs
// one OTP; after that it's remembered for ~3 months.
const EXPIRY_DAYS = 90;

export interface ParentSession {
  parentAccountId: number;
  phone:           string;
  fullName:        string | null;
  /** The single active tenant context. Null until the parent picks a school. */
  activeSchoolId:  number | null;
  sessionToken:    string;
}

export function newParentToken(): string {
  return randomBytes(48).toString('hex');
}

export function parentCookieOptions() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path:     '/',
    maxAge:   EXPIRY_DAYS * 24 * 60 * 60,
  };
}

export async function createParentSession(
  parentAccountId: number,
  ip: string | null,
  userAgent: string | null,
): Promise<string> {
  const token = newParentToken();
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO parent_sessions
       (parent_account_id, session_token, expires_at, ip_address, user_agent, last_activity_at, is_active)
     VALUES (?, ?, ?, ?, ?, NOW(), TRUE)`,
    [parentAccountId, token, expiresAt, ip, userAgent],
  );
  return token;
}

/**
 * Resolve the parent session from the request cookie. Returns null if absent,
 * expired, revoked, or the account is suspended. Never throws.
 */
export async function getParentSession(req: NextRequest): Promise<ParentSession | null> {
  try {
    const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
    if (!token) return null;

    const rows = (await query(
      `SELECT ps.parent_account_id,
              ps.active_school_id,
              ps.session_token,
              pa.phone,
              pa.full_name,
              pa.status AS account_status
         FROM parent_sessions ps
         JOIN parent_accounts pa ON pa.id = ps.parent_account_id
        WHERE ps.session_token = ?
          AND ps.is_active = TRUE
          AND ps.expires_at > NOW()
        LIMIT 1`,
      [token],
    )) as any[];

    if (!rows.length) return null;
    const r = rows[0];
    if (r.account_status === 'suspended') return null;

    query(
      `UPDATE parent_sessions SET last_activity_at = NOW() WHERE session_token = ?`,
      [token],
    ).catch(() => {});

    return {
      parentAccountId: Number(r.parent_account_id),
      phone:           r.phone,
      fullName:        r.full_name ?? null,
      activeSchoolId:  r.active_school_id == null ? null : Number(r.active_school_id),
      sessionToken:    r.session_token,
    };
  } catch (e) {
    console.error('[portal] session validation error', e);
    return null;
  }
}

export async function destroyParentSession(token: string): Promise<void> {
  await query(
    `UPDATE parent_sessions SET is_active = FALSE WHERE session_token = ?`,
    [token],
  );
}

/** Set the active school context for this session (must be one the parent has an active link in). */
export async function setActiveSchool(sessionToken: string, schoolId: number): Promise<void> {
  await query(
    `UPDATE parent_sessions SET active_school_id = ? WHERE session_token = ?`,
    [schoolId, sessionToken],
  );
}
