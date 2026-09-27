import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getFingerprintStatuses, statusToApi } from '@/lib/biometric/fingerprint-status';

export const runtime = 'nodejs';

/**
 * GET /api/staff/fingerprint-status
 *
 * Phase 2K — staff fingerprint status is first-class (the audit found
 * no staff status surface at all). Same shape as the student route:
 *   data:     number[] — staff ids whose punches resolve (active)
 *   statuses: Record<staffId, {...}> — full lifecycle detail
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const statuses = await getFingerprintStatuses(session.schoolId, 'staff');
    const usableIds: number[] = [];
    const statusMap: Record<number, unknown> = {};
    for (const [refId, s] of statuses) {
      if (s.usable) usableIds.push(refId);
      statusMap[refId] = statusToApi(s);
    }
    return NextResponse.json({ success: true, data: usableIds, statuses: statusMap });
  } catch (err: any) {
    console.error('[staff fingerprint-status] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch staff fingerprint status' }, { status: 500 });
  }
}
