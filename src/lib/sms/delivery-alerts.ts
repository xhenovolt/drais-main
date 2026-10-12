/**
 * Delivery-status alerts by SMS — a school can name one phone number that DRAIS texts when a
 * message's delivery status comes in.
 *
 * Why DRAIS does this itself: providers (UgaText, Africa's Talking) report delivery status to a
 * webhook URL only; none can send the status to a phone number. So the provider's report is
 * turned into a short SMS here, per school.
 *
 * Settings (Communications → Settings, stored on comm_settings):
 *   delivery_alert_phone   the number to text; blank = off
 *   delivery_alert_mode    'failed' (default) — only messages that were NOT delivered
 *                          'all'              — delivered and not delivered
 *                          'off'
 *
 * Safety:
 *   - Every alert is itself an SMS the school pays for, so they are capped per school per hour.
 *   - An alert is sent straight through the school's route and is never written to the outbox
 *     or dispatch log, so the provider's report about the alert itself matches no DRAIS message
 *     and cannot trigger another alert.
 *   - Never throws: an alert must not break the delivery report or the send that caused it.
 */
import { query } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/africastalking';
import { recordSmsUsage } from '@/lib/sms/usage';
import { sendViaSchoolRoute } from '@/lib/sms/school-routing';

import { buildAlertBody, shouldAlert, DELIVERY_ALERT_HOURLY_CAP, type DeliveryAlertInput } from './delivery-alert-text';

export { DELIVERY_ALERT_MODES, DELIVERY_ALERT_HOURLY_CAP, buildAlertBody, shouldAlert } from './delivery-alert-text';
export type { DeliveryAlertInput, DeliveryAlertMode } from './delivery-alert-text';

let ready: Promise<void> | null = null;
/** Columns + log table, created on demand. Separate ALTERs: TiDB rejects multi-change ALTERs here. */
export function ensureDeliveryAlertSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await query(`ALTER TABLE comm_settings ADD COLUMN delivery_alert_phone VARCHAR(40) DEFAULT NULL`, []).catch(() => undefined);
    await query(`ALTER TABLE comm_settings ADD COLUMN delivery_alert_mode VARCHAR(12) NOT NULL DEFAULT 'failed'`, []).catch(() => undefined);
    await query(
      `CREATE TABLE IF NOT EXISTS sms_status_alerts (
         id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
         school_id       BIGINT NOT NULL,
         alert_phone     VARCHAR(40) NOT NULL,
         state           VARCHAR(20) NOT NULL,
         outbox_id       BIGINT DEFAULT NULL,
         dispatch_log_id BIGINT DEFAULT NULL,
         body            VARCHAR(480) NOT NULL,
         success         TINYINT(1) NOT NULL DEFAULT 0,
         error           VARCHAR(255) DEFAULT NULL,
         created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         KEY idx_ssa_school_time (school_id, created_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, [],
    ).catch(() => undefined);
  })();
  return ready;
}

export async function notifyDeliveryStatus(a: DeliveryAlertInput): Promise<{ sent: boolean; skipped?: string }> {
  try {
    await ensureDeliveryAlertSchema();
    const s = ((await query(
      `SELECT delivery_alert_phone, delivery_alert_mode, prefix, sms_enabled FROM comm_settings WHERE school_id = ? LIMIT 1`, [a.schoolId],
    ).catch(() => [])) as any[])[0];
    const phone = normalizePhoneNumber(String(s?.delivery_alert_phone ?? '').trim());
    if (!phone) return { sent: false, skipped: 'no alert number' };
    if (s?.sms_enabled != null && Number(s.sms_enabled) !== 1) return { sent: false, skipped: 'sms disabled' };
    if (!shouldAlert(s?.delivery_alert_mode, a.state)) return { sent: false, skipped: 'mode' };
    // Don't text the alert number about a message that was sent to the alert number itself.
    if (a.recipientPhone && normalizePhoneNumber(a.recipientPhone) === phone) return { sent: false, skipped: 'recipient is the alert number' };

    const recent = Number((((await query(
      `SELECT COUNT(*) AS n FROM sms_status_alerts WHERE school_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 MINUTE)`, [a.schoolId],
    ).catch(() => [])) as any[])[0])?.n ?? 0);
    if (recent >= DELIVERY_ALERT_HOURLY_CAP) return { sent: false, skipped: 'hourly cap' };

    const body = buildAlertBody(a, s?.prefix ?? null);
    // Logged BEFORE sending so the cap holds even when several reports arrive at the same moment.
    const ins = (await query(
      `INSERT INTO sms_status_alerts (school_id, alert_phone, state, outbox_id, dispatch_log_id, body) VALUES (?, ?, ?, ?, ?, ?)`,
      [a.schoolId, phone, a.state, a.outboxId ?? null, a.dispatchLogId ?? null, body],
    )) as { insertId?: number };

    const routed = await sendViaSchoolRoute(a.schoolId, { to: phone, body, senderName: undefined });
    const ok = !!routed?.response.success;
    await query(`UPDATE sms_status_alerts SET success = ?, error = ? WHERE id = ?`,
      [ok ? 1 : 0, ok ? null : String(routed?.response.error ?? 'No SMS route for this school').slice(0, 255), ins?.insertId ?? 0]).catch(() => undefined);
    if (ok) await recordSmsUsage({ schoolId: a.schoolId, source: 'other', body, ref: `alert:${ins?.insertId ?? ''}` });
    return { sent: ok, skipped: ok ? undefined : 'send failed' };
  } catch {
    return { sent: false, skipped: 'error' };
  }
}
