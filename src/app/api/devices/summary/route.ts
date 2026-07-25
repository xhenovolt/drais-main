/**
 * RETIRED — /api/devices/summary (410 Gone).
 *
 * Was UNAUTHENTICATED and UNSCOPED — device counts `FROM devices` across every
 * school. No callers. Use the authenticated, school-scoped device surfaces
 * under /api/attendance/* instead.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json(
    { success: false, error: 'This endpoint has been retired. Use the authenticated, school-scoped device APIs.' },
    { status: 410 },
  );
}
