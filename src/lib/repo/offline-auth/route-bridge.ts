/**
 * @drais/repo — the actual glue between live routes and offline-auth.
 *
 * This is the ONLY file src/lib/auth.ts / the login route import from —
 * and they do it via a dynamic `await import()`, never a static import
 * (see those files' own comments on why: better-sqlite3 must never load
 * into a request that isn't actually in local-sqlite mode, since it's an
 * optionalDependency that may not even be installed on a hosted/
 * serverless deployment — a static import here would defeat that).
 *
 * Everything this file calls (login.ts, session-validate.ts, install.ts,
 * sqlite/singleton.ts) already exists and is independently tested —
 * sub-efforts 6-10. This file's own job is narrow: adapt those pure
 * functions to NextRequest/NextResponse and the same three cookies
 * (drais_session, drais_school_id, drais_role) the online login route and
 * middleware.ts already agree on — middleware.ts does no DB work of its
 * own ("Full session validation happens in API routes... optimal for
 * Vercel Edge Runtime" — its own comment), so setting those cookies
 * correctly here is what makes route protection keep working for a
 * locally-authenticated user with zero middleware changes.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { SessionInfo } from '@/lib/auth';
import { getSqliteDb } from '../sqlite/singleton';
import { createSqliteRepos } from '../sqlite';
import { getLocalInstallSchoolId, LocalInstallSchoolError } from './install';
import { attemptOfflineLogin, type OfflineLoginFailureCode } from './login';
import { validateOfflineSession, resolveOfflineUserRoles } from './session-validate';

const SESSION_COOKIE_NAME = 'drais_session'; // must match src/lib/auth.ts's own constant exactly
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days — matches the online route's SESSION_CONFIG
};

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || '127.0.0.1';
}

/** getSessionSchoolId()'s offline branch. */
export async function getOfflineSessionInfo(request: NextRequest): Promise<SessionInfo | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  return validateOfflineSession(db, repos, token);
}

const STATUS_FOR_CODE: Record<OfflineLoginFailureCode, number> = {
  INVALID_CREDENTIALS: 401,
  ACCOUNT_PENDING: 403,
  ACCOUNT_INACTIVE: 403,
  SCHOOL_SUSPENDED: 403,
  SUBSCRIPTION_EXPIRED: 402,
};

const MESSAGE_FOR_CODE: Record<OfflineLoginFailureCode, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  ACCOUNT_PENDING: 'Your account is pending approval. Please contact your administrator.',
  ACCOUNT_INACTIVE: 'Your account has been deactivated. Please contact your administrator.',
  SCHOOL_SUSPENDED: 'Your school account is suspended. Contact administrator.',
  SUBSCRIPTION_EXPIRED: 'Your DRAIS subscription has expired. Please renew to regain access — contact Xhenvolt or your administrator.',
};

/** The login route's offline branch. */
export async function handleOfflineLogin(request: NextRequest): Promise<NextResponse> {
  let body: { email?: string; password?: string } = {};
  try { body = await request.json(); } catch { /* empty */ }
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: { message: 'Email and password are required', code: 'MISSING_CREDENTIALS' } },
      { status: 400 },
    );
  }

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);

  let schoolId: number;
  try {
    schoolId = getLocalInstallSchoolId(db);
  } catch (err) {
    if (err instanceof LocalInstallSchoolError) {
      return NextResponse.json({ success: false, error: { message: err.message, code: err.code } }, { status: 500 });
    }
    throw err;
  }

  const result = await attemptOfflineLogin(db, repos, {
    email, password, schoolId, ip: getClientIp(request), userAgent: request.headers.get('user-agent'),
  });

  if (!result.ok) {
    const headers: Record<string, string> = 'retryAfterSec' in result && result.retryAfterSec
      ? { 'Retry-After': String(result.retryAfterSec) } : {};
    return NextResponse.json(
      { success: false, error: { message: MESSAGE_FOR_CODE[result.code], code: result.code } },
      { status: STATUS_FOR_CODE[result.code], headers },
    );
  }

  const { roleNames, isSuperAdmin } = await resolveOfflineUserRoles(repos, schoolId, result.user.id);
  const primaryRole = roleNames[0] ?? (isSuperAdmin ? 'Admin' : 'Staff');

  const response = NextResponse.json({
    success: true,
    user: {
      id: result.user.id, email: result.user.email, firstName: result.user.firstName, lastName: result.user.lastName,
      displayName: `${result.user.firstName} ${result.user.lastName}`.trim() || result.user.email,
      schoolId, roles: roleNames, isSuperAdmin, mustChangePassword: result.user.mustChangePassword,
    },
    mustChangePassword: result.user.mustChangePassword,
  });

  response.cookies.set(SESSION_COOKIE_NAME, result.session.sessionToken, COOKIE_OPTIONS);
  response.cookies.set('drais_school_id', String(schoolId), { ...COOKIE_OPTIONS, httpOnly: false });
  response.cookies.set('drais_role', primaryRole, { ...COOKIE_OPTIONS, httpOnly: false });

  return response;
}
