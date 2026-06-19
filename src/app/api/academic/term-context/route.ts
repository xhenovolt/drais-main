/**
 * GET /api/academic/term-context
 *
 * Canonical term context for the caller's school (the one resolver every
 * module should use). Returns current / effective / upcoming / previous
 * term, progress, and warnings (no current term, stale active, etc.).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveTermContext } from '@/lib/academic/term-resolver';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { maybeNotifyTermContext } from '@/lib/academic/term-notifications';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const policy = await resolveTimePolicy(session.schoolId);
    const ctx = await resolveTermContext(session.schoolId, policy.offsetMinutes);
    // Emit term notifications to this admin's bell (deduped daily, async).
    maybeNotifyTermContext(session.schoolId, session.userId, policy.offsetMinutes).catch(() => {});
    return NextResponse.json({ success: true, ...ctx });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to resolve term context', details: err?.message }, { status: 500 });
  }
}
