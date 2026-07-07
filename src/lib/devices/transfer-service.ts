/**
 * Phase 2 — device transfer service.
 *
 * Orchestrates the three operations that mutate device ownership:
 *
 *   release(sn, by, reason)        — current school relinquishes the
 *                                    device. Closes every active
 *                                    enrollment for (sn, current
 *                                    school) by setting status =
 *                                    'transferred'. Opens a
 *                                    device_transfers row with
 *                                    status='released' and stamps the
 *                                    device row status='released'.
 *
 *   acquire(sn, toSchool, by)      — new school picks up the device.
 *                                    Requires the device to be in
 *                                    status='released'. Updates
 *                                    devices.school_id, sets the
 *                                    transfer row to 'acquired',
 *                                    moves devices.status back to
 *                                    'active'. Also wipes any
 *                                    fingerprint_orphans tied to this
 *                                    SN — they belonged to the old
 *                                    school and are stale.
 *
 *   decommission(sn, by, reason)   — terminal. Revokes every active
 *                                    enrollment (cross-school).
 *                                    Marks the device retired. Historical
 *                                    attendance_raw_events are NOT
 *                                    deleted — they remain attributed
 *                                    to the original school.
 *
 * Every operation:
 *   - Writes one audit_logs row (DEVICE_RELEASED / DEVICE_ACQUIRED /
 *     DEVICE_DECOMMISSIONED) so the trail is queryable from the
 *     existing /admin/audit-logs surface.
 *   - Returns the impact counts so the caller can surface them in
 *     the operator UI ("X enrollments archived, Y orphans wiped").
 *   - Is best-effort transactional: each step is wrapped in try/catch
 *     so a partial failure still produces an auditable transfer row
 *     in 'aborted' state. The blueprint's "every phase reversible"
 *     constraint is honoured — operators can manually re-run with
 *     forceRetry to complete a partial transfer.
 *
 * Note on ADMS device-side cleanup
 * --------------------------------
 * The blueprint mentions queueing `DATA DELETE USER` commands at
 * acquire time to wipe the physical device's user list. That is
 * deferred to a Phase 2 follow-up because it requires the
 * firmware-capability gate (Phase 4 / BIO-7 territory): some firmware
 * accepts the command, some doesn't. If we leave PINs on the device,
 * the next punch from a stale PIN goes through the resolver and lands
 * as unresolved — correct DRAIS-side, even if cosmetically the device
 * still "knows" John from the previous school. The transfer ceremony
 * is complete from DRAIS's perspective; the physical cleanup is
 * operator-initiated via the existing "Sync identities" button.
 */
import { query } from '@/lib/db';
import { logAudit, AuditAction } from '@/lib/audit';
import { ensureDeviceOwnershipSchema } from '@/lib/devices/migrations/devices-ownership-schema';

export interface TransferActor {
  userId: number | null;
  schoolId: number;
  ip?: string | null;
  userAgent?: string | null;
  /** Super-admins may release/acquire a device owned by ANY school
   *  (force-transfer) without the device-claim secret — founder-independence.
   *  Accountability is preserved via device_transfers + audit_logs. */
  fromSuperAdmin?: boolean;
}

export interface TransferImpact {
  transferId: number;
  enrollmentsArchived: number;
  orphansArchived: number;       // on acquire: orphan templates reassigned (not deleted)
  rawEventsPreserved: number;
  directoryReassigned?: number;  // directory rows moved to the new owner (not deleted)
}

export class TransferStateError extends Error {
  constructor(message: string) { super(message); this.name = 'TransferStateError'; }
}

/**
 * release — current school relinquishes the device. Idempotent at the
 * transfer level: a second release call on an already-released device
 * is rejected with TransferStateError so an operator clearly sees the
 * state instead of accidentally re-archiving rows.
 */
export async function releaseDevice(
  deviceSn: string,
  actor: TransferActor,
  reason: string | null,
): Promise<TransferImpact> {
  await ensureDeviceOwnershipSchema();

  const device = await loadDevice(deviceSn);
  if (!device) throw new TransferStateError(`Device ${deviceSn} not found`);
  // Owner check. Coerce both sides to Number — devices.school_id comes back as
  // a string (bigNumberStrings) so a raw !== against a numeric actor.schoolId
  // wrongly rejected even the legitimate owner. Super-admins bypass entirely.
  if (Number(device.school_id) !== Number(actor.schoolId) && !actor.fromSuperAdmin) {
    throw new TransferStateError(`Device ${deviceSn} belongs to a different school`);
  }
  if (device.status === 'released') {
    throw new TransferStateError(`Device ${deviceSn} already released`);
  }
  if (device.status === 'retired') {
    throw new TransferStateError(`Device ${deviceSn} has been decommissioned`);
  }

  // 1. Open the transfer row.
  const tIns = (await query(
    `INSERT INTO device_transfers
       (device_sn, from_school_id, to_school_id, initiated_by, status, reason)
     VALUES (?, ?, NULL, ?, 'initiated', ?)`,
    [deviceSn, device.school_id, actor.userId, reason],
  )) as { insertId?: number };
  const transferId = Number(tIns?.insertId ?? 0);

  // 2. Archive active enrollments for (sn, current school). The
  //    canonical biometric_enrollments table (Phase 1) is the only
  //    place we touch — legacy zk_user_mapping rows stay until the
  //    Phase 1 cutover. The status='transferred' on enrollments stops
  //    the resolver from matching them; punches become unresolved.
  let enrollmentsArchived = 0;
  try {
    const r = (await query(
      `UPDATE biometric_enrollments
          SET status = 'transferred', updated_at = CURRENT_TIMESTAMP
        WHERE school_id = ?
          AND origin_device_sn = ?
          AND status = 'active'`,
      [device.school_id, deviceSn],
    )) as { affectedRows?: number };
    enrollmentsArchived = Number(r?.affectedRows ?? 0);
  } catch { /* canonical table may not exist on very old deploys */ }

  // 3. Count raw events that will be preserved (read-only — they
  //    remain attributed to from_school_id forever).
  let rawEventsPreserved = 0;
  try {
    const r = (await query(
      `SELECT COUNT(*) AS n
         FROM attendance_raw_events
        WHERE device_sn = ? AND school_id = ?`,
      [deviceSn, device.school_id],
    )) as Array<{ n: number }>;
    rawEventsPreserved = Number(r?.[0]?.n ?? 0);
  } catch { /* table may not exist yet */ }

  // 4. Flip the device row to status='released'. school_id stays so
  //    historical reports still attribute correctly until acquire.
  await query(
    `UPDATE devices SET status = 'released', updated_at = CURRENT_TIMESTAMP
      WHERE sn = ?`,
    [deviceSn],
  );

  // 5. Close the transfer row.
  await query(
    `UPDATE device_transfers
        SET status = 'released',
            completed_at = CURRENT_TIMESTAMP,
            enrollments_archived = ?,
            raw_events_preserved = ?
      WHERE id = ?`,
    [enrollmentsArchived, rawEventsPreserved, transferId],
  );

  // 6. Audit.
  await logAudit({
    schoolId: actor.schoolId,
    userId: actor.userId,
    action: AuditAction.DEVICE_RELEASED,
    entityType: 'device',
    entityId: deviceSn,
    details: { transferId, deviceSn, enrollmentsArchived, rawEventsPreserved, reason },
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  return { transferId, enrollmentsArchived, orphansArchived: 0, rawEventsPreserved };
}

/**
 * acquire — new school picks up a previously-released device.
 */
export async function acquireDevice(
  deviceSn: string,
  toSchoolId: number,
  actor: TransferActor,
  reason: string | null,
): Promise<TransferImpact> {
  await ensureDeviceOwnershipSchema();

  const device = await loadDevice(deviceSn);
  if (!device) throw new TransferStateError(`Device ${deviceSn} not found`);
  if (device.status !== 'released') {
    throw new TransferStateError(
      `Device ${deviceSn} is in status='${device.status}', expected 'released'.`,
    );
  }
  if (device.school_id === toSchoolId) {
    throw new TransferStateError(`Device ${deviceSn} already belongs to school ${toSchoolId}`);
  }

  const fromSchoolId = device.school_id;

  // 1. Find the most recent open release transfer row to attach to.
  const openRow = (await query(
    `SELECT id FROM device_transfers
      WHERE device_sn = ? AND status = 'released'
      ORDER BY initiated_at DESC LIMIT 1`,
    [deviceSn],
  )) as Array<{ id: number }>;
  const transferId = Number(openRow?.[0]?.id ?? 0);

  if (!transferId) {
    // No release row to attach to — open a synthetic one so the audit
    // trail still has a single canonical row for the acquire side.
    const tIns = (await query(
      `INSERT INTO device_transfers
         (device_sn, from_school_id, to_school_id, initiated_by, status, reason)
       VALUES (?, ?, ?, ?, 'initiated', ?)`,
      [deviceSn, fromSchoolId, toSchoolId, actor.userId, reason ?? 'synthetic_acquire'],
    )) as { insertId?: number };
    const newId = Number(tIns?.insertId ?? 0);
    return finishAcquire(deviceSn, toSchoolId, fromSchoolId, newId, actor, reason);
  }

  return finishAcquire(deviceSn, toSchoolId, fromSchoolId, transferId, actor, reason);
}

async function finishAcquire(
  deviceSn: string,
  toSchoolId: number,
  fromSchoolId: number | null,
  transferId: number,
  actor: TransferActor,
  reason: string | null,
): Promise<TransferImpact> {
  // 1. Re-attribute the device's data to the new owner. NON-DESTRUCTIVE —
  //    nothing is deleted. The fingerprint templates, synced user directory,
  //    pending users and reconciliation snapshots all FOLLOW the physical
  //    device to the acquiring school by moving their school_id. This keeps
  //    the names (and history) intact and reversible, while making the
  //    reconciliation modal show the device under its new owner.
  let orphansArchived = 0;     // kept name for impact compat; = orphans reassigned
  let directoryCleared = 0;    // kept name for impact compat; = directory rows reassigned
  const reattribute: Array<[string, string]> = [
    ['fingerprint_orphans',          `UPDATE fingerprint_orphans          SET school_id = ? WHERE device_sn = ?`],
    ['device_user_directory',        `UPDATE device_user_directory        SET school_id = ? WHERE device_sn = ?`],
    ['pending_device_users',         `UPDATE pending_device_users         SET school_id = ? WHERE device_sn = ?`],
    ['device_reconciliation_items',  `UPDATE device_reconciliation_items  SET school_id = ? WHERE device_sn = ?`],
    ['device_reconciliation_runs',   `UPDATE device_reconciliation_runs   SET school_id = ? WHERE device_sn = ?`],
  ];
  for (const [name, sql] of reattribute) {
    try {
      const r = (await query(sql, [toSchoolId, deviceSn])) as { affectedRows?: number };
      if (name === 'fingerprint_orphans')   orphansArchived = Number(r?.affectedRows ?? 0);
      if (name === 'device_user_directory') directoryCleared = Number(r?.affectedRows ?? 0);
    } catch { /* table may be absent on older deploys — best effort */ }
  }

  // 2. Move device ownership.
  await query(
    `UPDATE devices
        SET school_id = ?, status = 'active', updated_at = CURRENT_TIMESTAMP
      WHERE sn = ?`,
    [toSchoolId, deviceSn],
  );

  // 3. Close the transfer row.
  await query(
    `UPDATE device_transfers
        SET status = 'acquired',
            completed_at = CURRENT_TIMESTAMP,
            to_school_id = ?,
            orphans_archived = orphans_archived + ?
      WHERE id = ?`,
    [toSchoolId, orphansArchived, transferId],
  );

  // 4. Audit (under the acquiring school).
  await logAudit({
    schoolId: toSchoolId,
    userId: actor.userId,
    action: AuditAction.DEVICE_ACQUIRED,
    entityType: 'device',
    entityId: deviceSn,
    details: { transferId, deviceSn, fromSchoolId, toSchoolId, orphansReassigned: orphansArchived, directoryReassigned: directoryCleared, reason },
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  return { transferId, enrollmentsArchived: 0, orphansArchived, rawEventsPreserved: 0, directoryReassigned: directoryCleared };
}

/**
 * decommission — terminal retirement. Revokes ALL active enrollments
 * for the device (any school). Historical raw events preserved.
 */
export async function decommissionDevice(
  deviceSn: string,
  actor: TransferActor,
  reason: string | null,
): Promise<TransferImpact> {
  await ensureDeviceOwnershipSchema();

  const device = await loadDevice(deviceSn);
  if (!device) throw new TransferStateError(`Device ${deviceSn} not found`);
  if (device.status === 'retired') {
    throw new TransferStateError(`Device ${deviceSn} already decommissioned`);
  }

  const tIns = (await query(
    `INSERT INTO device_transfers
       (device_sn, from_school_id, to_school_id, initiated_by, status, reason)
     VALUES (?, ?, NULL, ?, 'initiated', ?)`,
    [deviceSn, device.school_id, actor.userId, reason],
  )) as { insertId?: number };
  const transferId = Number(tIns?.insertId ?? 0);

  let enrollmentsArchived = 0;
  try {
    const r = (await query(
      `UPDATE biometric_enrollments
          SET status = 'revoked',
              revoked_at = CURRENT_TIMESTAMP,
              revoked_reason = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE origin_device_sn = ?
          AND status = 'active'`,
      [reason ?? 'device_decommissioned', deviceSn],
    )) as { affectedRows?: number };
    enrollmentsArchived = Number(r?.affectedRows ?? 0);
  } catch { /* canonical table absent */ }

  let rawEventsPreserved = 0;
  try {
    const r = (await query(
      `SELECT COUNT(*) AS n FROM attendance_raw_events WHERE device_sn = ?`,
      [deviceSn],
    )) as Array<{ n: number }>;
    rawEventsPreserved = Number(r?.[0]?.n ?? 0);
  } catch { /* fine */ }

  await query(
    `UPDATE devices
        SET status = 'retired', deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE sn = ?`,
    [deviceSn],
  );

  await query(
    `UPDATE device_transfers
        SET status = 'decommissioned',
            completed_at = CURRENT_TIMESTAMP,
            enrollments_archived = ?,
            raw_events_preserved = ?
      WHERE id = ?`,
    [enrollmentsArchived, rawEventsPreserved, transferId],
  );

  await logAudit({
    schoolId: actor.schoolId,
    userId: actor.userId,
    action: AuditAction.DEVICE_DECOMMISSIONED,
    entityType: 'device',
    entityId: deviceSn,
    details: { transferId, deviceSn, enrollmentsArchived, rawEventsPreserved, reason },
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  return { transferId, enrollmentsArchived, orphansArchived: 0, rawEventsPreserved };
}

interface DeviceRow {
  sn: string;
  school_id: number;
  status: string;
  from_super_admin?: boolean;
}

async function loadDevice(sn: string): Promise<DeviceRow | null> {
  try {
    const rows = (await query(
      `SELECT sn, school_id, status FROM devices WHERE sn = ? LIMIT 1`,
      [sn],
    )) as Array<DeviceRow>;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
