/**
 * SMS Outbox — filter building and honest status vocabulary (pure).
 *
 * What DRAIS can actually establish, in lifecycle order:
 *   QUEUED     DRAIS created the message, not yet handed to the provider.
 *   SENDING    being handed to the provider right now.
 *   SENT       the PROVIDER ACCEPTED it (API said success). This is NOT proof of handset delivery.
 *   DELIVERED  the provider sent us a delivery report confirming handset delivery
 *              (outbox.delivery_confirmed_at, set only by the delivery-report webhook).
 *   FAILED     provider rejected it, all retries failed, or a delivery report said it failed.
 *   EXPIRED    closed without sending (stale, interrupted or suppressed at send time).
 *
 * Legacy rows stored provider acceptance as status='delivered'; they display as SENT until a delivery
 * report confirms them. No stored data is rewritten.
 */
export type DisplayStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'expired';
export const DISPLAY_STATUSES: DisplayStatus[] = ['queued', 'sending', 'sent', 'delivered', 'failed', 'expired'];

export const DISPLAY_STATUS_SQL = `CASE
  WHEN o.status = 'delivered' AND o.delivery_confirmed_at IS NOT NULL THEN 'delivered'
  WHEN o.status = 'delivered' THEN 'sent'
  ELSE o.status END`;

export const STATUS_HELP: Record<DisplayStatus, string> = {
  queued: 'Created by DRAIS and waiting to be sent.',
  sending: 'Being handed to the SMS provider.',
  sent: 'The SMS provider accepted the message. Handset delivery is not confirmed yet.',
  delivered: 'The provider confirmed the message reached the phone.',
  failed: 'The message could not be sent, or the provider reported it undeliverable.',
  expired: 'Closed without sending (too old, interrupted, or no longer valid when its turn came).',
};

/** 0772123456 -> 0772***456. Full numbers only appear in the single-message detail view. */
export function maskPhone(p: string | null | undefined): string {
  const s = String(p ?? '').trim();
  if (s.length < 7) return s ? '***' : '';
  return `${s.slice(0, 4)}***${s.slice(-3)}`;
}

export interface OutboxFilters {
  schoolId: number;
  sinceHours?: number;
  dateFrom?: string | null;   // YYYY-MM-DD (school-local handled by caller as UTC bounds)
  dateTo?: string | null;
  status?: string | null;
  channel?: string | null;
  policyId?: number | null;
  type?: string | null;
  studentId?: number | null;
  q?: string | null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Build a parameterised WHERE. Never interpolates user input; school is always the first predicate. */
export function buildOutboxWhere(f: OutboxFilters, opts: { includeStatus?: boolean } = { includeStatus: true }): { where: string; params: unknown[]; error?: string } {
  const where = ['o.school_id = ?'];
  const params: unknown[] = [f.schoolId];

  if (f.dateFrom || f.dateTo) {
    if (f.dateFrom) { if (!ISO_DAY.test(f.dateFrom)) return { where: '', params: [], error: 'Invalid date_from' }; where.push('o.created_at >= ?'); params.push(`${f.dateFrom} 00:00:00`); }
    if (f.dateTo) { if (!ISO_DAY.test(f.dateTo)) return { where: '', params: [], error: 'Invalid date_to' }; where.push('o.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${f.dateTo} 00:00:00`); }
  } else {
    where.push('o.created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)');
    params.push(Math.min(Math.max(Math.round(f.sinceHours ?? 24), 1), 24 * 90));
  }

  const status = (f.status ?? 'all').toLowerCase();
  if (opts.includeStatus !== false && status !== 'all') {
    if (!DISPLAY_STATUSES.includes(status as DisplayStatus)) return { where: '', params: [], error: `Invalid status: ${status}` };
    if (status === 'sent') where.push(`o.status = 'delivered' AND o.delivery_confirmed_at IS NULL`);
    else if (status === 'delivered') where.push(`o.status = 'delivered' AND o.delivery_confirmed_at IS NOT NULL`);
    else { where.push('o.status = ?'); params.push(status); }
  }
  if (f.channel) {
    if (!['sms', 'email', 'push'].includes(f.channel)) return { where: '', params: [], error: `Invalid channel: ${f.channel}` };
    where.push('o.channel = ?'); params.push(f.channel);
  }
  if (f.policyId && Number.isFinite(f.policyId)) { where.push('o.policy_id = ?'); params.push(f.policyId); }
  if (f.type) {
    if (!/^[A-Z_]{3,40}$/.test(f.type)) return { where: '', params: [], error: 'Invalid type' };
    where.push('o.notification_type = ?'); params.push(f.type);
  }
  if (f.studentId && Number.isFinite(f.studentId)) { where.push('o.subject_student_id = ?'); params.push(f.studentId); }
  if (f.q && f.q.trim()) {
    const term = `%${f.q.trim().slice(0, 60).replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(`(o.recipient_phone LIKE ? OR o.recipient_name LIKE ? OR CONCAT_WS(' ', sp.first_name, sp.last_name) LIKE ?)`);
    params.push(term, term, term);
  }
  return { where: where.join(' AND '), params };
}

export const TYPE_LABEL: Record<string, string> = {
  ARRIVAL_ON_TIME: 'Arrival', LATE_ARRIVAL: 'Late arrival', ABSENT: 'Absence', HALF_DAY: 'Half day',
  EARLY_LEAVE: 'Early leave', NON_SESSION_DAY: 'No school', BOARDING_REPORTED: 'Boarding reported',
};

/** Africa's Talking delivery-report status -> our state. Anything unrecognised stays unknown (never guessed). */
export function normalizeDeliveryStatus(raw: string | null | undefined): 'delivered' | 'failed' | 'pending' | 'unknown' {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['success', 'delivered', 'deliveredtoterminal'].includes(s)) return 'delivered';
  if (['failed', 'rejected', 'undelivered', 'expired', 'absentsubscriber', 'deliveryfailure'].includes(s)) return 'failed';
  if (['sent', 'submitted', 'buffered', 'queued', 'accepted'].includes(s)) return 'pending';
  return 'unknown';
}
