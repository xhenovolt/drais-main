import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req, ['health:read']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;

  let dbOk = false;
  try {
    const r = (await query(`SELECT 1 AS ok`)) as any[];
    dbOk = !!r?.[0]?.ok;
  } catch {}

  const data = {
    status:    dbOk ? 'healthy' : 'degraded',
    version:   'v1',
    timestamp: new Date().toISOString(),
    services:  { database: dbOk ? 'up' : 'down' },
    consumer:  ctx.consumer,
  };
  await finalizeAudit(ctx, req, 200);
  return ok(data, ctx.requestId, rateLimitHeaders(ctx));
}
