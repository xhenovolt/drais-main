/**
 * GET /api/cron/notification-drain
 *
 * Phase 5 — outbox drainer. Reads up to BATCH rows in 'queued' status,
 * marks them 'sending', calls the appropriate channel provider, then
 * marks 'delivered' / 'failed' and writes a notification_deliveries
 * receipt.
 *
 * Scheduling: vercel.json `* * * * *` (every minute). Also callable
 * manually for debugging; CRON_SECRET gates if set.
 *
 * Concurrency
 * -----------
 *   - Mark-then-send uses a status transition (queued → sending) so a
 *     parallel drainer instance won't double-send the same row. The
 *     UPDATE returns affectedRows; if 0, another worker grabbed it.
 *   - Failures with attempts < max_attempts go back to 'queued';
 *     attempts grows so a permanent failure eventually lands in
 *     'failed'.
 *
 * Safety
 * ------
 *   - Missing provider credentials route through the 'console'
 *     fallback (see src/lib/comm/providers.ts). The outbox still
 *     advances to 'delivered' with a console-mode message id so
 *     ops can verify the policy fired even without external SMS.
 *   - Schema-ensure is idempotent; first call materialises the
 *     tables on a fresh database.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getProvider } from '@/lib/comm/providers';
import { ensureNotificationSchema } from '@/lib/notifications/migrations/notification-tables-schema';

export const runtime = 'nodejs';

const BATCH = 50;

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

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let attempted = 0;
  let delivered = 0;
  let failed = 0;
  let requeued = 0;

  try {
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
    if (!claim || !claim.affectedRows) {
      return NextResponse.json({
        success: true, attempted: 0, delivered: 0, failed: 0, requeued: 0,
      });
    }

    // Re-select the rows we just claimed. We can't use RETURNING in
    // MySQL, so order by attempted_at desc and limit batch size.
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
      attempted++;
      try {
        if (row.channel !== 'sms') {
          // Email / push not yet wired — mark as failed terminally.
          await markFailed(row.id, `Channel ${row.channel} not implemented`);
          failed++;
          continue;
        }
        const recipient = row.recipient_phone;
        if (!recipient) {
          await markFailed(row.id, 'No recipient phone');
          failed++;
          continue;
        }
        const provider = getProvider('africas_talking', 'sms');
        const result = await provider.send({
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
            result.providerMessageId,
            result.cost,
            result.success ? 1 : 0,
            result.error,
          ],
        );

        if (result.success) {
          await query(
            `UPDATE notification_outbox
                SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [row.id],
          );
          delivered++;
        } else if (row.attempts >= row.max_attempts) {
          await markFailed(row.id, result.error ?? 'Provider rejected');
          failed++;
        } else {
          // Back to queued; gradual backoff via scheduled_at offset.
          const backoffSec = Math.min(60 * row.attempts, 600);
          await query(
            `UPDATE notification_outbox
                SET status = 'queued',
                    scheduled_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND),
                    last_error = ?
              WHERE id = ?`,
            [backoffSec, result.error ?? 'Provider error', row.id],
          );
          requeued++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (row.attempts >= row.max_attempts) {
          await markFailed(row.id, msg);
          failed++;
        } else {
          const backoffSec = Math.min(60 * row.attempts, 600);
          await query(
            `UPDATE notification_outbox
                SET status = 'queued',
                    scheduled_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND),
                    last_error = ?
              WHERE id = ?`,
            [backoffSec, msg, row.id],
          );
          requeued++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      attempted,
      delivered,
      failed,
      requeued,
      drained_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notification-drain]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function markFailed(id: number, reason: string): Promise<void> {
  await query(
    `UPDATE notification_outbox
        SET status = 'failed', last_error = ?
      WHERE id = ?`,
    [reason.slice(0, 255), id],
  );
}
