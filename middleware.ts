import { NextRequest, NextResponse } from 'next/server';

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
  '/api/health',
  '/api/feature-flags',
  // Internal JETON control APIs — authenticated via x-api-key header, NOT session cookie
  '/api/internal',
  // JETON external control channel — authenticated via x-api-key + x-api-secret headers
  '/api/control',
  // Cron jobs — authenticated via CRON_SECRET header
  '/api/cron',
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
 * If the user's role is NOT in the allowed list they get 403 / redirect.
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

  if (forceReset === '1' && !isSetPasswordPage && !isChangePasswordApi && !isLogoutApi) {
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
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};

