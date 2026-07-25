/**
 * Roster hygiene API (Phase C) — clean the roster without SQL.
 *   GET                                → counts (enrollment mismatch)
 *   POST { action:'deactivate', role, person_ids }   → status='inactive' (reversible)
 *   POST { action:'reactivate', role, person_ids }   → status='active'
 *   POST { action:'fix_enrollment_mismatch' }        → activate actively-enrolled students
 * Reversible + audited. Nothing is deleted.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { validateHygieneAction, hygieneCounts, setPeopleStatus, fixEnrollmentMismatch } from '@/lib/attendance/roster-hygiene';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ success: true, ...(await hygieneCounts(session.schoolId)) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'attendance.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const b = await req.json().catch(() => null);
  const plan = validateHygieneAction({ action: b?.action, role: b?.role, personIds: b?.person_ids });
  if (!plan.ok) return NextResponse.json({ error: plan.reason }, { status: 400 });

  try {
    if (b.action === 'fix_enrollment_mismatch') {
      const fixed = await fixEnrollmentMismatch(session.schoolId);
      await logAudit({ schoolId: session.schoolId, userId: session.userId, action: 'ROSTER_ENROLLMENT_FIX' as any,
        entityType: 'roster', entityId: null as any, details: { action: 'fix_enrollment_mismatch', activated: fixed } }).catch(() => {});
      return NextResponse.json({ success: true, activated: fixed });
    }

    const changed = await setPeopleStatus({ schoolId: session.schoolId, role: plan.role!, personIds: plan.personIds!, status: plan.status! });
    await logAudit({ schoolId: session.schoolId, userId: session.userId, action: `ROSTER_${b.action.toUpperCase()}` as any,
      entityType: 'roster', entityId: null as any,
      details: { action: b.action, role: plan.role, count: changed, status: plan.status, person_ids: plan.personIds!.slice(0, 50) } }).catch(() => {});
    return NextResponse.json({ success: true, changed, status: plan.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Roster action failed' }, { status: 500 });
  }
}
