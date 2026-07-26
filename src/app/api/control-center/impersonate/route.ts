/**
 * Control-plane impersonation API.
 *   POST   { school_id }  → start operating as the school (sets the school
 *          session cookies + role, audited). Control super-admin only.
 *   DELETE                → end impersonation, clear the school session,
 *          return to /control.
 *
 * Sets the SAME cookies the school login sets (drais_session +
 * drais_school_id + drais_role) so the entire school app — every route,
 * module and data view — works exactly as if the school admin had logged in.
 * The drais_control cookie is untouched, so Exit returns cleanly to /control.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getControlSession, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { startImpersonation, endImpersonation } from '@/lib/control/impersonation';

export const runtime = 'nodejs';

const SESSION_COOKIE = 'drais_session';
const sessionCookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 2 * 60 * 60 };
const readableOpts = { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 2 * 60 * 60 };

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'impersonate')) return NextResponse.json({ error: 'You do not have permission to impersonate' }, { status: 403 });

  const b = await req.json().catch(() => null);
  const schoolId = Number(b?.school_id);
  if (!Number.isFinite(schoolId)) return NextResponse.json({ error: 'school_id is required' }, { status: 400 });

  const res = await startImpersonation({
    controlUserId: user.id, controlUserName: user.name, schoolId,
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  });
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });

  // Determine the impersonated user's primary role for the middleware cookie.
  const roleRows = (await query(
    `SELECT r.name FROM sessions s
       JOIN user_roles ur ON ur.user_id = s.user_id AND ur.is_active = TRUE
       JOIN roles r ON r.id = ur.role_id
      WHERE s.session_token = ?
      ORDER BY (r.name='super_admin') DESC, (r.name='admin') DESC LIMIT 1`,
    [res.token],
  ).catch(() => [])) as any[];
  const role = roleRows[0]?.name || 'admin';

  const out = NextResponse.json({ success: true, school: res.schoolName, operating_as: res.targetUser, redirect: '/dashboard' });
  out.cookies.set(SESSION_COOKIE, res.token!, sessionCookieOpts);
  out.cookies.set('drais_school_id', String(schoolId), readableOpts);
  out.cookies.set('drais_role', role, readableOpts);
  return out;
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  await endImpersonation(token, clientIp(req));
  const out = NextResponse.json({ success: true, redirect: '/control' });
  for (const c of [SESSION_COOKIE, 'drais_school_id', 'drais_role']) {
    out.cookies.set(c, '', { ...sessionCookieOpts, maxAge: 0, httpOnly: c === SESSION_COOKIE });
  }
  return out;
}
