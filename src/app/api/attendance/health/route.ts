/**
 * GET /api/attendance/health — the Attendance Health Center feed.
 * Runs all ten pipeline checks live and returns the weighted overall score,
 * per-check cards and ordered recommendations. No SQL needed to diagnose
 * attendance — this endpoint IS the diagnosis.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { runHealthChecks } from '@/lib/attendance/health';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const report = await runHealthChecks(session.schoolId);
    return NextResponse.json({ success: true, ...report });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Health check failed' }, { status: 500 });
  }
}
