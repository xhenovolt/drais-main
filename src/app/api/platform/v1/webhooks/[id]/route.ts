import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, fail, Errors, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';

async function load(id: number, consumer: string) {
  const rows = (await query(
    `SELECT * FROM webhook_subscriptions WHERE id = ? AND consumer = ?`,
    [id, consumer],
  )) as any[];
  return rows[0] ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAuth(req, ['webhooks:manage']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const id = Number((await params).id);
  const row = await load(id, ctx.consumer);
  if (!row) {
    await finalizeAudit(ctx, req, 404, { errorCode: 'NOT_FOUND' });
    return fail(404, Errors.notFound(), ctx.requestId, rateLimitHeaders(ctx));
  }
  await finalizeAudit(ctx, req, 200);
  return ok({
    id: row.id, url: row.url, event_types: typeof row.event_types === 'string' ? JSON.parse(row.event_types) : row.event_types,
    is_active: !!row.is_active, last_delivery_at: row.last_delivery_at, last_status: row.last_status,
  }, ctx.requestId, rateLimitHeaders(ctx));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAuth(req, ['webhooks:manage']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const id = Number((await params).id);
  const row = await load(id, ctx.consumer);
  if (!row) {
    await finalizeAudit(ctx, req, 404, { errorCode: 'NOT_FOUND' });
    return fail(404, Errors.notFound(), ctx.requestId, rateLimitHeaders(ctx));
  }
  let body: any;
  try { body = await req.json(); }
  catch {
    await finalizeAudit(ctx, req, 400, { errorCode: 'BAD_REQUEST' });
    return fail(400, Errors.badRequest('Invalid JSON'), ctx.requestId, rateLimitHeaders(ctx));
  }
  const fields: string[] = [];
  const values: any[]    = [];
  if (body.url !== undefined)         { fields.push('url = ?'); values.push(String(body.url)); }
  if (body.event_types !== undefined) { fields.push('event_types = ?'); values.push(JSON.stringify(body.event_types)); }
  if (body.is_active !== undefined)   { fields.push('is_active = ?'); values.push(body.is_active ? 1 : 0); }
  if (!fields.length) {
    await finalizeAudit(ctx, req, 400, { errorCode: 'BAD_REQUEST' });
    return fail(400, Errors.badRequest('No mutable fields'), ctx.requestId, rateLimitHeaders(ctx));
  }
  values.push(id);
  await query(`UPDATE webhook_subscriptions SET ${fields.join(', ')} WHERE id = ?`, values);
  await finalizeAudit(ctx, req, 200);
  return ok({ id, updated: true }, ctx.requestId, rateLimitHeaders(ctx));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAuth(req, ['webhooks:manage']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const id = Number((await params).id);
  const row = await load(id, ctx.consumer);
  if (!row) {
    await finalizeAudit(ctx, req, 404, { errorCode: 'NOT_FOUND' });
    return fail(404, Errors.notFound(), ctx.requestId, rateLimitHeaders(ctx));
  }
  await query(`DELETE FROM webhook_subscriptions WHERE id = ?`, [id]);
  await finalizeAudit(ctx, req, 200);
  return ok({ id, deleted: true }, ctx.requestId, rateLimitHeaders(ctx));
}
