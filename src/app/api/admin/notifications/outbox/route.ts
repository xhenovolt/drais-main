/**
 * GET /api/admin/notifications/outbox — the SMS Outbox: what DRAIS created, and how far each message got.
 *
 * Query params (all optional):
 *   status  queued|sending|sent|delivered|failed|expired|all   (sent = provider accepted; delivered = confirmed by report)
 *   channel sms|email|push          type ARRIVAL_ON_TIME|LATE_ARRIVAL|ABSENT|BOARDING_REPORTED|...
 *   q       search recipient name / phone / learner name      student_id  policy_id
 *   date_from, date_to (YYYY-MM-DD)  or  since_hours (default 24, max 2160)
 *   page, per_page (default 50, max 100)
 *   school_id  (super-admin only; everyone else is pinned to their own school)
 *
 * Server-side pagination and aggregation; phone numbers are masked in the list (full number only in the
 * single-message detail). School and permission come from the session, never from the browser.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { canAny } from '@/lib/rbac/fallback';
import { query } from '@/lib/db';
import { ensureNotificationSchema } from '@/lib/notifications/migrations/notification-tables-schema';
import { buildOutboxWhere, DISPLAY_STATUS_SQL, maskPhone, DISPLAY_STATUSES } from '@/lib/notifications/outbox-query';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const gate = { userId: session.userId, schoolId: session.schoolId, isSuperAdmin: !!session.isSuperAdmin };
  if (!(await canAny(gate, ['comm.dispatch.view', 'notifications.message.view'], ['admin']))) {
    return NextResponse.json({ error: 'You do not have permission to view the SMS outbox' }, { status: 403 });
  }
  await ensureNotificationSchema();

  const sp = new URL(req.url).searchParams;
  const schoolIdRaw = Number(sp.get('school_id'));
  const schoolId = session.isSuperAdmin && Number.isFinite(schoolIdRaw) && schoolIdRaw > 0 ? schoolIdRaw : session.schoolId;

  const filters = {
    schoolId,
    sinceHours: Number(sp.get('since_hours')) || 24,
    dateFrom: sp.get('date_from'), dateTo: sp.get('date_to'),
    status: sp.get('status'), channel: sp.get('channel'),
    policyId: Number(sp.get('policy_id')) || null, type: sp.get('type'),
    studentId: Number(sp.get('student_id')) || null, q: sp.get('q'),
  };
  const built = buildOutboxWhere(filters);
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });
  const noStatus = buildOutboxWhere(filters, { includeStatus: false });

  const perPage = Math.min(Math.max(Number(sp.get('per_page')) || 50, 1), 100);
  const page = Math.max(Number(sp.get('page')) || 1, 1);

  const JOINS = `FROM notification_outbox o
       LEFT JOIN notification_policies p ON p.id = o.policy_id
       LEFT JOIN people sp ON sp.id = o.subject_person_id`;

  const rows = (await query(
    `SELECT o.id, o.school_id, o.channel, o.recipient_name, o.recipient_phone,
            LEFT(o.body, 90) AS body_preview, o.attempts, o.max_attempts, o.last_error,
            o.notification_type, o.attendance_date, o.decision_id,
            o.created_at, o.scheduled_at, o.attempted_at, o.delivered_at AS accepted_at, o.delivery_confirmed_at,
            ${DISPLAY_STATUS_SQL} AS display_status,
            p.name AS policy_name,
            TRIM(CONCAT_WS(' ', sp.first_name, sp.last_name)) AS learner_name,
            (SELECT d.provider FROM notification_deliveries d WHERE d.outbox_id = o.id ORDER BY d.id DESC LIMIT 1) AS provider,
            (SELECT d.provider_message_id FROM notification_deliveries d WHERE d.outbox_id = o.id ORDER BY d.id DESC LIMIT 1) AS provider_message_id
       ${JOINS}
      WHERE ${built.where}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ? OFFSET ?`,
    [...built.params, perPage, (page - 1) * perPage],
  )) as any[];

  const total = Number(((await query(`SELECT COUNT(*) AS n ${JOINS} WHERE ${built.where}`, built.params)) as any[])[0]?.n ?? 0);

  const countsRows = (await query(
    `SELECT ${DISPLAY_STATUS_SQL} AS s, COUNT(*) AS n ${JOINS} WHERE ${noStatus.where} GROUP BY s`, noStatus.params,
  )) as Array<{ s: string; n: number }>;
  const statusCounts: Record<string, number> = Object.fromEntries(DISPLAY_STATUSES.map((s) => [s, 0]));
  for (const r of countsRows) statusCounts[r.s] = Number(r.n);

  const typeRows = (await query(
    `SELECT o.notification_type AS t, COUNT(*) AS n ${JOINS} WHERE ${noStatus.where} AND o.notification_type IS NOT NULL GROUP BY t ORDER BY n DESC`, noStatus.params,
  )) as Array<{ t: string; n: number }>;

  return NextResponse.json({
    success: true,
    rows: rows.map((r) => ({ ...r, recipient_phone: maskPhone(r.recipient_phone), display_status: r.display_status })),
    total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)),
    statusCounts,
    types: typeRows.map((t) => ({ type: t.t, n: Number(t.n) })),
  });
}
