/**
 * Turn any API error body into a sentence a person can act on.
 *
 * WHY THIS EXISTS
 * DRAIS answers errors in two different shapes, and code that knows only one
 * of them shows the user "[object Object]":
 *
 *   A)  { error: "Forbidden: missing permission 'audit.read'", code: 'FORBIDDEN' }
 *          — src/lib/rbac.ts, requireModule.ts, and most route handlers
 *
 *   B)  { success: false, error: { code: 'SESSION_EXPIRED', message: '…' } }
 *          — src/lib/apiResponse.ts (ApiErrorFactory, createErrorResponse)
 *
 * The audit trail read `data.error` and passed it to `new Error(...)`. Against
 * shape B that produces the message "[object Object]", and because the page
 * throws on failure, the whole list is replaced by that string — which is why
 * the audit trail appeared to show "[object Object] instead of the audits".
 * The session had expired, or a permission was missing; the screen simply
 * could not say so.
 *
 * Both shapes are legitimate and widely used, so rather than migrate hundreds
 * of routes, readers use this to understand either.
 */

/** Extracts a displayable message from an error body of either shape. */
export function apiErrorMessage(body: unknown, fallback = 'Something went wrong.'): string {
  if (body == null) return fallback;
  if (typeof body === 'string') return body.trim() || fallback;

  if (typeof body !== 'object') return String(body);

  const b = body as Record<string, any>;

  const err = b.error;

  // Shape A: the sentence is the error itself.
  if (typeof err === 'string' && err.trim()) return err.trim();

  // Shape B: a written message nested under `error`.
  if (err && typeof err === 'object') {
    const nested = err.message ?? err.error ?? err.detail;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }

  // Some handlers put the sentence at the top level and leave only a code
  // nested — `{ message: 'Not authenticated', error: { code: 'AUTH_REQUIRED' } }`.
  // Prefer the sentence over the code.
  for (const key of ['message', 'detail', 'reason', 'statusText']) {
    const v = b[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }

  // Last resort: a machine code is still better than "[object Object]".
  const code = (err && typeof err === 'object' ? err.code : undefined) ?? b.code;
  if (typeof code === 'string' && code.trim()) return code.trim();

  return fallback;
}

/**
 * Reads a fetch Response and returns its error message, whatever it contains —
 * JSON of either shape, an HTML error page, or nothing at all. Never throws.
 */
export async function responseErrorMessage(res: Response, fallback?: string): Promise<string> {
  const base = fallback ?? `The server replied ${res.status}.`;
  const raw = await res.text().catch(() => '');
  if (!raw) return base;

  try {
    return apiErrorMessage(JSON.parse(raw), base);
  } catch {
    // Not JSON — an HTML login page, typically, which means the session went.
    if (/<!doctype html|<html/i.test(raw)) {
      return res.status === 401 || res.status === 403
        ? 'Your session has expired. Sign in and try again.'
        : base;
    }
    return raw.trim().slice(0, 200) || base;
  }
}
