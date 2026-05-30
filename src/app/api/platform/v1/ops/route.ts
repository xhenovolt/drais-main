/**
 * Platform operations metrics — for observability dashboards / oncall.
 * Returns rolling window counters from platform_api_audit + webhook_deliveries.
 *
 * Scope: audit:read
 */
import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';

async function safe<T>(p: Promise<T>, fb: T): Promise<T> { try { return await p; } catch { return fb; } }

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req, ['audit:read']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;

  const url = new URL(req.url);
  const windowMin = Math.min(1440, Math.max(1, parseInt(url.searchParams.get('window') ?? '15', 10) || 15));

  // Per-consumer view (operator key 'internal_ops' sees the whole platform).
  const isOperator = ctx.consumer === 'internal_ops';
  const consumerSql    = isOperator ? '' : 'AND consumer = ?';
  const consumerParams = isOperator ? []  : [ctx.consumer];

  const [counters, latency, webhookHealth] = await Promise.all([
    safe(query(
      `SELECT
         COUNT(*)                                                          AS total_requests,
         SUM(error_code IN ('UNAUTHORIZED','KEY_REVOKED','KEY_EXPIRED'))    AS auth_failures,
         SUM(error_code = 'INSUFFICIENT_SCOPE')                            AS scope_denials,
         SUM(error_code = 'RATE_LIMITED')                                  AS rate_limited,
         SUM(error_code = 'SERVER_ERROR')                                  AS server_errors,
         SUM(error_code = 'IP_NOT_ALLOWED')                                AS ip_denied,
         SUM(error_code = 'PAYLOAD_TOO_LARGE')                             AS too_large,
         SUM(error_code = 'CONFLICT')                                      AS idempotency_conflicts
       FROM platform_api_audit
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
         ${consumerSql}`,
      [windowMin, ...consumerParams],
    ) as Promise<any[]>, [{}]),

    safe(query(
      `SELECT
         AVG(response_ms) AS avg_ms,
         MAX(response_ms) AS max_ms
       FROM platform_api_audit
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
         AND response_ms IS NOT NULL
         ${consumerSql}`,
      [windowMin, ...consumerParams],
    ) as Promise<any[]>, [{}]),

    safe(query(
      `SELECT
         SUM(status = 'pending')  AS pending,
         SUM(status = 'failed')   AS failed,
         SUM(status = 'delivered' AND delivered_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS delivered_24h,
         SUM(status = 'dead'      AND created_at   >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS dead_24h,
         SUM(status = 'failed'    AND updated_at   >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS failed_24h
       FROM webhook_deliveries`,
    ) as Promise<any[]>, [{}]),
  ]);

  const c   = counters[0] ?? {};
  const lat = latency[0]  ?? {};
  const w   = webhookHealth[0] ?? {};

  const data = {
    window_minutes:        windowMin,
    total_requests:        Number(c.total_requests ?? 0),
    auth_failures:         Number(c.auth_failures ?? 0),
    scope_denials:         Number(c.scope_denials ?? 0),
    rate_limited:          Number(c.rate_limited ?? 0),
    server_errors:         Number(c.server_errors ?? 0),
    ip_denied:             Number(c.ip_denied ?? 0),
    payload_too_large:     Number(c.too_large ?? 0),
    idempotency_conflicts: Number(c.idempotency_conflicts ?? 0),
    avg_response_ms:       lat.avg_ms == null ? null : Number(lat.avg_ms),
    max_response_ms:       lat.max_ms == null ? null : Number(lat.max_ms),
    webhook_pending:       Number(w.pending ?? 0),
    webhook_failed:        Number(w.failed ?? 0),
    webhook_delivered_24h: Number(w.delivered_24h ?? 0),
    webhook_failed_24h:    Number(w.failed_24h ?? 0),
    webhook_dead_24h:      Number(w.dead_24h ?? 0),
    generated_at:          new Date().toISOString(),
  };

  await finalizeAudit(ctx, req, 200);
  return ok(data, ctx.requestId, rateLimitHeaders(ctx));
}
