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

/**
 * /api/auth/me's offline branch. This is the piece that was still missing
 * for the global mode switch (Phase 7 sub-effort 22): the login route and
 * getSessionSchoolId() were already mode-aware, but the global AuthContext
 * — mounted on every page, including inside the Offline Workspace, because
 * it wraps the whole app at the root layout — calls /api/auth/me on every
 * mount to resolve `user`. That route used to call src/lib/db.ts's query()
 * unconditionally; in local-sqlite mode that throws immediately (pools.ts's
 * assertMysqlMode), which AuthContext's own try/catch turns into "treat as
 * logged out" — meaning a real, valid offline session got silently kicked
 * back to /login on every single page. This closes that gap.
 *
 * Shape matches /api/auth/me's real response closely enough that
 * AuthContext's `User`/`School` consumers (Topbar, Sidebar, ProfileDropdown)
 * don't hit an undefined field they unconditionally read — `permissions`
 * is the one deliberately simplified value (no offline PermissionRepo
 * exists yet): super-admins get `['*']` (matches online's own shortcut for
 * that role exactly), everyone else gets `[]` rather than a guess.
 */
export async function handleOfflineMe(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, error: { message: 'Not authenticated', code: 'NOT_AUTHENTICATED' } },
      { status: 401 },
    );
  }

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  const session = await validateOfflineSession(db, repos, token);
  if (!session) {
    return NextResponse.json(
      { success: false, error: { message: 'Session expired or invalid', code: 'SESSION_EXPIRED' } },
      { status: 401 },
    );
  }

  const [user, school] = await Promise.all([
    repos.users.findById(session.schoolId, session.userId),
    repos.schools.findById(session.schoolId),
  ]);
  if (!user || !school) {
    return NextResponse.json(
      { success: false, error: { message: 'Session expired or invalid', code: 'SESSION_EXPIRED' } },
      { status: 401 },
    );
  }

  const { roleNames, isSuperAdmin } = await resolveOfflineUserRoles(repos, session.schoolId, user.id);

  return NextResponse.json({
    success: true,
    setupComplete: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      phone: user.phone ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
      schoolId: session.schoolId,
      schoolName: school.name,
      school: {
        id: school.id,
        name: school.name,
        email: school.email ?? undefined,
        phone: school.phone ?? undefined,
        address: school.address ?? undefined,
        logoUrl: school.logoUrl ?? undefined,
        currency: school.currency,
        setupComplete: true,
      },
      setupComplete: true,
      roles: roleNames,
      permissions: isSuperAdmin ? ['*'] : [],
      isSuperAdmin,
    },
  });
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
  // Same fields handleOfflineMe returns, composed here too — AuthContext's
  // login() sets `user` directly from THIS response, not from a follow-up
  // /api/auth/me call, so leaving these off here would mean the chrome only
  // gets a complete user object after the next page's mount-time recheck.
  const school = await repos.schools.findById(schoolId);

  const response = NextResponse.json({
    success: true,
    setupComplete: true,
    user: {
      id: result.user.id, email: result.user.email, firstName: result.user.firstName, lastName: result.user.lastName,
      displayName: `${result.user.firstName} ${result.user.lastName}`.trim() || result.user.email,
      schoolId, schoolName: school?.name ?? null,
      school: school ? {
        id: school.id, name: school.name, email: school.email ?? undefined, phone: school.phone ?? undefined,
        address: school.address ?? undefined, logoUrl: school.logoUrl ?? undefined, currency: school.currency,
        setupComplete: true,
      } : null,
      setupComplete: true,
      roles: roleNames, isSuperAdmin, mustChangePassword: result.user.mustChangePassword,
      permissions: isSuperAdmin ? ['*'] : [],
    },
    mustChangePassword: result.user.mustChangePassword,
  });

  response.cookies.set(SESSION_COOKIE_NAME, result.session.sessionToken, COOKIE_OPTIONS);
  response.cookies.set('drais_school_id', String(schoolId), { ...COOKIE_OPTIONS, httpOnly: false });
  response.cookies.set('drais_role', primaryRole, { ...COOKIE_OPTIONS, httpOnly: false });

  return response;
}
