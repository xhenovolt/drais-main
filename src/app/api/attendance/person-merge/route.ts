/**
 * Guided Person Merge API (Phase B) — consolidate duplicate person records.
 *   GET                                       → duplicate-name groups
 *   POST { action:'preview', keeper_person_id, loser_person_ids }
 *   POST { action:'merge', keeper_role, keeper_ref_id, keeper_person_id, loser_person_ids }
 * Attendance moves into the keeper; losers are soft-deleted (restorable). Audited.
 *
 * Robustness (auth + permission + try/catch + error envelope) via withRoute.
 */
import { withRoute } from '@/lib/api/with-route';
import { findDuplicatePeople, previewMerge, mergePeople } from '@/lib/biometric/person-merge';

export const runtime = 'nodejs';

const badRequest = (msg: string) => { const e: any = new Error(msg); e.statusCode = 400; return e; };

export const GET = withRoute(async ({ session }) => {
  const groups = await findDuplicatePeople(session.schoolId).catch(() => []);
  return { success: true, groups, count: groups.length };
});

export const POST = withRoute({ permission: 'attendance.manage' }, async ({ session, body }) => {
  const b = await body();
  const keeperPersonId = Number(b?.keeper_person_id);
  const losers = Array.isArray(b?.loser_person_ids)
    ? b.loser_person_ids.map(Number).filter((n: number) => Number.isFinite(n)) : [];
  if (!Number.isFinite(keeperPersonId) || losers.length === 0) {
    throw badRequest('keeper_person_id and loser_person_ids are required');
  }

  if (b.action === 'preview') {
    const p = await previewMerge(session.schoolId, keeperPersonId, losers);
    if (!p.ok) throw badRequest(p.reason || 'Cannot preview');
    return { success: true, ...p };
  }
  if (b.action === 'merge') {
    const keeperRole = b.keeper_role === 'student' ? 'student' : 'staff';
    const keeperRefId = Number(b.keeper_ref_id);
    if (!Number.isFinite(keeperRefId)) throw badRequest('keeper_ref_id is required (the keeper must be a real staff/learner)');
    const res = await mergePeople({
      schoolId: session.schoolId, keeperRole, keeperRefId, keeperPersonId,
      loserPersonIds: losers, actorUserId: session.userId,
    });
    return { success: true, ...res };
  }
  throw badRequest('Unknown action');
});
