/**
 * POST /api/admin/notifications/outbox/resend — re-queue failed/expired SMS.
 *
 * Accepts the SAME filter shape as GET /api/admin/notifications/outbox
 * (type, channel, date range or since_hours, student_id), so the Outbox
 * page's "Resend failed" button can resend exactly what the admin is
 * currently looking at, and /attendance/logs's per-row button can resend
 * for one student on one day by passing student_id + a single-day range.
 *
 * Deliberately ignores any `status` the caller might pass — a resend ALWAYS
 * means "failed or expired", never queued/sending/delivered. Re-queuing an
 * already-delivered message would risk double-texting a parent; the whole
 * point of this endpoint is to retry sends that never reached the provider
 * in the first place (see the 2026-10-07 fix in zk-handler/route.ts for why
 * that happened: the outbox drain was killed mid-batch by the platform
 * freezing the function right after its HTTP response, not a provider
 * problem).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { canAny } from '@/lib/rbac/fallback';
import { query } from '@/lib/db';
import { ensureNotificationSchema } from '@/lib/notifications/migrations/notification-tables-schema';
import { buildOutboxWhere } from '@/lib/notifications/outbox-query';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const gate = { userId: session.userId, schoolId: session.schoolId, isSuperAdmin: !!session.isSuperAdmin };
  if (!(await canAny(gate, ['comm.dispatch.send', 'notifications.message.send'], ['admin']))) {
    return NextResponse.json({ error: 'You do not have permission to resend messages' }, { status: 403 });
  }
  await ensureNotificationSchema();

  const body = await req.json().catch(() => ({}));
  const schoolIdRaw = Number(body.school_id);
  const schoolId = session.isSuperAdmin && Number.isFinite(schoolIdRaw) && schoolIdRaw > 0 ? schoolIdRaw : session.schoolId;

  const filters = {
    schoolId,
    sinceHours: body.since_hours != null ? Number(body.since_hours) : undefined,
    dateFrom: body.date_from ?? null,
    dateTo: body.date_to ?? null,
    channel: body.channel ?? null,
    policyId: Number(body.policy_id) || null,
    type: body.type ?? null,
    studentId: Number(body.student_id) || null,
    q: body.q ?? null,
  };
  const built = buildOutboxWhere(filters, { includeStatus: false });
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });

  const result = (await query(
    `UPDATE notification_outbox
        SET status = 'queued', attempts = 0, last_error = NULL, scheduled_at = CURRENT_TIMESTAMP
      WHERE ${built.where} AND status IN ('failed','expired')`,
    built.params,
  )) as { affectedRows?: number };

  return NextResponse.json({ success: true, requeued: result?.affectedRows ?? 0 });
}
