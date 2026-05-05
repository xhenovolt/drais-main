/**
 * DB-backed snapshot storage.
 *
 * Snapshot bytes live in `report_snapshots.snapshot_json` (LONGTEXT).
 * No filesystem dependency — works on serverless hosts.
 */
import { query } from '@/lib/db';
import type { ReportSnapshot, SnapshotRow, SnapshotStatus, SnapshotType } from './types';

interface RawSnapshotRow {
  id: number;
  snapshot_id: string;
  school_id: number;
  type: SnapshotType;
  term_id: number;
  year_id: number;
  result_type_id: number | null;
  status: SnapshotStatus;
  data_hash: string | null;
  class_count: number;
  student_count: number;
  result_count: number;
  generated_by: number;
  generated_at: string;
  completed_at: string | null;
  generation_ms: number | null;
  error_message: string | null;
  is_legacy_fallback: number;
}

function toRow(r: RawSnapshotRow): SnapshotRow {
  return {
    id:                r.id,
    snapshotId:        r.snapshot_id,
    schoolId:          r.school_id,
    type:              r.type,
    termId:            r.term_id,
    yearId:            r.year_id,
    resultTypeId:      r.result_type_id,
    status:            r.status,
    dataHash:          r.data_hash,
    classCount:        r.class_count,
    studentCount:      r.student_count,
    resultCount:       r.result_count,
    generatedBy:       r.generated_by,
    generatedAt:       typeof r.generated_at === 'string' ? r.generated_at : new Date(r.generated_at).toISOString(),
    completedAt:       r.completed_at ? (typeof r.completed_at === 'string' ? r.completed_at : new Date(r.completed_at).toISOString()) : null,
    generationMs:      r.generation_ms,
    errorMessage:      r.error_message,
    isLegacyFallback:  r.is_legacy_fallback === 1,
  };
}

const ROW_COLUMNS = `
  id, snapshot_id, school_id, type, term_id, year_id, result_type_id,
  status, data_hash, class_count, student_count, result_count,
  generated_by, generated_at, completed_at, generation_ms,
  error_message, is_legacy_fallback
`;

/**
 * Acquire the single-flight generation slot. Returns the snapshot_id on
 * success. Throws `SnapshotInFlightError` if another generation is already
 * running for the same (school, term, year, type).
 */
export async function acquireGenerationSlot(args: {
  snapshotId:   string;
  schoolId:     number;
  type:         SnapshotType;
  termId:       number;
  yearId:       number;
  resultTypeId: number | null;
  generatedBy:  number;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO report_snapshots
        (snapshot_id, school_id, type, term_id, year_id, result_type_id,
         status, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, 'generating', ?)`,
      [
        args.snapshotId,
        args.schoolId,
        args.type,
        args.termId,
        args.yearId,
        args.resultTypeId,
        args.generatedBy,
      ],
    );
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') {
      throw new SnapshotInFlightError(
        `A snapshot generation is already in progress for this term/type.`,
      );
    }
    throw e;
  }
}

export class SnapshotInFlightError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SnapshotInFlightError';
  }
}

/**
 * Persist a finished snapshot. Transitions status to 'ready'.
 */
export async function saveSnapshot(args: {
  snapshotId:    string;
  snapshot:      ReportSnapshot;
  generationMs:  number;
}): Promise<void> {
  const json = JSON.stringify(args.snapshot);
  await query(
    `UPDATE report_snapshots
       SET status         = 'ready',
           snapshot_json  = ?,
           data_hash      = ?,
           class_count    = ?,
           student_count  = ?,
           result_count   = ?,
           completed_at   = NOW(),
           generation_ms  = ?
     WHERE snapshot_id    = ?
       AND status         = 'generating'`,
    [
      json,
      args.snapshot.meta.dataHash,
      args.snapshot.meta.sourceCounts.classes,
      args.snapshot.meta.sourceCounts.students,
      args.snapshot.meta.sourceCounts.results,
      args.generationMs,
      args.snapshotId,
    ],
  );
}

/**
 * Mark a generation as failed with an error message.
 * Allows the (school, term, year, type, 'generating') slot to be re-acquired
 * because 'failed' is a different ENUM value than 'generating'.
 */
export async function markSnapshotFailed(snapshotId: string, errorMessage: string): Promise<void> {
  await query(
    `UPDATE report_snapshots
       SET status        = 'failed',
           error_message = ?,
           completed_at  = NOW()
     WHERE snapshot_id   = ?`,
    [errorMessage.slice(0, 1000), snapshotId],
  );
}

/**
 * Load full snapshot JSON. Verifies school ownership.
 */
export async function loadSnapshot(snapshotId: string, schoolId: number): Promise<ReportSnapshot | null> {
  const rows = (await query(
    `SELECT snapshot_json
       FROM report_snapshots
      WHERE snapshot_id = ?
        AND school_id   = ?
        AND status      = 'ready'
      LIMIT 1`,
    [snapshotId, schoolId],
  )) as Array<{ snapshot_json: string | null }>;
  if (!rows.length || !rows[0].snapshot_json) return null;
  return JSON.parse(rows[0].snapshot_json) as ReportSnapshot;
}

/**
 * List snapshots for a school, with optional filters.
 */
export async function listSnapshots(args: {
  schoolId: number;
  type?:    SnapshotType;
  status?:  SnapshotStatus;
  termId?:  number;
  yearId?:  number;
  limit?:   number;
}): Promise<SnapshotRow[]> {
  const where: string[] = ['school_id = ?'];
  const params: any[] = [args.schoolId];
  if (args.type)   { where.push('type = ?');      params.push(args.type); }
  if (args.status) { where.push('status = ?');    params.push(args.status); }
  if (args.termId !== undefined) { where.push('term_id = ?'); params.push(args.termId); }
  if (args.yearId !== undefined) { where.push('year_id = ?'); params.push(args.yearId); }
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const rows = (await query(
    `SELECT ${ROW_COLUMNS}
       FROM report_snapshots
      WHERE ${where.join(' AND ')}
      ORDER BY generated_at DESC
      LIMIT ${limit}`,
    params,
  )) as RawSnapshotRow[];
  return rows.map(toRow);
}

/**
 * Fetch the index row only (without payload).
 */
export async function getSnapshotRow(snapshotId: string, schoolId: number): Promise<SnapshotRow | null> {
  const rows = (await query(
    `SELECT ${ROW_COLUMNS}
       FROM report_snapshots
      WHERE snapshot_id = ?
        AND school_id   = ?
      LIMIT 1`,
    [snapshotId, schoolId],
  )) as RawSnapshotRow[];
  if (!rows.length) return null;
  return toRow(rows[0]);
}

/**
 * Hard-delete a snapshot. Restricted to super-admin callers (enforced by route).
 */
export async function deleteSnapshot(snapshotId: string, schoolId: number): Promise<boolean> {
  const result = (await query(
    `DELETE FROM report_snapshots WHERE snapshot_id = ? AND school_id = ?`,
    [snapshotId, schoolId],
  )) as any;
  return Boolean(result?.affectedRows);
}
