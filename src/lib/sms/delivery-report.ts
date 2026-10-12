/**
 * Apply a provider delivery report to DRAIS's own records. Shared by every provider's delivery
 * webhook (Africa's Talking, UgaText, ...) so they all follow the same rules:
 *   - idempotent: a confirmed message is never changed again;
 *   - a status never regresses (a late "sent" cannot undo "delivered"/"failed");
 *   - an unknown message id is a no-op, not an error (the provider must still get a 200).
 *
 * Every report that can be tied to a school is also recorded in sms_delivery_events, which feeds
 * the SMS Outbox timeline and the real-time delivery toasts.
 */
import { query } from '@/lib/db';
import { recordDeliveryEvent } from '@/lib/sms/delivery-events';

export interface DeliveryReport {
  messageId: string;
  /** 'pending' = the provider says it is on the network but not yet confirmed on the handset. */
  state: 'delivered' | 'failed' | 'pending' | 'unknown';
  reason?: string | null;
  provider?: string | null;
  /** The provider's own wording for this report (e.g. "message.delivered", "DeliveredToTerminal"). */
  providerStatus?: string | null;
  network?: string | null;
}

interface MessageContext {
  schoolId: number | null;
  outboxId: number | null;
  dispatchLogId: number | null;
  recipientPhone: string | null;
  recipientName: string | null;
  learnerName: string | null;
  provider: string | null;
}

/** Which DRAIS message does this provider id belong to? Attendance outbox first, then the dispatch log. */
async function findMessage(messageId: string): Promise<MessageContext | null> {
  const o = ((await query(
    `SELECT d.outbox_id, d.school_id, d.provider, o.recipient_phone, o.recipient_name,
            TRIM(CONCAT_WS(' ', sp.first_name, sp.last_name)) AS learner_name
       FROM notification_deliveries d
       JOIN notification_outbox o ON o.id = d.outbox_id
       LEFT JOIN people sp ON sp.id = o.subject_person_id
      WHERE d.provider_message_id = ? ORDER BY d.id DESC LIMIT 1`, [messageId],
  ).catch(() => [])) as any[])[0];
  if (o) {
    return {
      schoolId: Number(o.school_id), outboxId: Number(o.outbox_id), dispatchLogId: null, provider: o.provider ?? null,
      recipientPhone: o.recipient_phone ?? null, recipientName: o.recipient_name ?? null, learnerName: o.learner_name || null,
    };
  }
  const l = ((await query(
    `SELECT id, school_id, provider, recipient_phone, recipient_name FROM comm_dispatch_log
      WHERE provider_message_id = ? ORDER BY id DESC LIMIT 1`, [messageId],
  ).catch(() => [])) as any[])[0];
  if (l) {
    return {
      schoolId: Number(l.school_id), outboxId: null, dispatchLogId: Number(l.id), provider: l.provider ?? null,
      recipientPhone: l.recipient_phone ?? null, recipientName: l.recipient_name ?? null, learnerName: null,
    };
  }
  return null;
}

export async function applyDeliveryReport(report: DeliveryReport): Promise<{ updated: number; matched: boolean; recorded: boolean }> {
  const { messageId, state } = report;
  if (!messageId || state === 'unknown') return { updated: 0, matched: false, recorded: false };
  const ctx = await findMessage(messageId);
  if (!ctx) return { updated: 0, matched: false, recorded: false };

  const affected = (r: unknown) => (r as { affectedRows?: number })?.affectedRows ?? 0;
  let updated = 0;

  // Only a confirmed outcome changes a message's status; "on the network" is recorded, not promoted.
  if (state === 'delivered' || state === 'failed') {
    if (ctx.outboxId) {
      if (state === 'delivered') {
        updated += affected(await query(
          `UPDATE notification_outbox SET delivery_confirmed_at = COALESCE(delivery_confirmed_at, UTC_TIMESTAMP())
            WHERE id = ? AND status = 'delivered'`, [ctx.outboxId],
        ));
      } else {
        updated += affected(await query(
          `UPDATE notification_outbox SET status = 'failed', last_error = ?
            WHERE id = ? AND delivery_confirmed_at IS NULL`,
          [`Delivery report: ${report.reason || 'failed'}`.slice(0, 255), ctx.outboxId],
        ));
      }
    }
    // Event/manual/broadcast dispatches keep their own log; mirror the confirmed outcome there too.
    updated += affected(await query(
      `UPDATE comm_dispatch_log SET status = ?, error_message = CASE WHEN ? = 'failed' THEN ? ELSE error_message END
        WHERE provider_message_id = ? AND status IN ('sent','queued')`,
      [state, state, `Delivery report: ${report.reason || 'failed'}`.slice(0, 500), messageId],
    ).catch(() => undefined));
  }

  const recorded = await recordDeliveryEvent({
    schoolId: ctx.schoolId, provider: report.provider ?? ctx.provider, providerMessageId: messageId,
    state: state === 'pending' ? 'sent' : state, providerStatus: report.providerStatus ?? null,
    reason: state === 'failed' ? (report.reason || 'Not delivered') : null, network: report.network ?? null,
    recipientPhone: ctx.recipientPhone, recipientName: ctx.recipientName, learnerName: ctx.learnerName,
    outboxId: ctx.outboxId, dispatchLogId: ctx.dispatchLogId,
  });

  return { updated, matched: true, recorded };
}
