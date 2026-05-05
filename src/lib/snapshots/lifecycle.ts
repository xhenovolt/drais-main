/**
 * Snapshot lifecycle utilities.
 *
 * Centralises the state machine that wraps `report_snapshots`:
 *
 *   generating ──(success)──▶ ready
 *              ──(error)─────▶ failed
 *              ──(cancel)────▶ cancelled
 *              ──(timeout)───▶ stale
 *
 * Terminal states (ready/failed/cancelled/stale) all have NULL inflight_lock,
 * so the uk_inflight unique index only blocks a second `generating` row for
 * the same (school, term, year, type). This means re-generation never
 * collides with terminal-state history.
 */
import { query } from '@/lib/db';
import type { SnapshotRow, SnapshotType } from './types';

/**
 * How long an in-flight generation may run before it is considered stale.
 * After this window the row is reaped and the slot is released.
 *
 * Tuned for the worst-case full-school snapshot. Bump if generation latency
 * grows; the only cost of being too high is delayed recovery from a crash.
 */
export const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface InflightInfo {
  snapshotId:   string;
  generatedBy:  number;
  generatedAt:  string;
  ageMs:        number;
}

/**
 * Look up the in-flight (`status='generating'`) row for a given key, if any.
 * The uk_inflight index makes this O(1).
 */
export async function findInflight(args: {
  schoolId: number;
  type:     SnapshotType;
  termId:   number;
  yearId:   number;
}): Promise<InflightInfo | null> {
  const rows = (await query(
    `SELECT snapshot_id, generated_by, generated_at,
            TIMESTAMPDIFF(MICROSECOND, generated_at, NOW(6)) / 1000 AS age_ms
       FROM report_snapshots
      WHERE school_id = ?
        AND type      = ?
        AND term_id   = ?
        AND year_id   = ?
        AND status    = 'generating'
      LIMIT 1`,
    [args.schoolId, args.type, args.termId, args.yearId],
  )) as Array<{ snapshot_id: string; generated_by: number; generated_at: string; age_ms: number }>;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    snapshotId:  r.snapshot_id,
    generatedBy: r.generated_by,
    generatedAt: typeof r.generated_at === 'string' ? r.generated_at : new Date(r.generated_at).toISOString(),
    ageMs:       Number(r.age_ms),
  };
}

/**
 * Reap any in-flight row older than STALE_TIMEOUT_MS. Returns the number of
 * rows transitioned to `stale`. Cheap enough to call on every generation
 * attempt — no separate cron required.
 */
export async function sweepStale(args: {
  schoolId: number;
  type:     SnapshotType;
  termId:   number;
  yearId:   number;
}): Promise<number> {
  const result = (await query(
    `UPDATE report_snapshots
        SET status        = 'stale',
            error_message = CONCAT('reaped after ', TIMESTAMPDIFF(SECOND, generated_at, NOW()), 's of inactivity'),
            completed_at  = NOW()
      WHERE school_id    = ?
        AND type         = ?
        AND term_id      = ?
        AND year_id      = ?
        AND status       = 'generating'
        AND generated_at < (NOW() - INTERVAL ? MICROSECOND)`,
    [args.schoolId, args.type, args.termId, args.yearId, STALE_TIMEOUT_MS * 1000],
  )) as any;
  return Number(result?.affectedRows ?? 0);
}

/**
 * Force-cancel an in-flight generation by snapshot id. Used by the explicit
 * cancel route and by `force=true` regeneration. Returns true if a row was
 * actually moved out of `generating`.
 */
export async function forceCancel(args: {
  snapshotId: string;
  schoolId:   number;
  reason:     string;
  cancelledBy: number;
}): Promise<boolean> {
  const result = (await query(
    `UPDATE report_snapshots
        SET status        = 'cancelled',
            error_message = ?,
            completed_at  = NOW()
      WHERE snapshot_id   = ?
        AND school_id     = ?
        AND status        = 'generating'`,
    [`cancelled by user ${args.cancelledBy}: ${args.reason}`.slice(0, 1000), args.snapshotId, args.schoolId],
  )) as any;
  return Number(result?.affectedRows ?? 0) > 0;
}

/**
 * Cancel any in-flight generation for the given key. Used as the precursor
 * to `force=true` regeneration so the new INSERT does not collide.
 */
export async function cancelInflightForKey(args: {
  schoolId:    number;
  type:        SnapshotType;
  termId:      number;
  yearId:      number;
  cancelledBy: number;
}): Promise<number> {
  const result = (await query(
    `UPDATE report_snapshots
        SET status        = 'cancelled',
            error_message = ?,
            completed_at  = NOW()
      WHERE school_id    = ?
        AND type         = ?
        AND term_id      = ?
        AND year_id      = ?
        AND status       = 'generating'`,
    [
      `cancelled by user ${args.cancelledBy} for force-regeneration`,
      args.schoolId,
      args.type,
      args.termId,
      args.yearId,
    ],
  )) as any;
  return Number(result?.affectedRows ?? 0);
}

/**
 * Find existing `ready` snapshots that share the user-facing key. Used to
 * power the "Reports for this term already exist" warning.
 */
export async function findReadyForKey(args: {
  schoolId:     number;
  type:         SnapshotType;
  termId:       number;
  yearId:       number;
  resultTypeId: number | null;
}): Promise<SnapshotRow[]> {
  const rows = (await query(
    `SELECT id, snapshot_id, school_id, type, term_id, year_id, result_type_id,
            status, data_hash, class_count, student_count, result_count,
            generated_by, generated_at, completed_at, generation_ms,
            error_message, is_legacy_fallback
       FROM report_snapshots
      WHERE school_id      = ?
        AND type           = ?
        AND term_id        = ?
        AND year_id        = ?
        AND ((? IS NULL AND result_type_id IS NULL) OR result_type_id = ?)
        AND status         = 'ready'
      ORDER BY generated_at DESC
      LIMIT 25`,
    [
      args.schoolId, args.type, args.termId, args.yearId,
      args.resultTypeId, args.resultTypeId,
    ],
  )) as any[];
  return rows.map(r => ({
    id:               r.id,
    snapshotId:       r.snapshot_id,
    schoolId:         r.school_id,
    type:             r.type,
    termId:           r.term_id,
    yearId:           r.year_id,
    resultTypeId:     r.result_type_id,
    status:           r.status,
    dataHash:         r.data_hash,
    classCount:       r.class_count,
    studentCount:     r.student_count,
    resultCount:      r.result_count,
    generatedBy:      r.generated_by,
    generatedAt:      typeof r.generated_at === 'string' ? r.generated_at : new Date(r.generated_at).toISOString(),
    completedAt:      r.completed_at ? (typeof r.completed_at === 'string' ? r.completed_at : new Date(r.completed_at).toISOString()) : null,
    generationMs:     r.generation_ms,
    errorMessage:     r.error_message,
    isLegacyFallback: r.is_legacy_fallback === 1,
  }));
}

export interface FlushCriteria {
  schoolId:     number;
  type?:        SnapshotType;
  termId?:      number;
  yearId?:      number;
  resultTypeId?:number | null;
  classIds?:    number[];          // reserved; current schema does not key on class
  status?:      Array<'ready' | 'failed' | 'cancelled' | 'stale'>;
}

/**
 * Hard-delete snapshots matching the given criteria. School scoping is
 * mandatory. Excludes `generating` rows by default — call `cancelInflight*`
 * first if you also want to clear in-flight work.
 *
 * Returns the number of rows removed.
 */
export async function flushSnapshots(c: FlushCriteria): Promise<number> {
  const where: string[] = ['school_id = ?'];
  const params: any[]   = [c.schoolId];

  if (c.type)   { where.push('type = ?');    params.push(c.type); }
  if (c.termId !== undefined) { where.push('term_id = ?'); params.push(c.termId); }
  if (c.yearId !== undefined) { where.push('year_id = ?'); params.push(c.yearId); }
  if (c.resultTypeId !== undefined) {
    if (c.resultTypeId === null) {
      where.push('result_type_id IS NULL');
    } else {
      where.push('result_type_id = ?');
      params.push(c.resultTypeId);
    }
  }

  const statuses = c.status ?? ['ready', 'failed', 'cancelled', 'stale'];
  if (!statuses.length) return 0;
  where.push(`status IN (${statuses.map(() => '?').join(',')})`);
  params.push(...statuses);

  const result = (await query(
    `DELETE FROM report_snapshots WHERE ${where.join(' AND ')}`,
    params,
  )) as any;
  return Number(result?.affectedRows ?? 0);
}
