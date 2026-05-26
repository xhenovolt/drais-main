/**
 * Helper for hardened mutation handlers: enforces request body size limit,
 * applies idempotency-key caching, and provides a consistent try/catch that
 * always finalizes audit on the way out.
 *
 * Use this for POST/PATCH/PUT/DELETE handlers in the platform layer.
 */
import { NextRequest } from 'next/server';
import { lookupIdempotent, storeIdempotent } from './idempotency';
import { finalizeAudit, type AuthedPlatformContext } from './auth';
import { fail, Errors } from './response';

const MAX_BODY_BYTES = 1_000_000; // 1 MB

export interface MutationOpts {
  schoolIdHint?: number | null;
}

export type MutationHandler = (args: {
  body:           string;          // raw body as text (already size-checked)
  json:           any;             // parsed JSON, or null if empty body
  idempotencyKey: string | null;
}) => Promise<{ status: number; body: any; schoolId?: number | null; errorCode?: string }>;

export async function runMutation(
  req: NextRequest,
  ctx: AuthedPlatformContext,
  handler: MutationHandler,
  opts: MutationOpts = {},
): Promise<Response> {
  const idemKey = req.headers.get('x-idempotency-key');
  const path    = new URL(req.url).pathname;
  const method  = req.method;

  // Read body once (we need to hash it for idempotency)
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    await finalizeAudit(ctx, req, 413, { errorCode: 'PAYLOAD_TOO_LARGE', payloadBytes: raw.length });
    return fail(413, { code: 'PAYLOAD_TOO_LARGE', message: `Body exceeds ${MAX_BODY_BYTES} bytes` }, ctx.requestId);
  }

  let parsed: any = null;
  if (raw.length) {
    try { parsed = JSON.parse(raw); }
    catch {
      await finalizeAudit(ctx, req, 400, { errorCode: 'BAD_REQUEST', payloadBytes: raw.length });
      return fail(400, Errors.badRequest('Invalid JSON'), ctx.requestId);
    }
  }

  if (idemKey) {
    const { hit, conflict } = await lookupIdempotent(ctx.keyId, idemKey, method, path, raw);
    if (conflict) {
      await finalizeAudit(ctx, req, 409, { errorCode: 'CONFLICT', idempotencyKey: idemKey, payloadBytes: raw.length });
      return fail(409, Errors.conflict('Idempotency-Key reused with a different request body'), ctx.requestId);
    }
    if (hit) {
      await finalizeAudit(ctx, req, hit.status, { idempotencyKey: idemKey, schoolId: opts.schoolIdHint ?? null, payloadBytes: raw.length });
      return new Response(hit.body, {
        status: hit.status,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': ctx.requestId, 'X-Idempotent-Replay': 'true' },
      });
    }
  }

  let result;
  try {
    result = await handler({ body: raw, json: parsed, idempotencyKey: idemKey });
  } catch (e: any) {
    console.error('[platform] handler error', e);
    await finalizeAudit(ctx, req, 500, { errorCode: 'SERVER_ERROR', idempotencyKey: idemKey, payloadBytes: raw.length });
    return fail(500, Errors.serverError(), ctx.requestId);
  }

  const responseBody = JSON.stringify({ success: result.status < 400, ...(result.status < 400 ? { data: result.body } : { error: result.body }) });
  if (idemKey && result.status < 500) {
    await storeIdempotent(ctx.keyId, idemKey, method, path, raw, result.status, responseBody);
  }
  await finalizeAudit(ctx, req, result.status, {
    schoolId:       result.schoolId ?? opts.schoolIdHint ?? null,
    idempotencyKey: idemKey,
    payloadBytes:   raw.length,
    errorCode:      result.errorCode ?? null,
  });

  return new Response(responseBody, {
    status: result.status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': ctx.requestId, 'X-Api-Version': 'v1', 'Cache-Control': 'no-store' },
  });
}
