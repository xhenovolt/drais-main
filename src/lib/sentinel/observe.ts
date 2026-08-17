/**
 * DRAIS Sentinel — lightweight request-time observation tap.
 *
 * This is the ONLY thing Sentinel does on the hot path of a normal request.
 * It must be negligible: one small INSERT, fire-and-forget, never awaited by
 * the caller's response, never throws, never logs a request/response body.
 *
 * Deep analysis (timestamp/timezone checks, tenant-isolation checks,
 * fleet-wide scans) happens OFF this path — either inline but cheap
 * (observers/attendance-timestamp.ts runs on data already fetched for the
 * response, no extra query) or in the periodic sweep (sweep.ts). Nothing here
 * executes a repository scan or a second database round-trip per request.
 */
import { query } from '@/lib/db';
import { ensureSentinelSchema } from './schema';

export interface RequestSignal {
  schoolId: number | null;
  module: string;
  statusCode: number;
  durationMs: number;
  errorClass?: string | null;
  /** Small, non-PII counters only — e.g. { recordCount: 147 }. Never raw rows. */
  signal?: Record<string, string | number | boolean> | null;
  correlationId?: string | null;
}

/**
 * Fire-and-forget. Call this from a route AFTER building the response,
 * never `await` it inline on the response path — e.g.:
 *
 *   const res = NextResponse.json(payload);
 *   void observeRequest({ schoolId, module: 'Attendance Logs', statusCode: 200, durationMs: Date.now() - t0 });
 *   return res;
 */
export function observeRequest(s: RequestSignal): void {
  ensureSentinelSchema()
    .then(() => query(
      `INSERT INTO sentinel_observations (school_id, module, status_code, duration_ms, error_class, signal, correlation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        s.schoolId, s.module.slice(0, 120), s.statusCode, Math.max(0, Math.round(s.durationMs)),
        s.errorClass ? s.errorClass.slice(0, 80) : null,
        s.signal ? JSON.stringify(s.signal).slice(0, 2000) : null,
        s.correlationId ? s.correlationId.slice(0, 64) : null,
      ],
    ))
    .catch(() => { /* observation is best-effort; it must never affect the request it observed */ });
}

export interface ModuleStats {
  module: string;
  count: number;
  errorCount: number;
  errorRate: number;
  p50DurationMs: number;
  p95DurationMs: number;
}

/** Read-side: recent error-rate / latency profile per module (for the sweep + diagnosis). */
export async function recentModuleStats(windowMinutes = 60): Promise<ModuleStats[]> {
  await ensureSentinelSchema();
  const rows = (await query(
    `SELECT module, status_code, duration_ms FROM sentinel_observations
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [windowMinutes],
  ).catch(() => [])) as Array<{ module: string; status_code: number; duration_ms: number }>;

  const byModule = new Map<string, number[]>();
  const errByModule = new Map<string, number>();
  for (const r of rows) {
    if (!byModule.has(r.module)) byModule.set(r.module, []);
    byModule.get(r.module)!.push(r.duration_ms);
    if (r.status_code >= 500) errByModule.set(r.module, (errByModule.get(r.module) ?? 0) + 1);
  }

  const out: ModuleStats[] = [];
  for (const [module, durations] of byModule) {
    const sorted = [...durations].sort((a, b) => a - b);
    const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    const errorCount = errByModule.get(module) ?? 0;
    out.push({
      module, count: sorted.length, errorCount,
      errorRate: sorted.length ? errorCount / sorted.length : 0,
      p50DurationMs: pick(0.5), p95DurationMs: pick(0.95),
    });
  }
  return out.sort((a, b) => b.errorRate - a.errorRate);
}

/** Retention: short. High-volume table — prune anything older than N days. */
export async function pruneObservations(olderThanDays = 7): Promise<number> {
  await ensureSentinelSchema();
  const r = (await query(
    `DELETE FROM sentinel_observations WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [olderThanDays],
  ).catch(() => ({ affectedRows: 0 }))) as { affectedRows?: number };
  return r.affectedRows ?? 0;
}
