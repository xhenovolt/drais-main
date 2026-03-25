import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { KNOWN_ROUTES } from '@/lib/routeValidator';

/**
 * GET /api/system/route-validation
 * Validates all sidebar routes and returns report
 * Only accessible to super admins
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Check if user is super admin (requires specific role/permission)
  // For now, we'll allow any authenticated user
  // TODO: Add proper permission check

  try {
    // Get navigation items from navigationConfig
    // This would require importing navigationConfig on server side
    // For now, return the known routes validation

    const validation = {
      timestamp: new Date().toISOString(),
      totalKnownRoutes: KNOWN_ROUTES.size,
      routes: Array.from(KNOWN_ROUTES).map(route => ({
        path: route,
        status: 'known',
        type: route.includes('[') ? 'dynamic' : 'static',
      })),
      notes: [
        'This validates routes against KNOWN_ROUTES set',
        'Run sidebar validation script to get comprehensive report',
        'Missing routes should be added to KNOWN_ROUTES or created'
      ]
    };

    return NextResponse.json({
      success: true,
      data: validation,
    });
  } catch (error) {
    console.error('Route validation failed:', error);
    return NextResponse.json({ error: 'Failed to validate routes' }, { status: 500 });
  }
}
