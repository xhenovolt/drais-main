/**
 * Phase 4 — the guarded committer: staged batch → attendance_raw_events.
 *
 * The ONLY path that turns an acquisition into production attendance
 * (docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md §7-§9, mission Phase 5).
 *
 * Guarantees:
 *   - only a 'validated' batch belonging to the caller's school commits
 *   - wall→UTC conversion happens EXACTLY ONCE (wallToUtc), with the
 *     device's configured zone (devices.tz_offset_minutes, falling back to
 *     the school time policy) — never the host timezone
 *   - device_reported_time stores the VERBATIM wall string (the punch
 *     identity; the contract Phase 0 restored)
 *   - duplicates are re-checked INSIDE the transaction against ALL sources
 *     (the unique keys only guard same-source collisions), so a punch that
 *     arrived via ADMS after validation cannot double-import
 *   - provenance on every row: source='tcp_pull', the acquisition id in
 *     legacy_table/legacy_id, operator on the batch
 *   - all-or-nothing: any failure rolls the entire batch back
 *
 * After commit (outside the transaction — idempotent + non-critical), the
 * derived layer is fed exactly like live ingestion via evaluatePunch.
 */
import { query, withTransaction } from '@/lib/db';
import { evaluatePunch } from '@/lib/attendance/engine';
import { resolveTimePolicy, getDeviceTimeContext } from '@/lib/attendance/device-clock';
import { ensureAcquisitionSchema } from './schema';
import { isDeviceWallTime, wallToUtc, type DeviceWallTime } from './wall-time';

export interface StagedForCommit {
  id: number;
  device_user_id: string;
  device_wall_time: string;
  verify_type: number | null;
  io_mode: number | null;
  display_name: string | null;
  matched: number | boolean | null;
  person_id: number | null;
  role_type: string | null;
  role_ref_id: number | null;
  duplicate_of_event_id: number | null;
}

export interface CommitPlan {
  eligible: StagedForCommit[];
  skippedDuplicates: StagedForCommit[];
  skippedInvalid: StagedForCommit[];
}

/**
 * Pure planning: which staged records may be inserted. Exported for tests.
 * `existingKeys` = "pin|wall" identities already present in
 * attendance_raw_events for this device (ANY source), re-read inside the
 * commit transaction.
 */
export function planCommit(
  records: readonly StagedForCommit[],
  existingKeys: ReadonlySet<string>,
): CommitPlan {
  const eligible: StagedForCommit[] = [];
  const skippedDuplicates: StagedForCommit[] = [];
  const skippedInvalid: StagedForCommit[] = [];
  const seenInBatch = new Set<string>();
  for (const r of records) {
    const key = `${r.device_user_id}|${r.device_wall_time}`;
    if (!isDeviceWallTime(r.device_wall_time) || !r.device_user_id) { skippedInvalid.push(r); continue; }
    if (existingKeys.has(key) || seenInBatch.has(key)) { skippedDuplicates.push(r); continue; }
    seenInBatch.add(key);
    eligible.push(r);
  }
  return { eligible, skippedDuplicates, skippedInvalid };
}

export interface CommitResult {
  acquisitionId: number;
  committed: number;
  duplicates: number;
  invalid: number;
  tzOffsetMinutes: number;
  evaluated: number;
}

export async function commitAcquisition(args: {
  schoolId: number;
  acquisitionId: number;
  operatorId?: number | null;
}): Promise<CommitResult> {
  const { schoolId, acquisitionId } = args;
  await ensureAcquisitionSchema();

  const batches = (await query(
    `SELECT id, school_id, device_sn, status FROM attendance_acquisitions
      WHERE id = ? AND school_id = ? LIMIT 1`,
    [acquisitionId, schoolId],
  )) as Array<{ id: number; school_id: number; device_sn: string | null; status: string }>;
  if (!batches.length) throw new Error('Acquisition not found');
  const batch = batches[0];
  if (batch.status !== 'validated') {
    throw new Error(`Only a validated batch can be saved (current status: ${batch.status})`);
  }
  if (!batch.device_sn) throw new Error('Batch has no device serial — cannot attribute punches');

  const deviceCtx = await getDeviceTimeContext(batch.device_sn);
  const policy = await resolveTimePolicy(schoolId);
  const tzOffsetMinutes = deviceCtx.tzOffsetMinutes ?? policy.offsetMinutes;

  const staged = (await query(
    `SELECT id, device_user_id, device_wall_time, verify_type, io_mode, display_name,
            matched, person_id, role_type, role_ref_id, duplicate_of_event_id
       FROM attendance_acquisition_records
      WHERE acquisition_id = ?
      ORDER BY device_wall_time ASC, id ASC`,
    [acquisitionId],
  )) as StagedForCommit[];
  if (!staged.length) throw new Error('Batch has no staged records');

  const insertedIds: number[] = [];
  const result = await withTransaction(async (conn) => {
    // Fresh cross-source duplicate check INSIDE the transaction.
    const minWall = staged[0].device_wall_time;
    const maxWall = staged[staged.length - 1].device_wall_time;
    const [existingRows] = await conn.execute(
      `SELECT device_user_id,
              DATE_FORMAT(device_reported_time, '%Y-%m-%d %H:%i:%s') AS wall
         FROM attendance_raw_events
        WHERE school_id = ? AND device_sn = ?
          AND device_reported_time BETWEEN ? AND ?`,
      [schoolId, batch.device_sn, minWall, maxWall],
    );
    const existingKeys = new Set(
      (existingRows as Array<{ device_user_id: number | string; wall: string }>)
        .map(e => `${e.device_user_id}|${e.wall}`),
    );

    const plan = planCommit(staged, existingKeys);

    for (const r of plan.eligible) {
      const punchAt = wallToUtc(r.device_wall_time as DeviceWallTime, tzOffsetMinutes)!;
      const [ins] = await conn.execute(
        `INSERT IGNORE INTO attendance_raw_events
           (school_id, device_sn, device_user_id, display_name, person_id,
            role_type, role_ref_id, punch_at, device_reported_time,
            time_source, time_confidence, verify_type, io_mode, source,
            matched, resolution_path, legacy_table, legacy_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'device', 'high', ?, ?, 'tcp_pull', ?, ?, 'attendance_acquisitions', ?)`,
        [
          schoolId, batch.device_sn, parseInt(r.device_user_id, 10) || 0,
          r.display_name, r.person_id, r.role_type, r.role_ref_id,
          punchAt, r.device_wall_time,
          r.verify_type, r.io_mode,
          r.matched ? 1 : 0,
          r.matched ? 'acquisition_committer' : null,
          acquisitionId,
        ],
      );
      const insertId = (ins as { insertId?: number; affectedRows?: number }).insertId;
      const affected = (ins as { affectedRows?: number }).affectedRows ?? 0;
      if (insertId && affected > 0) {
        insertedIds.push(insertId);
        await conn.execute(
          `UPDATE attendance_acquisition_records SET committed_event_id = ? WHERE id = ?`,
          [insertId, r.id],
        );
      } else {
        // uk collision inside the same source (re-commit race) — duplicate.
        plan.skippedDuplicates.push(r);
      }
    }

    // Annotate freshly-detected duplicates for the audit trail.
    for (const r of plan.skippedDuplicates) {
      if (r.duplicate_of_event_id == null) {
        await conn.execute(
          `UPDATE attendance_acquisition_records
              SET validation_flags = CONCAT_WS(',', validation_flags, 'duplicate_at_commit')
            WHERE id = ? AND (validation_flags IS NULL OR validation_flags NOT LIKE '%duplicate%')`,
          [r.id],
        );
      }
    }

    const committed = insertedIds.length;
    const duplicates = plan.skippedDuplicates.length;
    const invalid = plan.skippedInvalid.length;

    const [upd] = await conn.execute(
      `UPDATE attendance_acquisitions
          SET status = 'committed', records_committed = ?, records_duplicate = ?,
              records_failed = records_failed + ?, completed_at = UTC_TIMESTAMP()
        WHERE id = ? AND school_id = ? AND status = 'validated'`,
      [committed, duplicates, invalid, acquisitionId, schoolId],
    );
    if (((upd as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
      throw new Error('Batch state changed during commit — aborted (nothing saved)');
    }

    return { committed, duplicates, invalid };
  });

  // Derived layer — same as live ingestion. Idempotent per (person, day);
  // failures here never undo the committed raw events.
  let evaluated = 0;
  for (const id of insertedIds) {
    try { await evaluatePunch(id); evaluated++; } catch { /* re-runnable via backfill */ }
  }

  return {
    acquisitionId,
    committed: result.committed,
    duplicates: result.duplicates,
    invalid: result.invalid,
    tzOffsetMinutes,
    evaluated,
  };
}
