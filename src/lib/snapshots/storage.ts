/**
 * DB-backed snapshot storage.
 *
 * Snapshot bytes live in `report_snapshots.snapshot_json` (LONGTEXT).
 * No filesystem dependency — works on serverless hosts.
 */
import { query } from '@/lib/db';
import type { ReportSnapshot, SnapshotRow, SnapshotStatus, SnapshotType } from './types';
import { findInflight, sweepStale, type InflightInfo } from './lifecycle';

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

/** Normalise JSON_EXTRACT output to a plain string[]; never throws. */
function parseClassNames(raw: unknown): string[] {
  if (raw == null) return [];
  try {
    const val = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(val)) return [];
    return val
      .map((v) => (typeof v === 'string' ? v : String(v ?? '')).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
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
    // Driver returns JSON_EXTRACT as a string on some paths and as a parsed
    // value on others; normalise both, and never let a malformed payload throw
    // — a snapshot with unreadable names must still be listable.
    classNames:        parseClassNames((r as any).class_names),
    // Names resolved via LEFT JOIN, so null means the referenced row is gone
    // (one such snapshot exists in production) — the caller shows the raw id.
    termName:          (r as any).term_name ?? null,
    yearName:          (r as any).year_name ?? null,
    resultTypeName:    (r as any).result_type_name ?? null,
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

/**
 * `class_names` is extracted from the stored JSON rather than read from a
 * column, because no column holds it.
 *
 * The table records `class_count` — a NUMBER — and nothing else about which
 * classes a snapshot covers. In production that made five snapshots for
 * ALBAYAN completely indistinguishable in the list: all "secular · ready ·
 * 1 class", when they were PRIMARY ONE, TWO, THREE, FOUR and SIX. Flushing,
 * regenerating or publishing meant picking blind between them, and every one
 * of those actions is destructive or parent-visible.
 *
 * Extracting at read time (rather than adding a column) means every snapshot
 * ALREADY STORED gains its names immediately, with no migration and no
 * backfill — the data was never lost, only unexposed. The path is targeted at
 * the names alone so MySQL is not asked to hand back the whole result payload.
 *
 * If snapshot volume grows enough for this to cost, the durable fix is a
 * denormalised column written at generation time; the extraction here would
 * then become its backfill.
 */
/**
 * Every column is qualified with `rs.` and the joins below are LEFT.
 *
 * QUALIFIED because `terms`, `result_types` and `academic_years` all carry
 * `id`, `name` and `status`; an unqualified `WHERE status = ?` against the
 * joined shape is an ambiguous-column error, not a wrong answer, so it would
 * take the whole list down.
 *
 * LEFT because production already contains one snapshot whose `term_id`
 * matches no `terms` row and one whose `year_id` matches no `academic_years`
 * row. An INNER JOIN would silently drop exactly the oldest, oddest rows —
 * the same failure recorded in the ADR about the term resolver, where a term
 * whose academic-year row was missing simply vanished with no error.
 */
const ROW_COLUMNS = `
  rs.id, rs.snapshot_id, rs.school_id, rs.type, rs.term_id, rs.year_id,
  rs.result_type_id, rs.status, rs.data_hash, rs.class_count,
  rs.student_count, rs.result_count, rs.generated_by, rs.generated_at,
  rs.completed_at, rs.generation_ms, rs.error_message, rs.is_legacy_fallback,
  -- NOTE: the payload is camelCase (classId / className / stream), not the
  -- snake_case used by the SQL schema. Verified against a stored row:
  --   JSON_KEYS($.classes[0]) → ["classId","className","stream","students","subjects"]
  JSON_EXTRACT(rs.snapshot_json, '$.classes[*].className') AS class_names,
  t.name  AS term_name,
  ay.name AS year_name,
  rt.name AS result_type_name
`;

/**
 * Shared FROM. Resolves the three foreign keys the list previously rendered as
 * raw ids — the manage screen literally displayed "T300004 / Y8002", which
 * tells an operator nothing about whether a snapshot is Term II Mid Term or
 * Term III End of Term. Those are different documents for parents.
 */
const ROW_FROM = `
  report_snapshots rs
  LEFT JOIN terms          t  ON t.id  = rs.term_id
  LEFT JOIN academic_years ay ON ay.id = rs.year_id
  LEFT JOIN result_types   rt ON rt.id = rs.result_type_id
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
  // Reap any abandoned in-flight row first. Cheap and self-healing.
  await sweepStale({
    schoolId: args.schoolId,
    type:     args.type,
    termId:   args.termId,
    yearId:   args.yearId,
  });

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
      const inflight = await findInflight({
        schoolId: args.schoolId,
        type:     args.type,
        termId:   args.termId,
        yearId:   args.yearId,
      });
      throw new SnapshotInFlightError(
        `A snapshot generation is already in progress for this term/type.`,
        inflight,
      );
    }
    throw e;
  }
}

export class SnapshotInFlightError extends Error {
  readonly inflight: InflightInfo | null;
  constructor(msg: string, inflight: InflightInfo | null = null) {
    super(msg);
    this.name = 'SnapshotInFlightError';
    this.inflight = inflight;
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
  const where: string[] = ['rs.school_id = ?'];
  const params: any[] = [args.schoolId];
  if (args.type)   { where.push('rs.type = ?');      params.push(args.type); }
  if (args.status) { where.push('rs.status = ?');    params.push(args.status); }
  if (args.termId !== undefined) { where.push('rs.term_id = ?'); params.push(args.termId); }
  if (args.yearId !== undefined) { where.push('rs.year_id = ?'); params.push(args.yearId); }
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const rows = (await query(
    `SELECT ${ROW_COLUMNS}
       FROM ${ROW_FROM}
      WHERE ${where.join(' AND ')}
      ORDER BY rs.generated_at DESC
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
       FROM ${ROW_FROM}
      WHERE rs.snapshot_id = ?
        AND rs.school_id   = ?
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
