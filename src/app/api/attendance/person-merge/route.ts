/**
 * Guided Person Merge API (Phase B) — consolidate duplicate person records.
 *   GET                                       → duplicate-name groups
 *   POST { action:'preview', keeper_person_id, loser_person_ids }
 *   POST { action:'merge', keeper_role, keeper_ref_id, keeper_person_id, loser_person_ids }
 * Attendance moves into the keeper; losers are soft-deleted (restorable). Audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { findDuplicatePeople, previewMerge, mergePeople } from '@/lib/biometric/person-merge';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const groups = await findDuplicatePeople(session.schoolId).catch(() => []);
  return NextResponse.json({ success: true, groups, count: groups.length });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'attendance.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const b = await req.json().catch(() => null);
  const keeperPersonId = Number(b?.keeper_person_id);
  const losers = Array.isArray(b?.loser_person_ids) ? b.loser_person_ids.map(Number).filter((n: number) => Number.isFinite(n)) : [];
  if (!Number.isFinite(keeperPersonId) || losers.length === 0) {
    return NextResponse.json({ error: 'keeper_person_id and loser_person_ids are required' }, { status: 400 });
  }

  try {
    if (b.action === 'preview') {
      const p = await previewMerge(session.schoolId, keeperPersonId, losers);
      if (!p.ok) return NextResponse.json({ error: p.reason }, { status: 400 });
      return NextResponse.json({ success: true, ...p });
    }
    if (b.action === 'merge') {
      const keeperRole = b.keeper_role === 'student' ? 'student' : 'staff';
      const keeperRefId = Number(b.keeper_ref_id);
      if (!Number.isFinite(keeperRefId)) return NextResponse.json({ error: 'keeper_ref_id is required (the keeper must be a real staff/learner)' }, { status: 400 });
      const res = await mergePeople({
        schoolId: session.schoolId, keeperRole, keeperRefId, keeperPersonId,
        loserPersonIds: losers, actorUserId: session.userId,
      });
      return NextResponse.json({ success: true, ...res });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Merge failed' }, { status: 500 });
  }
}
