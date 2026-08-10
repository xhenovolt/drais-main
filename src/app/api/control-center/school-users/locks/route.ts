/**
 * Control Center — locked school accounts.
 *
 *   GET  → every school user currently locked, or with failures in the window
 *   POST → { userId, action: 'unlock' | 'lock', minutes?, reason? }
 *
 * WHY THIS EXISTS
 * ---------------
 * Phase 2 gave school logins a real lockout. A cooldown that only time can
 * clear would mean a bursar locked out at 08:00 on results day waits it out
 * with no recourse, and the founder gets a phone call — exactly the dependency
 * this programme is meant to remove. This is the administrative path: see who
 * is locked, and clear it.
 *
 * It also supports deliberate locking, for the case where a school reports a
 * compromised or departed account and needs it stopped immediately rather than
 * waiting for someone with school-level rights to be available.
 *
 * AUTHORIZATION
 * -------------
 * Control Center is its own auth domain (drais_control), NOT school
 * permissions. Reading requires `platform.view`; changing a lock requires
 * `schools.manage` — the same right that already governs a school's status,
 * modules and subscription, since this is the same class of action.
 *
 * Every mutation is written to control_audit_logs with the operator, the
 * target, the reason and the origin IP.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { setAccountLock, ensureLockoutColumn, LOCKOUT_WINDOW_MIN } from '@/lib/auth/login-lockout';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const operator = await getControlSession(req);
  if (!operator) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(operator.role, 'platform.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await ensureLockoutColumn();

  const rows = (await query(
    `SELECT u.id,
            u.email,
            TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS name,
            u.school_id,
            s.name                        AS school_name,
            u.status,
            COALESCE(u.failed_login_attempts, 0) AS failed_attempts,
            u.locked_until,
            u.last_failed_login_at,
            u.last_login_at,
            (u.locked_until IS NOT NULL AND u.locked_until > NOW()) AS is_locked,
            GREATEST(COALESCE(TIMESTAMPDIFF(SECOND, NOW(), u.locked_until), 0), 0) AS retry_after_sec
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
      WHERE u.deleted_at IS NULL
        AND (
              (u.locked_until IS NOT NULL AND u.locked_until > NOW())
           OR (COALESCE(u.failed_login_attempts,0) > 0
               AND u.last_failed_login_at > DATE_SUB(NOW(), INTERVAL ? MINUTE))
            )
      ORDER BY is_locked DESC, u.last_failed_login_at DESC
      LIMIT 200`,
    [LOCKOUT_WINDOW_MIN],
  ).catch(() => [])) as any[];

  return NextResponse.json({
    success: true,
    windowMinutes: LOCKOUT_WINDOW_MIN,
    rows: rows.map((r) => ({
      ...r,
      is_locked: Number(r.is_locked) === 1,
      failed_attempts: Number(r.failed_attempts || 0),
      retry_after_sec: Number(r.retry_after_sec || 0),
    })),
  });
}

export async function POST(req: NextRequest) {
  const operator = await getControlSession(req);
  if (!operator) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(operator.role, 'schools.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const userId = Number(body?.userId);
  const action = String(body?.action || '');
  const reason = String(body?.reason || '').slice(0, 500) || null;

  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }
  if (action !== 'unlock' && action !== 'lock') {
    return NextResponse.json({ error: "action must be 'unlock' or 'lock'" }, { status: 400 });
  }

  const found = (await query(
    `SELECT id, email, school_id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [userId],
  ).catch(() => [])) as any[];
  if (!found.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  let until: Date | null = null;
  if (action === 'lock') {
    // Bounded on purpose. An open-ended lock set from here would be a way to
    // disable an account without it appearing in the school's own user
    // management, where staff would look first.
    const minutes = Math.min(Math.max(Number(body?.minutes) || 60, 1), 60 * 24 * 7);
    until = new Date(Date.now() + minutes * 60_000);
  }

  await setAccountLock(userId, until);

  await controlAudit(
    operator.id,
    action === 'unlock' ? 'school_user.unlock' : 'school_user.lock',
    `user:${userId}`,
    { email: found[0].email, schoolId: found[0].school_id, reason, until: until?.toISOString() ?? null },
    clientIp(req),
  );

  return NextResponse.json({
    success: true,
    action,
    userId,
    lockedUntil: until?.toISOString() ?? null,
  });
}
