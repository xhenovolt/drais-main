/**
 * Phase 1 — acquisition service (staging + audit trail).
 *
 * The narrow, method-agnostic core every acquisition adapter feeds:
 *
 *   beginAcquisition()  → audit row, status 'pulling'
 *   stageRecords()      → verbatim raw punches (DeviceWallTime identity)
 *   finishAcquisition() → counts, timings, status transition
 *
 * NO production attendance writes happen here — attendance_raw_events is
 * only ever touched by the committer (Phase 4) or the legacy path. This
 * module is deliberately free of any zk/device coupling so USB/CSV/manual
 * adapters (Phase 5) plug in with zero changes.
 */
import { query } from '@/lib/db';
import { ensureAcquisitionSchema } from './schema';
import { isDeviceWallTime, type DeviceWallTime } from './wall-time';

export type AcquisitionMethod = 'tcp_pull' | 'adms_push' | 'usb_import' | 'csv_import' | 'manual_entry';
export type AcquisitionStatus = 'pulling' | 'staged' | 'validated' | 'committed' | 'discarded' | 'failed';

export interface BeginAcquisitionInput {
  schoolId: number;
  method: AcquisitionMethod;
  deviceSn?: string | null;
  deviceIp?: string | null;
  requestedBy?: number | null;
  windowFrom?: string | null;   // YYYY-MM-DD
  windowTo?: string | null;     // YYYY-MM-DD
}

export interface RawPunch {
  seq?: number | null;                 // device log id / userSn when known
  deviceUserId: string;
  wallTime: DeviceWallTime;            // verbatim device wall clock
  verifyType?: number | null;
  ioMode?: number | null;
  statusCode?: number | null;
  displayName?: string | null;
  rawHex?: string | null;              // first bytes of the raw record, hex
}

export interface FinishAcquisitionPatch {
  status: AcquisitionStatus;
  deviceLogCount?: number | null;
  recordsReceived?: number;
  recordsStaged?: number;
  recordsCommitted?: number;
  recordsDuplicate?: number;
  recordsUnmatched?: number;
  recordsFailed?: number;
  deviceTimeAtPull?: string | null;    // device wall string, if probed
  clockDeltaSeconds?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  warnings?: string[] | null;
}

export async function beginAcquisition(input: BeginAcquisitionInput): Promise<number> {
  await ensureAcquisitionSchema();
  const res = (await query(
    `INSERT INTO attendance_acquisitions
       (school_id, method, device_sn, device_ip, requested_by, window_from, window_to,
        status, server_time_at_pull, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pulling', UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [
      input.schoolId, input.method, input.deviceSn ?? null, input.deviceIp ?? null,
      input.requestedBy ?? null, input.windowFrom ?? null, input.windowTo ?? null,
    ],
  )) as { insertId?: number };
  if (!res?.insertId) throw new Error('failed to create acquisition row');
  return res.insertId;
}

/** Stage raw punches verbatim. Invalid wall strings are counted, not thrown —
 *  a corrupt record must be VISIBLE in the batch, never silently dropped. */
export async function stageRecords(
  acquisitionId: number,
  punches: readonly RawPunch[],
): Promise<{ staged: number; invalid: number }> {
  await ensureAcquisitionSchema();
  let staged = 0, invalid = 0;
  const BATCH = 200;
  for (let i = 0; i < punches.length; i += BATCH) {
    const chunk = punches.slice(i, i + BATCH);
    const values: unknown[] = [];
    const rows: string[] = [];
    for (const p of chunk) {
      if (!isDeviceWallTime(p.wallTime) || !p.deviceUserId) { invalid++; continue; }
      rows.push('(?, ?, ?, ?, ?, ?, ?, ?, ?)');
      values.push(
        acquisitionId, p.seq ?? null, p.deviceUserId, p.wallTime,
        p.verifyType ?? null, p.ioMode ?? null, p.statusCode ?? null,
        p.displayName ?? null, p.rawHex ?? null,
      );
    }
    if (!rows.length) continue;
    await query(
      `INSERT INTO attendance_acquisition_records
         (acquisition_id, seq, device_user_id, device_wall_time,
          verify_type, io_mode, status_code, display_name, raw_hex)
       VALUES ${rows.join(', ')}`,
      values,
    );
    staged += rows.length;
  }
  return { staged, invalid };
}

export async function finishAcquisition(id: number, patch: FinishAcquisitionPatch): Promise<void> {
  await ensureAcquisitionSchema();
  await query(
    `UPDATE attendance_acquisitions SET
       status = ?,
       device_log_count    = COALESCE(?, device_log_count),
       records_received    = COALESCE(?, records_received),
       records_staged      = COALESCE(?, records_staged),
       records_committed   = COALESCE(?, records_committed),
       records_duplicate   = COALESCE(?, records_duplicate),
       records_unmatched   = COALESCE(?, records_unmatched),
       records_failed      = COALESCE(?, records_failed),
       device_time_at_pull = COALESCE(?, device_time_at_pull),
       clock_delta_seconds = COALESCE(?, clock_delta_seconds),
       duration_ms         = COALESCE(?, duration_ms),
       error_message       = COALESCE(?, error_message),
       warnings_json       = COALESCE(?, warnings_json),
       completed_at        = UTC_TIMESTAMP()
     WHERE id = ?`,
    [
      patch.status,
      patch.deviceLogCount ?? null,
      patch.recordsReceived ?? null,
      patch.recordsStaged ?? null,
      patch.recordsCommitted ?? null,
      patch.recordsDuplicate ?? null,
      patch.recordsUnmatched ?? null,
      patch.recordsFailed ?? null,
      patch.deviceTimeAtPull ?? null,
      patch.clockDeltaSeconds ?? null,
      patch.durationMs ?? null,
      patch.errorMessage ?? null,
      patch.warnings?.length ? JSON.stringify(patch.warnings) : null,
      id,
    ],
  );
}

export async function listAcquisitions(schoolId: number, limit = 50): Promise<unknown[]> {
  await ensureAcquisitionSchema();
  return (await query(
    `SELECT id, method, status, device_sn, device_ip, window_from, window_to,
            records_received, records_staged, records_committed, records_duplicate,
            records_unmatched, records_failed, clock_delta_seconds, duration_ms,
            error_message, started_at, completed_at
       FROM attendance_acquisitions
      WHERE school_id = ?
      ORDER BY id DESC
      LIMIT ${Math.max(1, Math.min(200, limit))}`,
    [schoolId],
  )) as unknown[];
}

export async function getAcquisitionRecords(
  schoolId: number,
  acquisitionId: number,
): Promise<{ acquisition: unknown; records: unknown[] } | null> {
  await ensureAcquisitionSchema();
  const acq = (await query(
    `SELECT * FROM attendance_acquisitions WHERE id = ? AND school_id = ? LIMIT 1`,
    [acquisitionId, schoolId],
  )) as unknown[];
  if (!acq.length) return null;
  const records = (await query(
    `SELECT id, seq, device_user_id, device_wall_time, corrected_wall_time,
            verify_type, io_mode, status_code,
            display_name, matched, person_id, role_type, role_ref_id,
            duplicate_of_event_id, committed_event_id, validation_flags
       FROM attendance_acquisition_records
      WHERE acquisition_id = ?
      ORDER BY device_wall_time ASC, id ASC`,
    [acquisitionId],
  )) as unknown[];
  return { acquisition: acq[0], records };
}
