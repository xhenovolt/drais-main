/**
 * Historical Repair API (Phase E) — self-service re-evaluation of a past span.
 *   POST { action:'reevaluate_range', from, to, role?, person_id? }
 * Rebuilds verdicts from the immutable raw events (never edits them).
 * Bounded (≤92 days) + audited. Requires attendance.manage.
 *
 * Robustness (auth + permission + try/catch + error envelope) via withRoute.
 */
import { withRoute } from '@/lib/api/with-route';
import { logAudit } from '@/lib/audit';
import { reevaluateRange, planRange } from '@/lib/attendance/historical-repair';

export const runtime = 'nodejs';
export const maxDuration = 300;

const badRequest = (msg: string) => { const e: any = new Error(msg); e.statusCode = 400; return e; };

export const POST = withRoute({ permission: 'attendance.manage' }, async ({ session, body }) => {
  const b = await body();
  if (b?.action !== 'reevaluate_range') throw badRequest('Unknown action');

  const plan = planRange(String(b.from || ''), String(b.to || ''));
  if (!plan.ok) throw badRequest(plan.reason || 'Invalid range');

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
  return { success: true, ...res };
});
