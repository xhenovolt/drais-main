import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, created, fail, Errors, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';
import { newWebhookSecret } from '@/lib/platform/webhooks';

function publicShape(r: any, includeSecret = false) {
  return {
    id:               r.id,
    consumer:         r.consumer,
    url:              r.url,
    event_types:      typeof r.event_types === 'string' ? JSON.parse(r.event_types) : r.event_types,
    is_active:        !!r.is_active,
    last_delivery_at: r.last_delivery_at,
    last_status:      r.last_status,
    created_at:       r.created_at,
    ...(includeSecret ? { secret: r.secret } : {}),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req, ['webhooks:manage']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;

  const rows = (await query(
    `SELECT id, consumer, url, event_types, is_active, last_delivery_at, last_status, created_at
       FROM webhook_subscriptions
      WHERE consumer = ?
      ORDER BY id DESC`,
    [ctx.consumer],
  )) as any[];

  await finalizeAudit(ctx, req, 200);
  return ok({ items: rows.map(r => publicShape(r)) }, ctx.requestId, rateLimitHeaders(ctx));
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req, ['webhooks:manage']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;

  let body: any;
  try { body = await req.json(); }
  catch {
    await finalizeAudit(ctx, req, 400, { errorCode: 'BAD_REQUEST' });
    return fail(400, Errors.badRequest('Invalid JSON'), ctx.requestId, rateLimitHeaders(ctx));
  }

  const url = String(body.url ?? '').trim();
  const eventTypes = Array.isArray(body.event_types) ? body.event_types : null;
  if (!url || !/^https:\/\//.test(url)) {
    await finalizeAudit(ctx, req, 400, { errorCode: 'BAD_REQUEST' });
    return fail(400, Errors.badRequest('url must be https://'), ctx.requestId, rateLimitHeaders(ctx));
  }
  if (!eventTypes || !eventTypes.length) {
    await finalizeAudit(ctx, req, 400, { errorCode: 'BAD_REQUEST' });
    return fail(400, Errors.badRequest('event_types[] required (use ["*"] for all)'), ctx.requestId, rateLimitHeaders(ctx));
  }

  const secret = newWebhookSecret();
  const res: any = await query(
    `INSERT INTO webhook_subscriptions (consumer, url, secret, event_types, created_by_key)
     VALUES (?, ?, ?, ?, ?)`,
    [ctx.consumer, url, secret, JSON.stringify(eventTypes), ctx.keyId],
  );
  const row = ((await query(
    `SELECT * FROM webhook_subscriptions WHERE id = ?`, [res.insertId],
  )) as any[])[0];

  await finalizeAudit(ctx, req, 201);
  return created(publicShape(row, true), ctx.requestId, rateLimitHeaders(ctx));
}
