/**
 * GET /api/platform/v1 — API discovery / self-description (P25).
 *
 * The versioned root: any valid key (no specific scope) gets the contract —
 * version, the scope catalog, and every endpoint with its method + required
 * scope. Doubles as a cheap "is my key valid?" probe and returns the caller's
 * live rate-limit headers.
 */
import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, rateLimitHeaders } from '@/lib/platform/auth';
import { PLATFORM_SCOPES } from '@/lib/platform/scopes';

export const runtime = 'nodejs';

const ENDPOINTS = [
  { method: 'GET',   path: '/api/platform/v1',                                    scope: null,               description: 'This discovery document.' },
  { method: 'GET',   path: '/api/platform/v1/health',                            scope: 'health:read',      description: 'Service + database health.' },
  { method: 'GET',   path: '/api/platform/v1/schools',                           scope: 'schools:read',     description: 'List schools (paginated).' },
  { method: 'GET',   path: '/api/platform/v1/schools/{external_id}',             scope: 'schools:read',     description: 'A single school.' },
  { method: 'PATCH', path: '/api/platform/v1/schools/{external_id}',             scope: 'schools:write',    description: 'Update a school.' },
  { method: 'POST',  path: '/api/platform/v1/schools/{external_id}/suspend',     scope: 'schools:write',    description: 'Suspend a school.' },
  { method: 'POST',  path: '/api/platform/v1/schools/{external_id}/reactivate',  scope: 'schools:write',    description: 'Reactivate a school.' },
  { method: 'GET',   path: '/api/platform/v1/schools/{external_id}/features',    scope: 'features:read',    description: 'Read SMS + module flags.' },
  { method: 'PUT',   path: '/api/platform/v1/schools/{external_id}/features',    scope: 'features:write',   description: 'Toggle SMS + module flags.' },
  { method: 'GET',   path: '/api/platform/v1/schools/{external_id}/staff',       scope: 'staff:read',       description: 'Staff directory (no sensitive pay data).' },
  { method: 'GET',   path: '/api/platform/v1/subscriptions/{external_id}',       scope: 'subscriptions:read',  description: 'A school subscription.' },
  { method: 'PUT',   path: '/api/platform/v1/subscriptions/{external_id}',       scope: 'subscriptions:write', description: 'Set a school subscription.' },
  { method: 'GET',   path: '/api/platform/v1/usage',                             scope: 'usage:read',       description: 'Platform / per-school usage.' },
  { method: 'GET',   path: '/api/platform/v1/analytics',                         scope: 'analytics:read',   description: 'Aggregate analytics.' },
  { method: 'GET',   path: '/api/platform/v1/events',                            scope: 'events:read',      description: 'Recent platform events.' },
  { method: 'GET',   path: '/api/platform/v1/audit',                             scope: 'audit:read',       description: 'API audit trail.' },
  { method: 'GET',   path: '/api/platform/v1/ops',                               scope: 'audit:read',       description: 'API operational stats.' },
  { method: 'GET',   path: '/api/platform/v1/webhooks',                          scope: 'webhooks:manage',  description: 'List webhook subscriptions.' },
  { method: 'POST',  path: '/api/platform/v1/webhooks',                          scope: 'webhooks:manage',  description: 'Create a webhook subscription.' },
  { method: 'GET',   path: '/api/platform/v1/webhooks/{id}',                     scope: 'webhooks:manage',  description: 'A webhook subscription.' },
  { method: 'PATCH', path: '/api/platform/v1/webhooks/{id}',                     scope: 'webhooks:manage',  description: 'Update a webhook subscription.' },
  { method: 'GET',   path: '/api/platform/v1/webhooks/{id}/deliveries',          scope: 'webhooks:manage',  description: 'Webhook delivery attempts.' },
  { method: 'POST',  path: '/api/platform/v1/webhooks/{id}/deliveries/{deliveryId}/retry', scope: 'webhooks:manage', description: 'Retry a delivery.' },
] as const;

export async function GET(req: NextRequest) {
  // Empty scope list → authenticate the key without demanding any capability.
  const auth = await requirePlatformAuth(req, []);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;

  const data = {
    name:        'DRAIS Platform API',
    version:     'v1',
    consumer:    ctx.consumer,
    your_scopes: ctx.scopes,
    scopes:      PLATFORM_SCOPES,
    auth:        { scheme: 'Bearer', format: 'key_id.secret', header: 'Authorization: Bearer <key_id>.<secret>' },
    rate_limit:  { per_minute: ctx.rl.limit, remaining: ctx.rl.remaining },
    endpoints:   ENDPOINTS,
    generated_at: new Date().toISOString(),
  };
  await finalizeAudit(ctx, req, 200);
  return ok(data, ctx.requestId, rateLimitHeaders(ctx));
}
