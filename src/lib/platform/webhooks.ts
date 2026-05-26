import { createHmac, randomBytes } from 'crypto';
import { query } from '@/lib/db';

const MAX_BATCH       = 25;
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200, 21600]; // 30s, 2m, 10m, 30m, 2h, 6h

export interface WebhookSubscriptionRow {
  id:           number;
  consumer:     string;
  url:          string;
  secret:       string;
  event_types:  string | string[];
  is_active:    number | boolean;
}

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export function signPayload(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export async function processPendingDeliveries(): Promise<{ processed: number; delivered: number; failed: number }> {
  const due = (await query(
    `SELECT d.id, d.subscription_id, d.event_type, d.payload, d.attempt, d.max_attempts,
            s.url, s.secret, s.is_active
       FROM webhook_deliveries d
       JOIN webhook_subscriptions s ON s.id = d.subscription_id
      WHERE d.status = 'pending'
        AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW())
      ORDER BY d.id ASC
      LIMIT ?`,
    [MAX_BATCH],
  )) as any[];

  let delivered = 0, failed = 0;
  for (const d of due) {
    if (!d.is_active) {
      await query(`UPDATE webhook_deliveries SET status='dead' WHERE id = ?`, [d.id]);
      continue;
    }
    const ts   = Math.floor(Date.now() / 1000);
    const body = typeof d.payload === 'string' ? d.payload : JSON.stringify(d.payload);
    const sig  = signPayload(d.secret, ts, body);
    const start = Date.now();

    let code = 0;
    let respText = '';
    try {
      const resp = await fetch(d.url, {
        method: 'POST',
        headers: {
          'Content-Type':           'application/json',
          'X-DRAIS-Event':          d.event_type,
          'X-DRAIS-Delivery-Id':    String(d.id),
          'X-DRAIS-Signature':      `t=${ts},v1=${sig}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      code = resp.status;
      respText = (await resp.text()).slice(0, 2000);
    } catch (e: any) {
      code = 0;
      respText = `fetch_error: ${e?.message ?? 'unknown'}`;
    }
    const ms = Date.now() - start;

    const success = code >= 200 && code < 300;
    if (success) {
      delivered++;
      await query(
        `UPDATE webhook_deliveries
            SET status='delivered', attempt=attempt+1, response_code=?, response_ms=?,
                response_body=?, delivered_at=NOW()
          WHERE id = ?`,
        [code, ms, respText, d.id],
      );
      await query(
        `UPDATE webhook_subscriptions
            SET last_delivery_at=NOW(), last_status='delivered' WHERE id = ?`,
        [d.subscription_id],
      );
    } else {
      failed++;
      const nextAttempt = d.attempt + 1;
      const isDead = nextAttempt >= d.max_attempts;
      const delay = BACKOFF_SECONDS[Math.min(nextAttempt, BACKOFF_SECONDS.length - 1)];
      await query(
        `UPDATE webhook_deliveries
            SET status = ?, attempt = ?, response_code = ?, response_ms = ?,
                response_body = ?, next_retry_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
          WHERE id = ?`,
        [isDead ? 'dead' : 'pending', nextAttempt, code, ms, respText, delay, d.id],
      );
      await query(
        `UPDATE webhook_subscriptions
            SET last_delivery_at=NOW(), last_status=? WHERE id = ?`,
        [isDead ? 'dead' : 'failed', d.subscription_id],
      );
    }
  }

  return { processed: due.length, delivered, failed };
}
