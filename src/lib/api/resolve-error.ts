/**
 * resolveError — PURE error→HTTP mapping for withRoute (Phase G).
 * Kept in its own dependency-free module so it is unit-testable without
 * pulling in next/server or the auth stack.
 */
export interface ResolvedError { status: number; body: { error: string } }

/**
 * Turn a thrown value into an HTTP status + safe JSON body.
 * A deliberate 4xx (validation/permission carrying `statusCode`/`status`) keeps
 * its message; anything else is a 500 whose internal message is hidden in prod.
 */
export function resolveError(err: any, isProd = process.env.NODE_ENV === 'production'): ResolvedError {
  const status = Number(err?.statusCode ?? err?.status);
  if (Number.isFinite(status) && status >= 400 && status <= 499) {
    return { status, body: { error: String(err?.message || 'Request rejected') } };
  }
  return { status: 500, body: { error: isProd ? 'Internal server error' : String(err?.message || 'Internal server error') } };
}
