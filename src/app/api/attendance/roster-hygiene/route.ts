/**
 * Roster hygiene API (Phase C) — clean the roster without SQL.
 *   GET                                → counts (enrollment mismatch)
 *   POST { action:'deactivate', role, person_ids }   → status='inactive' (reversible)
 *   POST { action:'reactivate', role, person_ids }   → status='active'
 *   POST { action:'fix_enrollment_mismatch' }        → activate actively-enrolled students
 * Reversible + audited. Nothing is deleted.
 *
 * Robustness (auth + permission + try/catch + error envelope) via withRoute.
 */
import { withRoute } from '@/lib/api/with-route';
import { logAudit } from '@/lib/audit';
import { validateHygieneAction, hygieneCounts, setPeopleStatus, fixEnrollmentMismatch } from '@/lib/attendance/roster-hygiene';

export const runtime = 'nodejs';

const badRequest = (msg: string) => { const e: any = new Error(msg); e.statusCode = 400; return e; };

export const GET = withRoute(async ({ session }) => {
  return { success: true, ...(await hygieneCounts(session.schoolId)) };
});

export const POST = withRoute({ permission: 'attendance.manage' }, async ({ session, body }) => {
  const b = await body();
  const plan = validateHygieneAction({ action: b?.action, role: b?.role, personIds: b?.person_ids });
  if (!plan.ok) throw badRequest(plan.reason || 'Invalid action');

  if (b.action === 'fix_enrollment_mismatch') {
    const fixed = await fixEnrollmentMismatch(session.schoolId);
    await logAudit({ schoolId: session.schoolId, userId: session.userId, action: 'ROSTER_ENROLLMENT_FIX',
      entityType: 'roster', entityId: null, details: { action: 'fix_enrollment_mismatch', activated: fixed } }).catch(() => {});
    return { success: true, activated: fixed };
  }

  const changed = await setPeopleStatus({ schoolId: session.schoolId, role: plan.role!, personIds: plan.personIds!, status: plan.status! });
  await logAudit({ schoolId: session.schoolId, userId: session.userId, action: `ROSTER_${b.action.toUpperCase()}`,
    entityType: 'roster', entityId: null,
    details: { action: b.action, role: plan.role, count: changed, status: plan.status, person_ids: plan.personIds!.slice(0, 50) } }).catch(() => {});
  return { success: true, changed, status: plan.status };
});
