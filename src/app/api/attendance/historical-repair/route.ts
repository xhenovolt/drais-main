/**
 * Historical Repair API (Phase E) — self-service re-evaluation of a past span.
 *   POST { action:'reevaluate_range', from, to, role?, person_id? }
 * Rebuilds verdicts from the immutable raw events (never edits them).
 * Bounded (≤92 days) + audited. Requires attendance.manage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { reevaluateRange, planRange } from '@/lib/attendance/historical-repair';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'attendance.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const b = await req.json().catch(() => null);
  if (b?.action !== 'reevaluate_range') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  const plan = planRange(String(b.from || ''), String(b.to || ''));
  if (!plan.ok) return NextResponse.json({ error: plan.reason }, { status: 400 });

  try {
    const res = await reevaluateRange({
      schoolId: session.schoolId, from: plan.from!, to: plan.to!,
      role: b.role === 'staff' || b.role === 'student' ? b.role : null,
      personId: b.person_id ? Number(b.person_id) : null,
    });
    await logAudit({
      schoolId: session.schoolId, userId: session.userId, action: 'ATTENDANCE_REEVALUATE_RANGE',
      entityType: 'attendance', entityId: null,
      details: { from: res.from, to: res.to, role: b.role ?? 'all', reevaluated: res.reevaluated, person_days: res.personDays },
    }).catch(() => {});
    return NextResponse.json({ success: true, ...res });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Repair failed' }, { status: 500 });
  }
}
