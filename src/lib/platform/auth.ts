import { NextRequest } from 'next/server';
import { getKeyByKeyId, verifySecret, type PlatformKeyRow } from './keys';
import { hasScope, type PlatformScope } from './scopes';
import { checkRateLimit, type RateLimitResult } from './rateLimit';
import { writePlatformAudit } from './audit';
import { fail, ok, created, newRequestId, Errors } from './response';
import { query } from '@/lib/db';

export interface AuthedPlatformContext {
  requestId: string;
  keyId:     string;
  consumer:  string;
  scopes:    string[];
  rl:        RateLimitResult;
  ip:        string;
  startedAt: number;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function parseBearer(req: NextRequest): { keyId: string; secret: string } | null {
  const h = req.headers.get('authorization');
  if (!h) {
    const xKey = req.headers.get('x-api-key');
    if (!xKey) return null;
    const [keyId, secret] = xKey.split('.');
    if (!keyId || !secret) return null;
    return { keyId, secret };
  }
  if (!h.toLowerCase().startsWith('bearer ')) return null;
  const token = h.slice(7).trim();
  const [keyId, secret] = token.split('.');
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

export async function requirePlatformAuth(
  req: NextRequest,
  requiredScopes: PlatformScope[],
): Promise<{ ctx: AuthedPlatformContext } | { errorResponse: Response }> {
  const requestId = newRequestId();
  const ip        = clientIp(req);
  const startedAt = Date.now();
  const method    = req.method;
  const path      = new URL(req.url).pathname;

  const finish = async (status: number, errCode: string, msg: string) => {
    await writePlatformAudit({
      requestId, keyId: null, consumer: null, method, path,
      statusCode: status, ip, userAgent: req.headers.get('user-agent'),
      errorCode: errCode, responseMs: Date.now() - startedAt,
    });
    return fail(status, { code: errCode, message: msg }, requestId);
  };

  const parsed = parseBearer(req);
  if (!parsed) return { errorResponse: await finish(401, 'UNAUTHORIZED', 'Missing or malformed credentials') };

  const row: PlatformKeyRow | null = await getKeyByKeyId(parsed.keyId);
  if (!row)                return { errorResponse: await finish(401, 'UNAUTHORIZED', 'Invalid key') };
  if (row.revoked_at)      return { errorResponse: await finish(401, 'KEY_REVOKED', 'Key revoked') };
  if (row.expires_at && new Date(row.expires_at) < new Date())
                            return { errorResponse: await finish(401, 'KEY_EXPIRED', 'Key expired') };

  const okSecret = await verifySecret(parsed.secret, row.secret_hash);
  if (!okSecret)           return { errorResponse: await finish(401, 'UNAUTHORIZED', 'Invalid key') };

  const allowedIps = Array.isArray(row.allowed_ips) ? row.allowed_ips
                   : (row.allowed_ips ? JSON.parse(row.allowed_ips as any) : null);
  if (allowedIps && allowedIps.length && !allowedIps.includes(ip)) {
    return { errorResponse: await finish(403, 'IP_NOT_ALLOWED', 'IP not in allowlist') };
  }

  const scopes = Array.isArray(row.scopes) ? row.scopes : JSON.parse(row.scopes as any);
  for (const s of requiredScopes) {
    if (!hasScope(scopes, s)) {
      return { errorResponse: await finish(403, 'INSUFFICIENT_SCOPE', `Missing scope: ${s}`) };
    }
  }

  const rl = await checkRateLimit(row.key_id, row.rate_limit_per_min);
  if (!rl.allowed) {
    await writePlatformAudit({
      requestId, keyId: row.key_id, consumer: row.consumer, method, path,
      statusCode: 429, ip, userAgent: req.headers.get('user-agent'),
      errorCode: 'RATE_LIMITED', responseMs: Date.now() - startedAt,
    });
    return {
      errorResponse: fail(429, Errors.rateLimited(), requestId, {
        'X-RateLimit-Limit':     String(rl.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset':     String(Math.floor(rl.resetAt.getTime() / 1000)),
        'Retry-After':           String(Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000))),
      }),
    };
  }

  query(
    `UPDATE platform_api_keys SET last_used_at = NOW(), last_used_ip = ? WHERE key_id = ?`,
    [ip, row.key_id],
  ).catch(() => {});

  return {
    ctx: {
      requestId,
      keyId:    row.key_id,
      consumer: row.consumer,
      scopes,
      rl,
      ip,
      startedAt,
    },
  };
}

export async function finalizeAudit(
  ctx: AuthedPlatformContext,
  req: NextRequest,
  status: number,
  opts: { schoolId?: number | null; idempotencyKey?: string | null; errorCode?: string | null; payloadBytes?: number | null } = {},
): Promise<void> {
  await writePlatformAudit({
    requestId: ctx.requestId,
    keyId:     ctx.keyId,
    consumer:  ctx.consumer,
    method:    req.method,
    path:      new URL(req.url).pathname,
    statusCode: status,
    ip:        ctx.ip,
    userAgent: req.headers.get('user-agent'),
    schoolId:  opts.schoolId ?? null,
    idempotencyKey: opts.idempotencyKey ?? null,
    errorCode: opts.errorCode ?? null,
    payloadBytes: opts.payloadBytes ?? null,
    responseMs: Date.now() - ctx.startedAt,
  });
}

export function rateLimitHeaders(ctx: AuthedPlatformContext): Record<string, string> {
  return {
    'X-RateLimit-Limit':     String(ctx.rl.limit),
    'X-RateLimit-Remaining': String(ctx.rl.remaining),
    'X-RateLimit-Reset':     String(Math.floor(ctx.rl.resetAt.getTime() / 1000)),
  };
}

export { ok, created, fail, Errors };
