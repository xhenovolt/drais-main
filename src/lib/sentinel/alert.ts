/**
 * DRAIS Sentinel — independent critical-alert path.
 *
 * NON-NEGOTIABLE per spec: this path must not depend on Control Centre being
 * open, a cron, or the school notification queue being healthy. It reuses
 * the SAME delivery primitive as the rest of DRAIS (sendSMS →
 * africastalking.ts — no second SMS provider, per the "don't add
 * infrastructure without a compelling reliability reason" instruction) but
 * calls it DIRECTLY and synchronously from the incident engine's own
 * fire-and-forget tail — never via notification_outbox, and never via the
 * once-daily job runner. A broken outbox therefore cannot swallow a page.
 *
 * Delivery is recorded to sentinel_alerts (isolated from
 * notification_deliveries) so "did the operator actually get paged" has its
 * own auditable answer, distinct from ordinary school SMS traffic.
 *
 * Self-monitoring: every dispatch attempt beats HEARTBEATS.SENTINEL_ALERT_DISPATCH
 * — success or failure — so Sentinel can know when ITS OWN paging path is
 * degraded (Test 3 in the spec: "Sentinel identifies delivery failure,
 * records it, does not silently disappear").
 */
import { query } from '@/lib/db';
import { ensureSentinelSchema } from './schema';
import { getSetting } from '@/lib/control/platform-settings';
import { sendSMS } from '@/lib/africastalking';
import { beatSuccess, beatFailure, HEARTBEATS } from './heartbeat';
import type { Incident } from './types';

export const SENTINEL_ALERT_PHONE_KEY = 'sentinel_alert_phone';
export const SENTINEL_ALERT_ENABLED_KEY = 'sentinel_alert_enabled';

export async function getAlertPhone(): Promise<string | null> {
  return getSetting(SENTINEL_ALERT_PHONE_KEY);
}

export async function setAlertPhone(phone: string | null): Promise<void> {
  const { setSetting } = await import('@/lib/control/platform-settings');
  await setSetting(SENTINEL_ALERT_PHONE_KEY, phone);
}

export async function alertingEnabled(): Promise<boolean> {
  const v = await getSetting(SENTINEL_ALERT_ENABLED_KEY);
  return v !== '0'; // default ON once a phone is configured
}

/** Concise, actionable, no PII — matches the spec's SMS format exactly. */
export function formatAlertMessage(incident: Incident): string {
  const scope = incident.schoolName ? incident.schoolName : 'PLATFORM';
  const sev = incident.severity.toUpperCase();
  const time = new Date(incident.lastDetectedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const occ = incident.occurrenceCount > 1 ? ` (${incident.occurrenceCount}x)` : '';
  const lines = [
    `DRAIS SENTINEL: ${sev}`,
    `${scope} — ${incident.module}`,
    incident.probableCause || incident.technicalImpact,
    `Detected ${time}${occ}.`,
    `Open Control Centre for diagnosis.`,
  ];
  return lines.join('\n').slice(0, 480);
}

/**
 * Fire the alert. Returns true only on confirmed provider acceptance.
 * One immediate retry on failure (per spec — "immediate retry"). Never
 * throws; a failure is recorded, not swallowed, and Sentinel's own
 * heartbeat reflects it so the degradation itself is visible
 * (sentinel_alert_path_degraded — see observers/self.ts).
 */
export async function dispatchSentinelAlert(incident: Incident): Promise<boolean> {
  await ensureSentinelSchema();

  if (!(await alertingEnabled())) return false;
  const phone = await getAlertPhone();
  const message = formatAlertMessage(incident);

  if (!phone) {
    await recordAttempt(incident.id, phone, message, 'failed', null, 'No Sentinel alert phone configured in Control Centre', 0);
    await beatFailure(HEARTBEATS.SENTINEL_ALERT_DISPATCH, 'no phone configured');
    return false;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    let result: Awaited<ReturnType<typeof sendSMS>>;
    try {
      result = await sendSMS(phone, message);
    } catch (e: any) {
      result = { success: false, error: String(e?.message || e) };
    }
    if (result.success) {
      await recordAttempt(incident.id, phone, message, 'sent', result.messageId ?? null, null, attempt);
      await beatSuccess(HEARTBEATS.SENTINEL_ALERT_DISPATCH);
      return true;
    }
    if (attempt === 2) {
      await recordAttempt(incident.id, phone, message, 'failed', null, result.error ?? 'Unknown SMS failure', attempt);
      await beatFailure(HEARTBEATS.SENTINEL_ALERT_DISPATCH, result.error ?? 'Unknown SMS failure');
      return false;
    }
  }
  return false;
}

async function recordAttempt(
  incidentId: number, destination: string | null, message: string,
  status: 'sent' | 'failed', providerMessageId: string | null, error: string | null, attempts: number,
): Promise<void> {
  await query(
    `INSERT INTO sentinel_alerts (incident_id, channel, destination, message, status, provider_message_id, error, attempts, delivered_at)
     VALUES (?, 'sms', ?, ?, ?, ?, ?, ?, ?)`,
    [incidentId, destination, message, status, providerMessageId, error, attempts, status === 'sent' ? new Date() : null],
  ).catch(() => {});
}

export async function recentAlerts(limit = 20): Promise<any[]> {
  await ensureSentinelSchema();
  return (await query(
    `SELECT a.*, i.module, i.severity FROM sentinel_alerts a
       LEFT JOIN sentinel_incidents i ON i.id = a.incident_id
      ORDER BY a.id DESC LIMIT ?`, [limit],
  ).catch(() => [])) as any[];
}
