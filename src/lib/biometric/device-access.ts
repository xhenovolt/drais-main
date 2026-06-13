/**
 * Phase 3 — shared device authorization for the reconciliation APIs.
 *
 * A device belongs to a school. A session may operate on a device only
 * when the device's school matches the session's school, OR the session
 * is a super-admin. The device's school_id is the trusted scope for
 * every downstream write (never the session's school for a foreign
 * device) — this prevents the cross-school contamination the live K40
 * test exposed.
 */
import { query } from '@/lib/db';
import type { SessionInfo } from '@/lib/auth';

export interface ResolvedDevice {
  id: number;
  sn: string;
  schoolId: number | null;
  deviceName: string | null;
  ipAddress: string | null;
  status: string | null;
}

export interface DeviceAccess {
  ok: boolean;
  /** present when ok=true */
  device?: ResolvedDevice;
  schoolId?: number;
  /** present when ok=false */
  status?: number;
  error?: string;
}

export async function resolveDeviceForSession(
  session: SessionInfo,
  /** Device serial number, or (fallback) numeric devices.id. The
   *  route segment is named [id] for Next.js slug-uniqueness, but the
   *  UI passes the serial; we resolve by sn first, then numeric id. */
  snOrId: string,
): Promise<DeviceAccess> {
  if (!snOrId) return { ok: false, status: 400, error: 'device serial required' };
  const isNumeric = /^\d+$/.test(snOrId);
  const rows = (await query(
    `SELECT id, sn, school_id, device_name, ip_address, status
       FROM devices WHERE (sn = ? ${isNumeric ? 'OR id = ?' : ''}) AND deleted_at IS NULL LIMIT 1`,
    isNumeric ? [snOrId, Number(snOrId)] : [snOrId],
  )) as Array<{ id: number; sn: string; school_id: number | null; device_name: string | null; ip_address: string | null; status: string | null }>;
  if (rows.length === 0) return { ok: false, status: 404, error: 'Device not found' };
  const d = rows[0];

  const isOwner = d.school_id != null && Number(d.school_id) === Number(session.schoolId);
  if (!isOwner && !session.isSuperAdmin) {
    return { ok: false, status: 403, error: 'Device belongs to another school' };
  }
  // Scope writes to the DEVICE's school. For a super-admin operating a
  // foreign device, that's the device's school; for an owner, identical.
  const schoolId = d.school_id ?? session.schoolId;
  return {
    ok: true,
    device: {
      id: d.id, sn: d.sn, schoolId: d.school_id,
      deviceName: d.device_name, ipAddress: d.ip_address, status: d.status,
    },
    schoolId,
  };
}
