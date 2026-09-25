/**
 * GET /api/admin/notifications/outbox/:id — one message, end to end:
 * lifecycle timestamps, provider receipts, and the structured decision that explains WHY it was sent
 * (residence, boarding policy, punch, reporting period, rule). School-scoped; super-admin may cross schools.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { canAny } from '@/lib/rbac/fallback';
import { query } from '@/lib/db';
import { DISPLAY_STATUS_SQL, STATUS_HELP, TYPE_LABEL, type DisplayStatus } from '@/lib/notifications/outbox-query';
import { REASON_TEXT } from '@/lib/attendance/notification-decision';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const gate = { userId: session.userId, schoolId: session.schoolId, isSuperAdmin: !!session.isSuperAdmin };
  if (!(await canAny(gate, ['comm.dispatch.view', 'notifications.message.view'], ['admin']))) {
    return NextResponse.json({ error: 'You do not have permission to view the SMS outbox' }, { status: 403 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid message' }, { status: 400 });

  const row = ((await query(
    `SELECT o.*, ${DISPLAY_STATUS_SQL} AS display_status, p.name AS policy_name, p.event_type AS policy_event,
            sc.name AS school_name, TRIM(CONCAT_WS(' ', sp.first_name, sp.last_name)) AS learner_name
       FROM notification_outbox o
       LEFT JOIN notification_policies p ON p.id = o.policy_id
       LEFT JOIN schools sc ON sc.id = o.school_id
       LEFT JOIN people sp ON sp.id = o.subject_person_id
      WHERE o.id = ? AND (o.school_id = ? OR ?)
      LIMIT 1`,
    [id, session.schoolId, session.isSuperAdmin ? 1 : 0],
  )) as any[])[0];
  // Same 404 for "doesn't exist" and "belongs to another school" — ids can't be probed.
  if (!row) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  const deliveries = (await query(
    `SELECT provider, provider_message_id, cost, success, error, delivered_at
       FROM notification_deliveries WHERE outbox_id = ? AND school_id = ? ORDER BY id`, [id, row.school_id],
  )) as any[];

  let decision: any = null;
  if (row.decision_id) {
    const d = ((await query(
      `SELECT decision, reason_code, notification_type, decision_json, created_at
         FROM attendance_sms_decisions WHERE id = ? AND school_id = ? LIMIT 1`, [row.decision_id, row.school_id],
    )) as any[])[0];
    if (d) {
      let parsed: any = {};
      try { parsed = JSON.parse(d.decision_json); } catch { /* keep empty */ }
      decision = {
        decision: d.decision, reasonCode: d.reason_code, reasonText: REASON_TEXT[d.reason_code] ?? null,
        notificationType: d.notification_type, decidedAt: d.created_at,
        explanation: parsed.explanation ?? [], facts: parsed.facts ?? {},
      };
    }
  }

  const status = row.display_status as DisplayStatus;
  const lifecycle = [
    { step: 'DRAIS created the message', at: row.created_at, done: true },
    { step: 'Handed to the SMS provider', at: row.attempted_at, done: !!row.attempted_at },
    { step: 'Provider accepted it', at: row.status === 'delivered' ? row.delivered_at : null, done: row.status === 'delivered' },
    { step: 'Provider confirmed delivery to the phone', at: row.delivery_confirmed_at, done: !!row.delivery_confirmed_at },
  ];

  return NextResponse.json({
    success: true,
    message: {
      id: row.id, schoolId: row.school_id, schoolName: row.school_name, channel: row.channel,
      recipientName: row.recipient_name, recipientPhone: row.recipient_phone, recipientEmail: row.recipient_email,
      learnerName: row.learner_name || null, body: row.body,
      status, statusHelp: STATUS_HELP[status] ?? '', attempts: row.attempts, maxAttempts: row.max_attempts, lastError: row.last_error,
      notificationType: row.notification_type, notificationLabel: row.notification_type ? TYPE_LABEL[row.notification_type] ?? row.notification_type : null,
      attendanceDate: row.attendance_date, policyName: row.policy_name, policyEvent: row.policy_event,
      createdAt: row.created_at, scheduledAt: row.scheduled_at,
    },
    lifecycle,
    deliveries: deliveries.map((d) => ({ provider: d.provider, providerMessageId: d.provider_message_id, cost: d.cost, accepted: Number(d.success) === 1, error: d.error, at: d.delivered_at })),
    decision,
    decisionNote: decision ? null : (row.notification_type ? 'No decision was stored for this message (it was created before decision diagnostics existed).' : null),
  });
}
