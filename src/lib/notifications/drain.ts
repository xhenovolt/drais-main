/**
 * Phase 5 outbox drainer — extracted core.
 *
 * The original implementation lived inside the GET handler of
 * /api/cron/notification-drain. The audit found that route was never
 * scheduled (vercel.json has no cron for it, and the Vercel hobby plan
 * does not allow adding more), so queued notifications never sent.
 *
 * The core now lives here so TWO callers can pump the queue:
 *
 *   1. /api/cron/notification-drain — manual / externally-scheduled
 *      invocation (cron-job.org, school server crontab, etc.).
 *   2. The ZKTeco heartbeat path (zk-handler GET) via
 *      drainOutboxOpportunistically() — devices poll every ~30-60s,
 *      which makes them a free scheduler. The call is throttled
 *      per-process and fire-and-forget so it never slows the ADMS
 *      response.
 *
 * Concurrency safety is unchanged: a batch is claimed by flipping
 * status queued → sending; a parallel drainer that loses the UPDATE
 * race simply claims nothing.
 */
import { query } from '@/lib/db';
import { getProvider } from '@/lib/comm/providers';
import { ensureNotificationSchema } from '@/lib/notifications/migrations/notification-tables-schema';

const BATCH = 50;

export interface DrainResult {
  attempted: number;
  delivered: number;
  failed: number;
  requeued: number;
}

interface OutboxRow {
  id: number;
  school_id: number;
  channel: 'sms' | 'email' | 'push';
  body: string;
  recipient_phone: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  attempts: number;
  max_attempts: number;
}

export async function drainNotificationOutbox(): Promise<DrainResult> {
  const result: DrainResult = { attempted: 0, delivered: 0, failed: 0, requeued: 0 };

  await ensureNotificationSchema();

  // Atomically claim a batch by flipping to 'sending'.
  const claim = (await query(
    `UPDATE notification_outbox
        SET status = 'sending',
            attempts = attempts + 1,
            attempted_at = CURRENT_TIMESTAMP
      WHERE status = 'queued'
        AND scheduled_at <= CURRENT_TIMESTAMP
      ORDER BY scheduled_at ASC, id ASC
      LIMIT ${BATCH}`,
    [],
  )) as { affectedRows?: number };
  if (!claim || !claim.affectedRows) return result;

  // Re-select the rows we just claimed (no RETURNING in MySQL).
  const rows = (await query(
    `SELECT id, school_id, channel, body, recipient_phone,
            recipient_email, recipient_name, attempts, max_attempts
       FROM notification_outbox
      WHERE status = 'sending'
        AND attempted_at >= DATE_SUB(NOW(), INTERVAL 30 SECOND)
      ORDER BY attempted_at DESC, id ASC
      LIMIT ${BATCH}`,
    [],
  )) as OutboxRow[];

  for (const row of rows) {
    result.attempted++;
    try {
      if (row.channel !== 'sms') {
        await markFailed(row.id, `Channel ${row.channel} not implemented`);
        result.failed++;
        continue;
      }
      const recipient = row.recipient_phone;
      if (!recipient) {
        await markFailed(row.id, 'No recipient phone');
        result.failed++;
        continue;
      }
      const provider = getProvider('africas_talking', 'sms');
      const sendResult = await provider.send({
        to: recipient,
        body: row.body,
        senderName: undefined,
      });

      await query(
        `INSERT INTO notification_deliveries
           (outbox_id, school_id, provider, provider_message_id, cost, success, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.school_id,
          provider.name,
          sendResult.providerMessageId,
          sendResult.cost,
          sendResult.success ? 1 : 0,
          sendResult.error,
        ],
      );

      if (sendResult.success) {
        await query(
          `UPDATE notification_outbox
              SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [row.id],
        );
        result.delivered++;
      } else if (row.attempts >= row.max_attempts) {
        await markFailed(row.id, sendResult.error ?? 'Provider rejected');
        result.failed++;
      } else {
        await requeue(row.id, row.attempts, sendResult.error ?? 'Provider error');
        result.requeued++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (row.attempts >= row.max_attempts) {
        await markFailed(row.id, msg);
        result.failed++;
      } else {
        await requeue(row.id, row.attempts, msg);
        result.requeued++;
      }
    }
  }

  return result;
}

async function requeue(id: number, attempts: number, error: string): Promise<void> {
  const backoffSec = Math.min(60 * attempts, 600);
  await query(
    `UPDATE notification_outbox
        SET status = 'queued',
            scheduled_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND),
            last_error = ?
      WHERE id = ?`,
    [backoffSec, error, id],
  );
}

async function markFailed(id: number, reason: string): Promise<void> {
  await query(
    `UPDATE notification_outbox
        SET status = 'failed', last_error = ?
      WHERE id = ?`,
    [reason.slice(0, 255), id],
  );
}

// ── Opportunistic pump (heartbeat-driven, no cron required) ───────────

let lastOpportunisticDrain = 0;
let drainInFlight = false;
const OPPORTUNISTIC_INTERVAL_MS = 90_000;

/**
 * Called from high-frequency request paths (ZKTeco heartbeats). At most
 * one drain per process per 90s; never throws; never awaited by the
 * caller. On Vercel each warm lambda instance throttles independently —
 * worst case a few extra drains, which the queued→sending claim makes
 * safe.
 */
export function drainOutboxOpportunistically(): void {
  const now = Date.now();
  if (drainInFlight || now - lastOpportunisticDrain < OPPORTUNISTIC_INTERVAL_MS) return;
  lastOpportunisticDrain = now;
  drainInFlight = true;
  drainNotificationOutbox()
    .then((r) => {
      if (r.attempted > 0) {
        console.log(JSON.stringify({
          ts: new Date().toISOString(), type: 'NOTIFICATION_DRAIN',
          trigger: 'heartbeat', ...r,
        }));
      }
    })
    .catch((err) => console.warn('[notifications/drain] opportunistic drain failed:', err))
    .finally(() => { drainInFlight = false; });
}
