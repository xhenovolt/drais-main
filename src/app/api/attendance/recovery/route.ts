/**
 * Attendance Recovery Center API (Phase 6).
 *   GET                    → per-device gap detection + recommended recovery
 *   GET ?banner=1          → worst status only (cheap inline poll)
 *   POST { action:'retry_queue' } → drain the notification outbox now
 * The heavy recovery actions (LAN pull, commit) are performed by the existing
 * Device Control wizard; this endpoint diagnoses, routes, and does the one
 * safe self-service action (queue retry).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { detectGaps } from '@/lib/attendance/recovery';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const report = await detectGaps(session.schoolId);
    if (new URL(req.url).searchParams.get('banner')) {
      const worst = report.devices.filter(d => d.verdict.status === 'gap')
        .sort((a, b) => a.got_today - b.got_today)[0] || null;
      return NextResponse.json({ success: true, gap: worst, gaps: report.summary.gaps });
    }
    return NextResponse.json({ success: true, ...report });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Recovery scan failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'attendance.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const b = await req.json().catch(() => null);
  if (b?.action === 'retry_queue') {
    const { drainNotificationOutbox } = await import('@/lib/notifications/drain');
    const result = await drainNotificationOutbox();
    return NextResponse.json({ success: true, result });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
