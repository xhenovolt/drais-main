/**
 * RETIRED — /api/attendance/zk/live (410 Gone).
 *
 * Took `school_id` from a QUERY PARAM (defaulting to 1), i.e. a param-injectable
 * cross-tenant read of any school's live attendance. It had no callers. The live
 * feeds the UI actually uses are the session-scoped `/api/attendance/live-identity`
 * and `/api/attendance/live-scan` (WHERE school_id = session.schoolId).
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json(
    { success: false, error: 'This endpoint has been retired. Use /api/attendance/live-identity (authenticated, session-scoped).' },
    { status: 410 },
  );
}
