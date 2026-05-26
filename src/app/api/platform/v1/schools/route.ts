import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, fail, Errors, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';

const MAX_PAGE = 100;

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req, ['schools:read']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;

  const url     = new URL(req.url);
  const limit   = Math.min(MAX_PAGE, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const cursor  = parseInt(url.searchParams.get('cursor') ?? '0', 10) || 0;
  const status  = url.searchParams.get('status');
  const search  = url.searchParams.get('search');

  const where: string[] = ['deleted_at IS NULL', 'external_id IS NOT NULL'];
  const params: any[]   = [];
  if (cursor) { where.push('id < ?'); params.push(cursor); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (search) { where.push('(name LIKE ? OR email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const rows = (await query(
    `SELECT id, external_id, name, email, phone, status, subscription_status, subscription_plan,
            created_at, updated_at
       FROM schools
      WHERE ${where.join(' AND ')}
      ORDER BY id DESC
      LIMIT ?`,
    [...params, limit + 1],
  )) as any[];

  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  const nextCursor = more ? page[page.length - 1].id : null;

  const data = {
    items: page.map(r => ({
      external_id:         r.external_id,
      name:                r.name,
      email:               r.email,
      phone:               r.phone,
      status:              r.status,
      subscription_status: r.subscription_status,
      subscription_plan:   r.subscription_plan,
      created_at:          r.created_at,
      updated_at:          r.updated_at,
    })),
    next_cursor: nextCursor,
    limit,
  };

  await finalizeAudit(ctx, req, 200);
  return ok(data, ctx.requestId, rateLimitHeaders(ctx));
}
