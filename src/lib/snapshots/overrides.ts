/**
 * Phase 3.1 — Override storage layer.
 *
 * SQL boundary for `report_card_overrides`. Every read enforces school
 * scoping by joining to `report_snapshots`; every write verifies the
 * snapshot belongs to the caller's school before inserting. Cascades on
 * snapshot deletion are handled by the FK + ON DELETE CASCADE constraint.
 */
import { query } from '@/lib/db';
import {
  isOverrideKind,
  type OverrideKind,
  type PersistedOverride,
  type RenderOverride,
} from '@/lib/drce/overrides';

interface RawRow {
  id:            number;
  snapshot_id:   string;
  student_db_id: number | null;
  override_kind: OverrideKind;
  target_id:     string | null;
  payload_json:  unknown;
  created_by:    number;
  created_at:    string | Date;
  updated_at:    string | Date;
}

function toIso(v: string | Date): string {
  return typeof v === 'string' ? v : new Date(v).toISOString();
}

/**
 * Reconstruct the typed `RenderOverride` discriminated union from a DB
 * row. Defensive — payload_json may be any JSON value or already-parsed
 * object depending on the driver.
 */
function reifyOverride(r: RawRow): RenderOverride {
  const targetId = r.target_id ?? '';
  const payload = parseJsonish(r.payload_json) as Record<string, unknown> | null;

  switch (r.override_kind) {
    case 'hide_section':
    case 'hide_row':
    case 'hide_subject':
      return { kind: r.override_kind, targetId };
    case 'style_patch':
      return { kind: 'style_patch', targetId, payload: payload ?? {} };
    case 'text_replace':
      return {
        kind: 'text_replace',
        targetId,
        payload: {
          search:  String(payload?.search  ?? ''),
          replace: String(payload?.replace ?? ''),
        },
      };
    case 'spacing_patch':
      return {
        kind: 'spacing_patch',
        targetId,
        payload: {
          padding: typeof payload?.padding === 'string' ? payload.padding : undefined,
          margin:  typeof payload?.margin  === 'string' ? payload.margin  : undefined,
        },
      };
  }
}

function parseJsonish(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

function toPersisted(r: RawRow): PersistedOverride {
  return {
    id:          r.id,
    snapshotId:  r.snapshot_id,
    studentDbId: r.student_db_id,
    override:    reifyOverride(r),
    createdBy:   r.created_by,
    createdAt:   toIso(r.created_at),
    updatedAt:   toIso(r.updated_at),
  };
}

/**
 * List every override for a snapshot. The school-scope guard happens at
 * the caller (the API route verifies snapshot ownership before invoking
 * this), but we still include the join clause so a schoolId mismatch
 * returns no rows rather than leaking cross-tenant data on a programming
 * error upstream.
 */
export async function listOverrides(args: {
  snapshotId:   string;
  schoolId:     number;
  studentDbId?: number | null;
}): Promise<PersistedOverride[]> {
  const where: string[] = ['o.snapshot_id = ?', 's.school_id = ?'];
  const params: unknown[] = [args.snapshotId, args.schoolId];

  // studentDbId === null means "snapshot-wide only".
  // studentDbId === undefined means "every override regardless of student".
  // studentDbId === <number> means "snapshot-wide PLUS that student".
  if (args.studentDbId !== undefined) {
    if (args.studentDbId === null) {
      where.push('o.student_db_id IS NULL');
    } else {
      where.push('(o.student_db_id IS NULL OR o.student_db_id = ?)');
      params.push(args.studentDbId);
    }
  }

  const rows = (await query(
    `SELECT o.id, o.snapshot_id, o.student_db_id, o.override_kind,
            o.target_id, o.payload_json, o.created_by,
            o.created_at, o.updated_at
       FROM report_card_overrides o
       JOIN report_snapshots s ON s.snapshot_id = o.snapshot_id
      WHERE ${where.join(' AND ')}
      ORDER BY o.created_at ASC, o.id ASC`,
    params,
  )) as RawRow[];

  return rows.map(toPersisted);
}

/**
 * Verify a snapshot belongs to the caller's school. Cheap O(1) lookup
 * via uk_snapshot_id. Returns true if the snapshot exists AND is owned
 * by `schoolId`.
 */
export async function verifySnapshotOwnership(
  snapshotId: string,
  schoolId:   number,
): Promise<boolean> {
  const rows = (await query(
    `SELECT 1 FROM report_snapshots
      WHERE snapshot_id = ? AND school_id = ?
      LIMIT 1`,
    [snapshotId, schoolId],
  )) as Array<{ '1': number }>;
  return rows.length > 0;
}

/**
 * Idempotent upsert of an override. The natural key is
 * (snapshot_id, student_db_id, override_kind, target_id) — composite,
 * with NULLs handled by `<=>` (NULL-safe equality). Writing the same
 * (snapshot, student, kind, target) twice updates the existing row's
 * payload rather than creating a duplicate.
 *
 * Returns the resulting row id (newly inserted or existing).
 */
export async function upsertOverride(args: {
  snapshotId:   string;
  studentDbId:  number | null;
  override:     RenderOverride;
  createdBy:    number;
}): Promise<number> {
  const { snapshotId, studentDbId, override, createdBy } = args;
  const targetId = override.targetId;
  const payload = 'payload' in override ? JSON.stringify(override.payload) : null;

  const existing = (await query(
    `SELECT id FROM report_card_overrides
      WHERE snapshot_id   = ?
        AND student_db_id <=> ?
        AND override_kind = ?
        AND target_id     <=> ?
      LIMIT 1`,
    [snapshotId, studentDbId, override.kind, targetId],
  )) as Array<{ id: number }>;

  if (existing.length > 0) {
    const id = existing[0].id;
    await query(
      `UPDATE report_card_overrides
          SET payload_json = ?
        WHERE id = ?`,
      [payload, id],
    );
    return id;
  }

  const result = (await query(
    `INSERT INTO report_card_overrides
       (snapshot_id, student_db_id, override_kind, target_id,
        payload_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [snapshotId, studentDbId, override.kind, targetId, payload, createdBy],
  )) as { insertId?: number };

  return Number(result?.insertId ?? 0);
}

/** Delete a single override row. Returns true if anything was removed. */
export async function deleteOverride(args: {
  overrideId: number;
  snapshotId: string;
  schoolId:   number;
}): Promise<boolean> {
  // Defensive join through report_snapshots so a DELETE cannot reach
  // another school's override even if the override id is guessed.
  const result = (await query(
    `DELETE o FROM report_card_overrides o
       JOIN report_snapshots s ON s.snapshot_id = o.snapshot_id
      WHERE o.id          = ?
        AND o.snapshot_id = ?
        AND s.school_id   = ?`,
    [args.overrideId, args.snapshotId, args.schoolId],
  )) as { affectedRows?: number };
  return Number(result?.affectedRows ?? 0) > 0;
}

/**
 * Clear overrides matching a scope. Filters that aren't supplied default
 * to "match anything", so calling with only `{ snapshotId, schoolId }`
 * wipes the snapshot's entire override set.
 */
export async function clearOverrides(args: {
  snapshotId:    string;
  schoolId:      number;
  studentDbId?:  number | null;
  overrideKind?: OverrideKind;
}): Promise<number> {
  const where: string[] = ['o.snapshot_id = ?', 's.school_id = ?'];
  const params: unknown[] = [args.snapshotId, args.schoolId];

  if (args.studentDbId !== undefined) {
    if (args.studentDbId === null) {
      where.push('o.student_db_id IS NULL');
    } else {
      where.push('o.student_db_id = ?');
      params.push(args.studentDbId);
    }
  }

  if (args.overrideKind !== undefined) {
    if (!isOverrideKind(args.overrideKind)) {
      throw new Error(`Invalid override_kind: ${args.overrideKind}`);
    }
    where.push('o.override_kind = ?');
    params.push(args.overrideKind);
  }

  const result = (await query(
    `DELETE o FROM report_card_overrides o
       JOIN report_snapshots s ON s.snapshot_id = o.snapshot_id
      WHERE ${where.join(' AND ')}`,
    params,
  )) as { affectedRows?: number };
  return Number(result?.affectedRows ?? 0);
}
