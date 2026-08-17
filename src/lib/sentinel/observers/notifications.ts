/**
 * DRAIS Sentinel — notification-queue observer.
 *
 * Reads the EXISTING notification_outbox table directly (no duplicate
 * queue, no new table) and reports queue buildup / delivery failure /
 * stale messages per school. This is the observer that would have caught
 * the historical "drain route was never scheduled, SMS silently never
 * sent" incident as it was happening rather than after a school noticed.
 */
import { query } from '@/lib/db';
import type { Observation } from '../types';

export async function observeNotifications(): Promise<Observation[]> {
  const observations: Observation[] = [];

  // Messages that have sat 'queued' well past their scheduled time — the
  // outbox exists but nothing is draining it.
  const stuck = (await query(
    `SELECT school_id, s.name, COUNT(*) n, MIN(scheduled_at) oldest
       FROM notification_outbox o LEFT JOIN schools s ON s.id = o.school_id
      WHERE o.status = 'queued' AND o.scheduled_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
      GROUP BY school_id, s.name`,
  ).catch(() => [])) as Array<{ school_id: number; name: string; n: number; oldest: string }>;

  for (const row of stuck) {
    const ageMinutes = Math.round((Date.now() - new Date(row.oldest).getTime()) / 60000);
    observations.push({
      kind: 'notification_queue_backlog',
      observer: 'notifications',
      schoolId: Number(row.school_id) || null,
      module: 'Notification outbox',
      severity: ageMinutes >= 24 * 60 ? 'high' : ageMinutes >= 4 * 60 ? 'medium' : 'low',
      confidence: 90,
      probableCause: 'Queued SMS/email are not being drained — the drain path is not running for this school, or is failing before it reaches the provider.',
      userImpact: 'Parents/staff are not receiving notifications they are supposed to receive (attendance alerts, fee reminders, etc.), with no visible error to the school.',
      technicalImpact: `${row.n} message(s) queued, oldest waiting ${ageMinutes} minute(s).`,
      evidence: [{ label: 'Queued messages', value: row.n }, { label: 'Oldest queued', value: `${ageMinutes}m ago` }],
      recommendedAction: 'Trigger the notification drain manually and check provider credentials for this school.',
      autoRemediationSafe: false,
      notifyRequired: ageMinutes >= 4 * 60,
      dedupKey: `notification_queue_backlog::${row.school_id ?? 'global'}::outbox`,
    });
  }

  // High recent failure rate — the queue IS draining but the provider (or
  // credentials) is rejecting sends.
  const failing = (await query(
    `SELECT school_id, s.name, SUM(status = 'failed') failed, COUNT(*) total
       FROM notification_outbox o LEFT JOIN schools s ON s.id = o.school_id
      WHERE o.attempted_at >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
      GROUP BY school_id, s.name
     HAVING total >= 5 AND failed / total >= 0.5`,
  ).catch(() => [])) as Array<{ school_id: number; name: string; failed: number; total: number }>;

  for (const row of failing) {
    observations.push({
      kind: 'notification_delivery_failing',
      observer: 'notifications',
      schoolId: Number(row.school_id) || null,
      module: 'Notification delivery',
      severity: 'medium',
      confidence: 85,
      probableCause: 'SMS provider credentials for this school are likely missing/invalid, or the provider is rejecting the sender ID.',
      userImpact: 'Notifications appear to be sent by the system but are not reaching recipients.',
      technicalImpact: `${row.failed}/${row.total} attempts failed in the last 6h.`,
      evidence: [{ label: 'Failed', value: row.failed }, { label: 'Total attempts', value: row.total }],
      recommendedAction: 'Check Communication settings for this school (provider username/API key/sender ID).',
      autoRemediationSafe: false,
      notifyRequired: true,
      dedupKey: `notification_delivery_failing::${row.school_id ?? 'global'}::outbox`,
    });
  }

  return observations;
}
