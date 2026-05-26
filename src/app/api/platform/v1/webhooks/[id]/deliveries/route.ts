/**
 * List deliveries for a webhook subscription — observability for consumers.
 * Scope: webhooks:manage
 */
import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, fail, Errors, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';

const MAX = 100;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAuth(req, ['webhooks:manage']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const id = Number((await params).id);

  const own = (await query(
    `SELECT 1 FROM webhook_subscriptions WHERE id = ? AND consumer = ? LIMIT 1`,
    [id, ctx.consumer],
  )) as any[];
  if (!own.length) {
    await finalizeAudit(ctx, req, 404, { errorCode: 'NOT_FOUND' });
    return fail(404, Errors.notFound(), ctx.requestId, rateLimitHeaders(ctx));
  }

  const url    = new URL(req.url);
  const limit  = Math.min(MAX, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const cursor = parseInt(url.searchParams.get('cursor') ?? '0', 10) || 0;
  const status = url.searchParams.get('status');

  const where: string[] = ['subscription_id = ?'];
  const params2: any[]  = [id];
  if (cursor) { where.push('id < ?'); params2.push(cursor); }
  if (status) { where.push('status = ?'); params2.push(status); }

  const rows = (await query(
    `SELECT id, event_id, event_type, attempt, max_attempts, status,
            response_code, response_ms, next_retry_at, delivered_at, created_at, updated_at
       FROM webhook_deliveries
      WHERE ${where.join(' AND ')}
      ORDER BY id DESC LIMIT ?`,
    [...params2, limit + 1],
  )) as any[];

  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  await finalizeAudit(ctx, req, 200);
  return ok({ items: page, next_cursor: more ? page[page.length - 1].id : null, limit }, ctx.requestId, rateLimitHeaders(ctx));
}
