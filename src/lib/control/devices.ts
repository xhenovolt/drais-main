/**
 * Control Center — platform device management (Roadmap P2).
 *
 * Device ownership is a PLATFORM operation (moved off the school layer in P1).
 * This is where Xhenvolt Control does it: see every device across every school,
 * assign an unclaimed device to a school (fixing the NULL-school bleed),
 * release / reassign, suspend / activate / retire, and read the full ownership
 * timeline.
 *
 * The vetted ownership ceremony (`transfer-service`) is reused for release /
 * acquire / decommission so enrollment archival + audit stay identical to the
 * old school flow — just driven by a control operator (fromSuperAdmin) instead
 * of a school session. `validateDeviceAction` is PURE and unit-tested.
 */
import { query } from '@/lib/db';
import { controlAudit } from '@/lib/control/auth';
import { releaseDevice, acquireDevice, decommissionDevice, type TransferActor } from '@/lib/devices/transfer-service';

export const PLATFORM_DEVICE_ACTIONS = ['assign', 'release', 'suspend', 'activate', 'retire'] as const;
export type PlatformDeviceAction = typeof PLATFORM_DEVICE_ACTIONS[number];

export interface ActionCheck { ok: boolean; reason?: string }

/** PURE: validate a control device action + its required inputs. */
export function validateDeviceAction(action: string, ctx: { toSchoolId?: number | null }): ActionCheck {
  if (!PLATFORM_DEVICE_ACTIONS.includes(action as PlatformDeviceAction)) {
    return { ok: false, reason: `Unknown action '${action}'` };
  }
  if (action === 'assign' && !(Number.isFinite(ctx.toSchoolId) && (ctx.toSchoolId as number) > 0)) {
    return { ok: false, reason: 'assign requires a target school' };
  }
  return { ok: true };
}

const controlActor = (operatorId: number | null, schoolId: number | null): TransferActor => ({
  userId: operatorId, schoolId: schoolId ?? 0, ip: null, userAgent: 'xhenvolt-control', fromSuperAdmin: true,
});

export interface PlatformDeviceFilter { q?: string; schoolId?: number | 'unassigned' | null; status?: string | null }

/** Every device across every school, with owner name + computed online flag. */
export async function listPlatformDevices(filter: PlatformDeviceFilter = {}) {
  const cond: string[] = ['d.deleted_at IS NULL'];
  const params: any[] = [];
  if (filter.schoolId === 'unassigned') cond.push('d.school_id IS NULL');
  else if (Number.isFinite(filter.schoolId as number)) { cond.push('d.school_id = ?'); params.push(filter.schoolId); }
  if (filter.status) { cond.push('d.status = ?'); params.push(filter.status); }
  if (filter.q) {
    cond.push('(d.sn LIKE ? OR d.device_name LIKE ? OR d.location LIKE ?)');
    const like = `%${filter.q}%`; params.push(like, like, like);
  }
  const rows = (await query(
    `SELECT d.id, d.sn, d.device_name, d.model_name, d.location, d.status, d.school_id,
            d.last_seen, d.firmware_version, d.push_version,
            (d.last_seen > DATE_SUB(NOW(), INTERVAL 2 MINUTE)) AS is_online,
            s.name AS school_name
       FROM devices d
       LEFT JOIN schools s ON s.id = d.school_id
      WHERE ${cond.join(' AND ')}
      ORDER BY (d.school_id IS NULL) DESC, d.last_seen DESC`,
    params,
  )) as any[];
  return rows.map(r => ({ ...r, is_online: !!Number(r.is_online) }));
}

/** Ownership history for one device (newest first), with school names. */
export async function deviceTimeline(sn: string) {
  return (await query(
    `SELECT t.id, t.status, t.reason, t.initiated_at, t.completed_at,
            t.from_school_id, fs.name AS from_school, t.to_school_id, ts.name AS to_school,
            t.enrollments_archived, t.orphans_archived, t.raw_events_preserved
       FROM device_transfers t
       LEFT JOIN schools fs ON fs.id = t.from_school_id
       LEFT JOIN schools ts ON ts.id = t.to_school_id
      WHERE t.device_sn = ?
      ORDER BY t.id DESC`,
    [sn],
  )) as any[];
}

async function loadDevice(sn: string) {
  const r = (await query(`SELECT sn, school_id, status FROM devices WHERE sn = ? AND deleted_at IS NULL LIMIT 1`, [sn])) as any[];
  return r[0] ?? null;
}

export interface DeviceActionResult { ok: boolean; reason?: string; status?: string; assignedTo?: number }

/**
 * Run a platform device action. Returns { ok:false, reason } for a bad state
 * (surface as 400) and throws only on unexpected failures.
 */
export async function runDeviceAction(args: {
  sn: string; action: PlatformDeviceAction; toSchoolId?: number | null;
  reason?: string | null; operatorId: number; ip?: string | null;
}): Promise<DeviceActionResult> {
  const dev = await loadDevice(args.sn);
  if (!dev) return { ok: false, reason: 'Device not found' };
  const actor = controlActor(args.operatorId, dev.school_id);
  const audit = (action: string, meta: Record<string, unknown>) =>
    controlAudit(args.operatorId, action, `devices:${args.sn}`, meta, args.ip ?? null);

  switch (args.action) {
    case 'assign': {
      const to = Number(args.toSchoolId);
      if (dev.school_id === to) return { ok: false, reason: 'Device already belongs to that school' };
      if (dev.school_id == null) {
        // Never-owned device → direct claim (no prior enrollments to archive).
        await query(`UPDATE devices SET school_id = ?, status = 'active', updated_at = NOW() WHERE sn = ?`, [to, args.sn]);
        await query(
          `INSERT INTO device_transfers (device_sn, from_school_id, to_school_id, initiated_by, status, reason, completed_at)
           VALUES (?, NULL, ?, ?, 'acquired', ?, NOW())`,
          [args.sn, to, args.operatorId, args.reason ?? 'platform assign'],
        );
        await audit('device_assigned', { to_school_id: to, from: null });
        return { ok: true, assignedTo: to, status: 'active' };
      }
      if (dev.status === 'released') {
        // Released device → vetted acquire ceremony.
        await acquireDevice(args.sn, to, controlActor(args.operatorId, to), args.reason ?? 'platform reassign');
        await audit('device_assigned', { to_school_id: to, from: dev.school_id, via: 'acquire' });
        return { ok: true, assignedTo: to, status: 'active' };
      }
      return { ok: false, reason: 'Device is actively owned — release it first, then assign.' };
    }
    case 'release': {
      if (dev.status === 'released') return { ok: false, reason: 'Device is already released' };
      if (dev.school_id == null) return { ok: false, reason: 'Device is unassigned — nothing to release' };
      await releaseDevice(args.sn, actor, args.reason ?? 'platform release');
      await audit('device_released', { from_school_id: dev.school_id });
      return { ok: true, status: 'released' };
    }
    case 'suspend': {
      if (dev.status === 'retired') return { ok: false, reason: 'Device is retired' };
      await query(`UPDATE devices SET status = 'suspended', is_online = FALSE, updated_at = NOW() WHERE sn = ?`, [args.sn]);
      await audit('device_suspended', { from_status: dev.status });
      return { ok: true, status: 'suspended' };
    }
    case 'activate': {
      await query(`UPDATE devices SET status = 'active', updated_at = NOW() WHERE sn = ?`, [args.sn]);
      await audit('device_activated', { from_status: dev.status });
      return { ok: true, status: 'active' };
    }
    case 'retire': {
      if (dev.status === 'retired') return { ok: false, reason: 'Device already retired' };
      await decommissionDevice(args.sn, actor, args.reason ?? 'platform retire');
      await audit('device_retired', { from_school_id: dev.school_id });
      return { ok: true, status: 'retired' };
    }
    default:
      return { ok: false, reason: 'Unknown action' };
  }
}
