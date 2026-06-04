/**
 * GET /api/admin/notifications/outbox
 *
 * Observability tail for the Phase 5 outbox. Lets ops see what's
 * queued, in-flight, delivered, or failed without raw SQL.
 *
 * Query params:
 *   status=queued|sending|delivered|failed|expired|all   default 'all'
 *   channel=sms|email|push                                 (optional)
 *   policy_id=N                                            (optional)
 *   since_hours=N                                          default 24
 *   limit                                                  default 200 (max 1000)
 *
 * Super-admin can cross-school query via ?school_id=.
 *
 * Returns:
 *   { rows: OutboxRow[],
 *     statusCounts: { queued, sending, delivered, failed, expired },
 *     deliverySummary: { successCount, failureCount, totalCost } }
 *
 * statusCounts is current snapshot. deliverySummary counts
 * notification_deliveries inside the same since_hours window so ops
 * can see "today's SMS cost".
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { ensureNotificationSchema } from '@/lib/notifications/migrations/notification-tables-schema';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await ensureNotificationSchema();

  const url = new URL(req.url);
  const status = (url.searchParams.get('status') || 'all').toLowerCase();
  const channel = url.searchParams.get('channel');
  const policyIdRaw = Number(url.searchParams.get('policy_id'));
  const sinceHours = Math.max(Number(url.searchParams.get('since_hours')) || 24, 1);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), 1000);

  const schoolIdRaw = Number(url.searchParams.get('school_id'));
  const targetSchoolId =
    session.isSuperAdmin && Number.isFinite(schoolIdRaw) && schoolIdRaw > 0
      ? schoolIdRaw
      : session.schoolId;

  const where: string[] = [
    'o.school_id = ?',
    'o.created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)',
  ];
  const params: unknown[] = [targetSchoolId, sinceHours];

  if (status !== 'all') {
    if (!['queued','sending','delivered','failed','expired'].includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }
    where.push('o.status = ?');
    params.push(status);
  }
  if (channel) {
    if (!['sms','email','push'].includes(channel)) {
      return NextResponse.json({ error: `Invalid channel: ${channel}` }, { status: 400 });
    }
    where.push('o.channel = ?');
    params.push(channel);
  }
  if (Number.isFinite(policyIdRaw) && policyIdRaw > 0) {
    where.push('o.policy_id = ?');
    params.push(policyIdRaw);
  }

  const rows = await query(
    `SELECT o.id, o.policy_id, o.school_id, o.subject_person_id,
            o.recipient_phone, o.recipient_email, o.recipient_name,
            o.channel, o.body, o.status, o.attempts, o.max_attempts,
            o.last_error, o.scheduled_at, o.attempted_at, o.delivered_at,
            o.created_at,
            p.name AS policy_name
       FROM notification_outbox o
       LEFT JOIN notification_policies p ON p.id = o.policy_id
      WHERE ${where.join(' AND ')}
      ORDER BY o.created_at DESC
      LIMIT ?`,
    [...params, limit],
  );

  // Current status snapshot inside the same window.
  const countsRows = (await query(
    `SELECT status, COUNT(*) AS n
       FROM notification_outbox
      WHERE school_id = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      GROUP BY status`,
    [targetSchoolId, sinceHours],
  )) as Array<{ status: string; n: number }>;

  const statusCounts: Record<string, number> = {
    queued: 0, sending: 0, delivered: 0, failed: 0, expired: 0,
  };
  for (const r of countsRows) statusCounts[r.status] = Number(r.n);

  // Delivery summary (provider receipts) for the same window. Cost is
  // a string per provider — Africa's Talking returns e.g. "UGX 35.0000".
  // We sum numerically by stripping non-digits; rough but useful.
  const deliveryRows = (await query(
    `SELECT success, cost
       FROM notification_deliveries
      WHERE school_id = ?
        AND delivered_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [targetSchoolId, sinceHours],
  )) as Array<{ success: number; cost: string | null }>;

  let successCount = 0;
  let failureCount = 0;
  let totalCostNum = 0;
  for (const d of deliveryRows) {
    if (d.success) successCount++;
    else failureCount++;
    const n = Number((d.cost ?? '').replace(/[^\d.-]/g, ''));
    if (Number.isFinite(n)) totalCostNum += n;
  }

  return NextResponse.json({
    success: true,
    sinceHours,
    rows,
    statusCounts,
    deliverySummary: {
      successCount,
      failureCount,
      totalCost: totalCostNum,
    },
  });
}
