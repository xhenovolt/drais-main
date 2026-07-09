/**
 * Phase 5 — device-side user cleanup commands.
 *
 * Queues an ADMS `DATA DELETE USER PIN=X` command onto zk_device_commands
 * so the device physically removes the USERINFO + fingerprint templates
 * for a PIN on its next heartbeat. This is what stops a device from
 * locally 1:N-matching a person DRAIS has already unmapped or archived.
 *
 * Best-effort by design: the command is queued regardless of whether the
 * device is currently online (it carries an expiry). Delivery + result
 * are visible in the Reconciliation Center → Activity tab (command
 * status: queued → acknowledged / failed), which is the "device cleanup
 * pending / failed" surface the spec calls for. DRAIS never blocks an
 * identity change on the device round-trip.
 */
import { query } from '@/lib/db';

const DELETE_USER_PRIORITY = 15;
const DELETE_USER_MAX_RETRIES = 3;
const DELETE_USER_EXPIRES_HOURS = 24;

/**
 * Queue a "remove this PIN from the device" command. Returns the queued
 * command id, or null if it could not be queued (missing input / DB
 * error — never throws so callers can treat it as best-effort).
 */
export async function queueDeviceUserDeletion(input: {
  schoolId: number;
  deviceSn: string | null | undefined;
  pin: number;
  createdBy?: number | null;
}): Promise<number | null> {
  const { schoolId, deviceSn, pin } = input;
  if (!schoolId || !deviceSn || !Number.isFinite(pin) || pin <= 0) return null;
  // Never send a command "to" an IP masquerading as a serial.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(String(deviceSn))) return null;

  const command = `DATA DELETE USER PIN=${pin}`;
  const expiresAt = new Date(Date.now() + DELETE_USER_EXPIRES_HOURS * 3600_000)
    .toISOString().slice(0, 19).replace('T', ' ');
  try {
    const res = (await query(
      `INSERT INTO zk_device_commands
         (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [schoolId, deviceSn, command, DELETE_USER_PRIORITY, DELETE_USER_MAX_RETRIES, expiresAt, input.createdBy ?? null],
    )) as { insertId?: number };
    return res.insertId ?? null;
  } catch (err) {
    console.warn('[device-user-commands] queue delete failed (non-fatal):', err);
    return null;
  }
}
