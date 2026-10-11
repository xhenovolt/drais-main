/**
 * Apply a provider delivery report to DRAIS's own records. Shared by every provider's delivery
 * webhook (Africa's Talking, UgaText, ...) so they all follow the same rules:
 *   - idempotent: a confirmed message is never changed again;
 *   - a status never regresses (a late "sent" cannot undo "delivered"/"failed");
 *   - an unknown message id is a no-op, not an error (the provider must still get a 200).
 */
import { query } from '@/lib/db';

export interface DeliveryReport {
  messageId: string;
  state: 'delivered' | 'failed' | 'pending' | 'unknown';
  reason?: string | null;
}

export async function applyDeliveryReport(report: DeliveryReport): Promise<{ updated: number }> {
  const { messageId, state } = report;
  if (!messageId || (state !== 'delivered' && state !== 'failed')) return { updated: 0 };
  const affected = (r: unknown) => (r as { affectedRows?: number })?.affectedRows ?? 0;
  let updated = 0;

  // Attendance/notification outbox.
  const link = (await query(
    `SELECT outbox_id FROM notification_deliveries WHERE provider_message_id = ? ORDER BY id DESC LIMIT 1`, [messageId],
  ).catch(() => [])) as Array<{ outbox_id: number }>;
  if (link[0]) {
    if (state === 'delivered') {
      updated += affected(await query(
        `UPDATE notification_outbox SET delivery_confirmed_at = COALESCE(delivery_confirmed_at, UTC_TIMESTAMP())
          WHERE id = ? AND status = 'delivered'`, [link[0].outbox_id],
      ));
      await query(
        `UPDATE notification_deliveries SET delivered_at = COALESCE(delivered_at, UTC_TIMESTAMP()) WHERE provider_message_id = ?`, [messageId],
      ).catch(() => undefined);
    } else {
      updated += affected(await query(
        `UPDATE notification_outbox SET status = 'failed', last_error = ?
          WHERE id = ? AND delivery_confirmed_at IS NULL`,
        [`Delivery report: ${report.reason || 'failed'}`.slice(0, 255), link[0].outbox_id],
      ));
    }
  }

  // Event/manual/broadcast dispatches keep their own log; mirror the confirmed outcome there too.
  updated += affected(await query(
    `UPDATE comm_dispatch_log SET status = ?, error_message = CASE WHEN ? = 'failed' THEN ? ELSE error_message END
      WHERE provider_message_id = ? AND status IN ('sent','queued')`,
    [state, state, `Delivery report: ${report.reason || 'failed'}`.slice(0, 500), messageId],
  ).catch(() => undefined));

  return { updated };
}
