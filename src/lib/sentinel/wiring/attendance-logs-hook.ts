/**
 * DRAIS Sentinel — wiring for /api/attendance/history (the attendance logs
 * route).
 *
 * Kept OUT of the route file itself beyond a single import + a single
 * fire-and-forget call, per the task's implementation-discipline rule: do
 * not spread Sentinel logic through unrelated business files. This module
 * is Sentinel's, not the attendance route's.
 */
import { query } from '@/lib/db';
import { detectTimestampAnomaly, toObservation } from '../observers/attendance-timestamp';
import { recordIncident } from '../incidents';
import { observeRequest } from '../observe';
import { beatSuccess, HEARTBEATS } from '../heartbeat';

export async function sentinelObserveAttendanceLogs(schoolId: number, rows: Array<{ clock_skew_seconds?: number | null }>): Promise<void> {
  try {
    observeRequest({ schoolId, module: 'Attendance Logs', statusCode: 200, durationMs: 0, signal: { recordCount: rows.length } });
    void beatSuccess(HEARTBEATS.SENTINEL_REQUEST_TAP);

    const result = detectTimestampAnomaly(rows.map((r) => ({ clockSkewSeconds: r.clock_skew_seconds ?? null })));
    if (!result.anomaly) return;

    const schoolRows = (await query(`SELECT name FROM schools WHERE id = ? LIMIT 1`, [schoolId]).catch(() => [])) as any[];
    const schoolName = schoolRows[0]?.name ?? `School #${schoolId}`;

    await recordIncident(toObservation(schoolId, schoolName, 'Attendance Logs', result));
  } catch (err) {
    console.warn('[sentinel] attendance-logs observation failed (non-fatal):', err);
  }
}
