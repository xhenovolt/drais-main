import { NextRequest, NextResponse } from 'next/server';
import { NON_SCHOOL_AUTH_PREFIXES } from '@/lib/routes/auth-scope';
import { shouldEnforceForcedPasswordReset } from '@/lib/auth/password-reset-policy';

/**
 * DRAIS V1 Middleware
 * Handles session-based authentication and route protection
 */

// ============================================
// ROUTE CONFIGURATION
// ============================================

/**
 * Routes that are publicly accessible (don't require authentication)
 */
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/auth/login',
  '/auth/signup',
  '/forgot-password',
  '/reset-password',
  '/unauthorized',
  '/forbidden',
  '/server-error',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  // Reads only the caller's own session cookie; safe public (returns
  // impersonating:false when there's no session). Drives the control banner.
  '/api/auth/impersonation-status',
  '/api/health',
  '/api/feature-flags',
  // Every surface owned by a DIFFERENT auth domain (Control Center, parent
  // portal) or authenticated per-request by key/token rather than a session
  // cookie. Single source of truth — see src/lib/routes/auth-scope.ts for why
  // this must not be re-listed by hand.
  ...NON_SCHOOL_AUTH_PREFIXES,
];

/**
 * Routes allowed during school setup (when setup_complete = false)
 */
const SETUP_ALLOWED_ROUTES = [
  '/dashboard',
  '/settings/school-setup',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/settings/school',
  '/api/settings/school-setup',
];

/**
 * Session cookie name
 */
const SESSION_COOKIE_NAME = 'drais_session';

// ============================================
// RBAC ROUTE GUARDS
// Role checks use the `drais_role` cookie set at login.
// This is Edge-compatible (no DB calls needed).
// ============================================

/**
 * Routes that require specific roles.
 *
 * ⚠️ THIS IS A UX GATE, NOT A SECURITY BOUNDARY. DO NOT TREAT IT AS ONE.
 *
 * The check below reads the `drais_role` cookie, which login sets with
 * `httpOnly: false` — deliberately, because middleware runs on the Edge runtime
 * and cannot open a database connection to resolve the real role. Anything the
 * browser can read, the browser can rewrite: `document.cookie = 'drais_role=Admin'`
 * passes every guard in this list.
 *
 * That is acceptable ONLY because it is not the thing standing between a user
 * and a privileged action. Authorization is enforced inside the route handlers
 * against the server-side session, via `checkPermission` / `checkAnyPermission`
 * from `src/lib/rbac.ts`, which resolve the user's real roles from the database
 * on every request and cannot be influenced by a cookie.
 *
 * What this list actually buys: a user who is not an administrator gets a clean
 * redirect instead of a page that loads and then 403s on every fetch.
 *
 * ➜ Adding a route here does NOT protect it. Add the permission check in the
 *   handler. Phase 1 (2026-08) closed 20 such handlers across 15 routes that
 *   were relying on this list alone.
 */
const ROLE_PROTECTED: { prefix: string; roles: string[] }[] = [
  { prefix: '/admin/users',   roles: ['Admin', 'Super Admin'] },
  { prefix: '/finance',       roles: ['Admin', 'Super Admin', 'Bursar'] },
  { prefix: '/api/admin',     roles: ['Admin', 'Super Admin'] },
  { prefix: '/api/finance',   roles: ['Admin', 'Super Admin', 'Bursar'] },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a route is public (doesn't require authentication)
 */
function isPublicRoute(pathname: string): boolean {
  // Exact matches or prefix matches
  if (PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return true;
  }

  // Prefix matches for auth routes
  if (pathname.startsWith('/auth/')) {
    return true;
  }

  // Static files
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname.includes('.') // Files with extensions
  ) {
    return true;
  }

  return false;
}

/**
 * Check if a route is allowed during school setup
 */
function isAllowedDuringSetup(pathname: string): boolean {
  return SETUP_ALLOWED_ROUTES.some(route =>
    pathname === route ||
    pathname.startsWith(route + '/') ||
    pathname.startsWith(route + '?')
  );
}

/**
 * Create redirect response
 */
function createRedirect(request: NextRequest, destination: string, preserveQuery = false): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = destination;
  
  if (!preserveQuery) {
    url.search = '';
  }
  
  // Add redirect parameter for returning after login
  if (destination === '/login') {
    const currentPath = request.nextUrl.pathname;
    if (currentPath !== '/' && !isPublicRoute(currentPath)) {
      url.searchParams.set('redirect', currentPath);
    }
  }
  
  return NextResponse.redirect(url);
}

/**
 * Create JSON error response for API routes
 */
function createApiError(message: string, code: string, status: number): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: { message, code },
    },
    { status }
  );
}

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Main middleware function
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');

  // ========================================
  // 1. ALLOW PUBLIC ROUTES
  // ========================================
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // ========================================
  // 2. CHECK SESSION
  // ========================================
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    // No session - redirect to login or return 401 for API
    if (isApiRoute) {
      return createApiError('Unauthorized', 'UNAUTHORIZED', 401);
    }
    return createRedirect(request, '/login');
  }

  // ========================================
  // 3a. AUTHENTICATED USER ON AUTH PAGES
  // ========================================
  // If the user is already logged in, redirect them away from auth pages
  const authOnlyPaths = ['/login', '/signup', '/auth/login', '/auth/signup'];
  if (authOnlyPaths.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // ========================================
  // 3b. FORCE PASSWORD RESET CHECK
  // ========================================
  const forceReset = request.cookies.get('drais_force_reset')?.value;
  const isSetPasswordPage = pathname === '/auth/set-password';
  const isChangePasswordApi = pathname === '/api/auth/change-password';
  const isLogoutApi = pathname === '/api/auth/logout';

  const enforceForcedReset = shouldEnforceForcedPasswordReset();
  if (enforceForcedReset && forceReset === '1' && !isSetPasswordPage && !isChangePasswordApi && !isLogoutApi) {
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: { message: 'Password change required', code: 'PASSWORD_RESET_REQUIRED' } },
        { status: 403 }
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = '/auth/set-password';
    url.search   = '';
    return NextResponse.redirect(url);
  }

  // ========================================
  // 4. RBAC — ROLE-BASED ROUTE PROTECTION
  // ========================================
  const userRole = request.cookies.get('drais_role')?.value ?? '';

  for (const guard of ROLE_PROTECTED) {
    if (pathname.startsWith(guard.prefix)) {
      const allowed = guard.roles.some(r => r.toLowerCase() === userRole.toLowerCase());
      if (!allowed) {
        if (isApiRoute) {
          return NextResponse.json(
            { success: false, error: { message: 'Forbidden', code: 'INSUFFICIENT_ROLE' } },
            { status: 403 },
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = '/unauthorized';
        url.search   = '';
        return NextResponse.redirect(url);
      }
      break; // first match wins
    }
  }

  // ========================================
  // 3b. SESSION EXISTS - ALLOW REQUEST
  // ========================================
  // Note: Full session validation happens in API routes
  // The middleware only checks for cookie presence
  // This is optimal for Vercel Edge Runtime which has DB limitations
  
  // Add session info to request headers for downstream handlers
  const response = NextResponse.next();
  
  // Pass school_id from cookie to header for multi-tenant isolation
  const schoolId = request.cookies.get('drais_school_id')?.value;
  if (schoolId) {
    response.headers.set('x-school-id', schoolId);
  }

  return response;
}

// ============================================
// MIDDLEWARE CONFIG
// ============================================

/**
 * Configure which routes the middleware runs on
 * Excludes static files and Next.js internals
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     * - iclock/ + api/zk-handler — ZKTeco ADMS device traffic. Excluded at the
     *   matcher so the middleware never even runs for an attendance device.
     *   The PUBLIC_ROUTES entry would be enough, but this path must not be one
     *   list edit away from breaking again: a device that receives a redirect
     *   drops the batch, and the loss is silent — no error surfaces anywhere in
     *   the app, attendance simply stops arriving. Belt and braces is correct
     *   here. See src/lib/routes/auth-scope.ts for the protocol reasoning.
     */
    '/((?!_next/static|_next/image|favicon.ico|public/|iclock/|api/zk-handler).*)',
  ],
};

