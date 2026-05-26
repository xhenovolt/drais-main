/**
 * Manually requeue a webhook delivery (e.g. after fixing a misconfigured
 * receiver). Resets attempt counter to 0 and schedules immediately.
 *
 * Scope: webhooks:manage
 */
import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, fail, Errors, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; deliveryId: string }> },
) {
  const auth = await requirePlatformAuth(req, ['webhooks:manage']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const { id, deliveryId } = await params;
  const subId = Number(id);
  const delId = Number(deliveryId);

  const own = (await query(
    `SELECT d.id, d.status FROM webhook_deliveries d
       JOIN webhook_subscriptions s ON s.id = d.subscription_id
      WHERE d.id = ? AND s.id = ? AND s.consumer = ? LIMIT 1`,
    [delId, subId, ctx.consumer],
  )) as any[];
  if (!own.length) {
    await finalizeAudit(ctx, req, 404, { errorCode: 'NOT_FOUND' });
    return fail(404, Errors.notFound(), ctx.requestId, rateLimitHeaders(ctx));
  }

  await query(
    `UPDATE webhook_deliveries
        SET status = 'pending', attempt = 0, next_retry_at = NOW(),
            response_code = NULL, response_ms = NULL, response_body = NULL, delivered_at = NULL
      WHERE id = ?`,
    [delId],
  );

  await finalizeAudit(ctx, req, 200);
  return ok({ delivery_id: delId, requeued: true }, ctx.requestId, rateLimitHeaders(ctx));
}
