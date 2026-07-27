/**
 * Control Center pagination — bounded list queries so the console stays fast
 * and memory-safe as the platform grows (P21 / scale hardening). Pure + tested;
 * every control list route funnels its page/limit through here so a client can
 * never ask for an unbounded or negative slice.
 */

export interface PageParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PageOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

/**
 * Clamp raw ?page / ?limit into a safe { page, limit, offset }.
 * - page  ≥ 1 (non-numeric / <1 → 1)
 * - limit ∈ [1, maxLimit], default defaultLimit
 */
export function parsePageParams(
  rawPage: string | null | undefined,
  rawLimit: string | null | undefined,
  opts: PageOptions = {},
): PageParams {
  const defaultLimit = opts.defaultLimit ?? 50;
  const maxLimit = opts.maxLimit ?? 200;

  const pageNum = Number.parseInt(String(rawPage ?? ''), 10);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;

  const limitNum = Number.parseInt(String(rawLimit ?? ''), 10);
  const limit = Number.isFinite(limitNum) && limitNum >= 1
    ? Math.min(limitNum, maxLimit)
    : defaultLimit;

  return { page, limit, offset: (page - 1) * limit };
}

/** totalPages for a given total + limit (≥ 1 so the UI always has one page). */
export function totalPages(total: number, limit: number): number {
  if (limit <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / limit));
}
