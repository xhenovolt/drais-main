import { query } from '@/lib/db';

export interface RateLimitResult {
  allowed:   boolean;
  remaining: number;
  resetAt:   Date;
  limit:     number;
}

/** TiDB-backed sliding-minute window. Atomic via INSERT ... ON DUPLICATE KEY UPDATE. */
export async function checkRateLimit(keyId: string, limitPerMin: number): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const bucket = `${keyId}|${windowStart.toISOString()}`;
  const resetAt = new Date(windowStart.getTime() + 60_000);

  await query(
    `INSERT INTO platform_rate_limits (bucket_key, window_start, count)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE count = count + 1`,
    [bucket, windowStart],
  );

  const rows = (await query(
    `SELECT count FROM platform_rate_limits WHERE bucket_key = ?`,
    [bucket],
  )) as Array<{ count: number }>;
  const count = rows[0]?.count ?? 1;

  return {
    allowed:   count <= limitPerMin,
    remaining: Math.max(0, limitPerMin - count),
    resetAt,
    limit:     limitPerMin,
  };
}

/** Best-effort cleanup; safe to invoke from cron. */
export async function pruneRateLimits(olderThanMinutes = 10): Promise<void> {
  await query(
    `DELETE FROM platform_rate_limits
      WHERE window_start < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [olderThanMinutes],
  );
}
