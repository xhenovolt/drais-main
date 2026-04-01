/**
 * System-level error logger.
 * Writes to the `system_errors` table created by migration 020.
 *
 * Usage:
 *   import { logSystemError } from "@/lib/errorLogger";
 *   await logSystemError({ endpoint: req.url, method: "POST", error, schoolId, userId });
 *
 * Fire-and-forget — never throws. Failures are printed to stderr only.
 */

import { query } from "@/lib/db";

export interface SystemErrorPayload {
  endpoint: string;
  method?: string;
  error: unknown;
  schoolId?: string | number | null;
  userId?: string | number | null;
  /** Extra context (request body snippet, query params, etc.) */
  context?: Record<string, unknown>;
}

function normalizeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  if (typeof err === "string") return { message: err };
  try { return { message: JSON.stringify(err) }; }
  catch { return { message: String(err) }; }
}

/**
 * Persist an error to `system_errors`. Never throws.
 */
export async function logSystemError(payload: SystemErrorPayload): Promise<void> {
  const { endpoint, method, error, schoolId, userId, context } = payload;
  const { message, stack } = normalizeError(error);

  const metaJson = context
    ? JSON.stringify(context).substring(0, 4096)   // guard against huge bodies
    : null;

  try {
    await query(
      `INSERT INTO system_errors
        (school_id, user_id, endpoint, method, error_message, stack_trace, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        schoolId   ?? null,
        userId     ?? null,
        endpoint   ?? "unknown",
        method     ?? "UNKNOWN",
        message    ?? "No message",
        stack      ?? null,
        metaJson,
      ]
    );
  } catch (dbErr) {
    // Log to stderr so it still surfaces in server logs, but never propagates
    console.error("[errorLogger] Failed to persist system error:", dbErr);
    console.error("[errorLogger] Original error:", message);
  }
}

/**
 * Convenience wrapper for API route handlers.
 *
 * @example
 * catch (err) {
 *   await catchAndLog(req, err, session?.schoolId, session?.userId);
 *   return NextResponse.json({ error: "Internal error" }, { status: 500 });
 * }
 */
export async function catchAndLog(
  req: { url?: string; method?: string },
  error: unknown,
  schoolId?: string | number | null,
  userId?: string | number | null,
  context?: Record<string, unknown>
): Promise<void> {
  await logSystemError({
    endpoint: req.url ?? "unknown",
    method:   req.method ?? "UNKNOWN",
    error,
    schoolId,
    userId,
    context,
  });
}
