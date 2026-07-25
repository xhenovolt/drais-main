/**
 * RETIRED — /api/devices/list (410 Gone).
 *
 * Was UNAUTHENTICATED and UNSCOPED — `SELECT ... FROM devices` with no
 * `school_id` filter, returning every school's hardware to any caller. It had
 * no callers. The tenant device list is the authenticated, school-scoped
 * `GET /api/attendance/zk/devices`.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json(
    { success: false, error: 'This endpoint has been retired. Use GET /api/attendance/zk/devices (authenticated, school-scoped).' },
    { status: 410 },
  );
}
