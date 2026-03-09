/**
 * src/middleware/setupLock.ts
 * Enforces school setup workflow
 * After login, if school.setup_complete = false, only specific routes are allowed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

// Routes allowed during school setup
const SETUP_ALLOWED_ROUTES = [
  '/dashboard',
  '/settings/school-setup',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/settings/school',
];

/**
 * Check if school setup is complete
 */
export async function checkSchoolSetup(
  schoolId: bigint
): Promise<boolean> {
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute<any[]>(
      'SELECT setup_complete FROM schools WHERE id = ?',
      [schoolId]
    );

    if (rows.length === 0) {
      throw new Error('School not found');
    }

    return Boolean(rows[0].setup_complete);
  } finally {
    await connection.end();
  }
}

/**
 * Check if route is allowed during setup
 */
function isAllowedDuringSetup(pathname: string): boolean {
  return SETUP_ALLOWED_ROUTES.some(route =>
    pathname === route ||
    pathname.startsWith(route + '?') ||
    pathname.startsWith(route + '/')
  );
}

/**
 * Middleware wrapper for setup lock
 * Must be called AFTER session validation
 */
export async function validateSetupStatus(
  request: NextRequest,
  schoolId: bigint,
  pathname: string
): Promise<NextResponse | null> {
  try {
    // Check if school setup is complete
    const setupComplete = await checkSchoolSetup(schoolId);

    // If setup is complete, allow all routes
    if (setupComplete) {
      return null; // No blockage
    }

    // Setup incomplete - check if route is allowed
    if (!isAllowedDuringSetup(pathname)) {
      // Return 403 with setup lock message
      if (pathname.startsWith('/api/')) {
        // API route - return JSON error
        return NextResponse.json(
          {
            success: false,
            error: {
              message: 'School setup is not complete. Please complete setup to access this feature.',
              code: 'SETUP_INCOMPLETE',
              setupComplete: false,
            },
          },
          { status: 403 }
        );
      } else {
        // Page route - redirect to setup page
        const setupUrl = new URL('/settings/school-setup', request.url);
        setupUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(setupUrl);
      }
    }

    // Route is allowed during setup
    return null; // No blockage
  } catch (error) {
    console.error('Error validating setup status:', error);
    // On error, allow the request (fail open to avoid breaking the flow)
    return null;
  }
}
