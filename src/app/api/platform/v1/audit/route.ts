import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';

const MAX = 200;

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req, ['audit:read']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;

  const url    = new URL(req.url);
  const limit  = Math.min(MAX, Math.max(1, parseInt(url.searchParams.get('limit') ?? '100', 10) || 100));
  const cursor = parseInt(url.searchParams.get('cursor') ?? '0', 10) || 0;
  const keyId  = url.searchParams.get('key_id');
  const path   = url.searchParams.get('path');

  const where: string[] = [];
  const params: any[]   = [];
  if (cursor) { where.push('id < ?'); params.push(cursor); }
  if (keyId)  { where.push('key_id = ?'); params.push(keyId); }
  if (path)   { where.push('path = ?');   params.push(path); }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = (await query(
    `SELECT id, request_id, key_id, consumer, method, path, status_code, ip,
            idempotency_key, response_ms, error_code, school_id, created_at
       FROM platform_api_audit ${sql}
      ORDER BY id DESC LIMIT ?`,
    [...params, limit + 1],
  )) as any[];

  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  await finalizeAudit(ctx, req, 200);
  return ok({
    items: page,
    next_cursor: more ? page[page.length - 1].id : null,
    limit,
  }, ctx.requestId, rateLimitHeaders(ctx));
}
