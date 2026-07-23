/**
 * GET /api/attendance/founder-independence — the Phase 10 before/after report:
 * each attendance workflow, its Phase-0 founder-dependence baseline, what it
 * is now, and the DRAIS surface that handles it. Read-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { buildReport } from '@/lib/attendance/founder-independence';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json({ success: true, ...(await buildReport(session.schoolId)) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
