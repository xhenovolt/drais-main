import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';

const MAX = 200;

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req, ['events:read']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;

  const url       = new URL(req.url);
  const limit     = Math.min(MAX, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const cursor    = parseInt(url.searchParams.get('cursor') ?? '0', 10) || 0;
  const eventType = url.searchParams.get('event_type');
  const since     = url.searchParams.get('since'); // ISO

  const where: string[] = [];
  const params: any[]   = [];
  if (cursor)    { where.push('id < ?'); params.push(cursor); }
  if (eventType) { where.push('event_type = ?'); params.push(eventType); }
  if (since)     { where.push('emitted_at >= ?'); params.push(since); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = (await query(
    `SELECT id, event_type, school_id, payload, emitted_at
       FROM platform_events ${whereSql}
      ORDER BY id DESC LIMIT ?`,
    [...params, limit + 1],
  )) as any[];

  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  const data = {
    items: page.map(r => ({
      id:         r.id,
      event_type: r.event_type,
      school_id:  r.school_id,
      payload:    typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      emitted_at: r.emitted_at,
    })),
    next_cursor: more ? page[page.length - 1].id : null,
    limit,
  };
  await finalizeAudit(ctx, req, 200);
  return ok(data, ctx.requestId, rateLimitHeaders(ctx));
}
