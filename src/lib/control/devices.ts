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
import { query } from '@/lib/control/db';
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

/**
 * ONE definition of a device's state, used by the device list AND the dashboard (they used to disagree:
 * the list hid every retired device, the dashboard counted them as part of the fleet).
 *
 *   lifecycle — retired (status 'retired' or soft-deleted) | suspended | released | in_service (anything else;
 *               the legacy `status` column also holds connectivity words like 'active'/'offline')
 *   online    — heard from in the last ONLINE_WINDOW_MINUTES. Only in-service devices count towards
 *               fleet health; retired ones are never "offline".
 */
export const ONLINE_WINDOW_MINUTES = 2;
export const DEVICE_LIFECYCLE_SQL =
  `CASE WHEN d.deleted_at IS NOT NULL OR LOWER(d.status) = 'retired' THEN 'retired'
        WHEN LOWER(d.status) IN ('suspended', 'released') THEN LOWER(d.status)
        ELSE 'in_service' END`;
export const DEVICE_ONLINE_SQL = `(d.last_seen IS NOT NULL AND d.last_seen > DATE_SUB(NOW(), INTERVAL ${ONLINE_WINDOW_MINUTES} MINUTE))`;

/** Filter values the list accepts (lower-case). Legacy values are mapped, unknown ones are rejected. */
export const DEVICE_STATUS_FILTERS = ['online', 'offline', 'in_service', 'suspended', 'released', 'retired'] as const;
export type DeviceStatusFilter = typeof DEVICE_STATUS_FILTERS[number];
export const DEVICE_VIEWS = ['all', 'in_service', 'retired'] as const;
export type DeviceView = typeof DEVICE_VIEWS[number];

/** PURE: normalise a ?status= value. 'active' → in_service, 'inactive' → offline; '' → no filter; unknown → null. */
export function normalizeDeviceStatusFilter(raw: string | null | undefined): DeviceStatusFilter | '' | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v || v === 'all' || v === 'any') return '';
  if (v === 'active') return 'in_service';
  if (v === 'inactive') return 'offline';
  return (DEVICE_STATUS_FILTERS as readonly string[]).includes(v) ? (v as DeviceStatusFilter) : null;
}

/** PURE: the SQL condition for one status filter (combined with the others by AND). */
export function deviceStatusCondition(f: DeviceStatusFilter): string {
  switch (f) {
    case 'online': return `(${DEVICE_LIFECYCLE_SQL}) = 'in_service' AND ${DEVICE_ONLINE_SQL}`;
    case 'offline': return `(${DEVICE_LIFECYCLE_SQL}) = 'in_service' AND NOT ${DEVICE_ONLINE_SQL}`;
    default: return `(${DEVICE_LIFECYCLE_SQL}) = '${f}'`;
  }
}

export interface PlatformDeviceFilter {
  q?: string; schoolId?: number | 'unassigned' | null; status?: DeviceStatusFilter | '' | null;
  /** all (default) | in_service | retired */
  view?: DeviceView | null;
  /** Restrict to these schools (a school-scoped operator). [] = nothing. */
  schoolScope?: number[] | null;
  /** Bounded slice (P21). Omit for the legacy unbounded list. */
  limit?: number; offset?: number;
}

export interface DeviceCounts { all: number; in_service: number; online: number; offline: number; suspended: number; released: number; retired: number }

/** Whole-fleet counts by lifecycle/connectivity (optionally scoped). Feeds the list tabs and the dashboard. */
export async function deviceCounts(schoolScope?: number[] | null): Promise<DeviceCounts> {
  const scoped = Array.isArray(schoolScope);
  const where = scoped ? (schoolScope!.length ? `WHERE d.school_id IN (${schoolScope!.map(() => '?').join(',')})` : 'WHERE 1 = 0') : '';
  const rows = (await query(
    `SELECT COUNT(*) AS all_n,
            SUM(lc = 'in_service') AS in_service, SUM(lc = 'in_service' AND online = 1) AS online,
            SUM(lc = 'in_service' AND online = 0) AS offline, SUM(lc = 'suspended') AS suspended,
            SUM(lc = 'released') AS released, SUM(lc = 'retired') AS retired
       FROM (SELECT ${DEVICE_LIFECYCLE_SQL} AS lc, ${DEVICE_ONLINE_SQL} AS online FROM devices d ${where}) x`,
    scoped ? schoolScope! : [],
  )) as any[];
  const r = rows[0] || {};
  const n = (v: unknown) => Number(v || 0);
  return { all: n(r.all_n), in_service: n(r.in_service), online: n(r.online), offline: n(r.offline), suspended: n(r.suspended), released: n(r.released), retired: n(r.retired) };
}

/**
 * Every device (across every school) matching the filter, with owner name, lifecycle and
 * computed online flag. Filters combine with AND. Returns { rows, total }; when `limit` is given
 * the query is bounded (P21 scale hardening) and `total` reflects the full match.
 * Errors are thrown, never turned into an empty list (an empty fleet must mean an empty fleet).
 */
export async function listPlatformDevices(filter: PlatformDeviceFilter = {}) {
  const cond: string[] = ['1 = 1'];
  const params: any[] = [];
  if (filter.schoolId === 'unassigned') cond.push('d.school_id IS NULL');
  else if (Number.isFinite(filter.schoolId as number)) { cond.push('d.school_id = ?'); params.push(filter.schoolId); }
  if (Array.isArray(filter.schoolScope)) {
    if (filter.schoolScope.length === 0) cond.push('1 = 0');
    else { cond.push(`d.school_id IN (${filter.schoolScope.map(() => '?').join(',')})`); params.push(...filter.schoolScope); }
  }
  if (filter.view === 'in_service') cond.push(`(${DEVICE_LIFECYCLE_SQL}) <> 'retired'`);
  else if (filter.view === 'retired') cond.push(`(${DEVICE_LIFECYCLE_SQL}) = 'retired'`);
  if (filter.status) cond.push(deviceStatusCondition(filter.status));
  if (filter.q) {
    cond.push('(d.sn LIKE ? OR d.device_name LIKE ? OR d.location LIKE ?)');
    const like = `%${filter.q}%`; params.push(like, like, like);
  }
  const where = cond.join(' AND ');

  const countRows = (await query(`SELECT COUNT(*) AS total FROM devices d WHERE ${where}`, params)) as any[];
  const total = Number(countRows[0]?.total || 0);

  const bounded = Number.isFinite(filter.limit as number) && (filter.limit as number) > 0;
  const pageClause = bounded ? `LIMIT ${Math.floor(filter.limit as number)} OFFSET ${Math.max(0, Math.floor(filter.offset || 0))}` : '';
  const rows = (await query(
    `SELECT d.id, d.sn, d.device_name, d.model_name, d.device_type, d.location, d.status, d.school_id,
            d.last_seen, d.last_activity, d.firmware_version, d.push_version, d.ip_address, d.lan_ip,
            d.device_user_count, d.created_at, d.deleted_at,
            ${DEVICE_LIFECYCLE_SQL} AS lifecycle,
            ${DEVICE_ONLINE_SQL} AS is_online,
            s.name AS school_name
       FROM devices d
       LEFT JOIN schools s ON s.id = d.school_id
      WHERE ${where}
      ORDER BY ((${DEVICE_LIFECYCLE_SQL}) = 'retired') ASC, (d.school_id IS NULL) DESC, d.last_seen DESC
      ${pageClause}`,
    params,
  )) as any[];
  return { rows: rows.map(r => ({ ...r, is_online: !!Number(r.is_online) })), total };
}

/** Full detail for one device: the row + live counts + owner. */
export async function deviceDetail(sn: string) {
  const rows = (await query(
    `SELECT d.*, (d.last_seen > DATE_SUB(NOW(), INTERVAL 2 MINUTE)) AS is_online, s.name AS school_name
       FROM devices d LEFT JOIN schools s ON s.id = d.school_id WHERE d.sn = ? LIMIT 1`, [sn],
  ).catch(() => [])) as any[];
  const d = rows[0];
  if (!d) return null;
  const one = async (sql: string, p: any[]) => Number(((await query(sql, p).catch(() => [{}])) as any[])[0]?.n || 0);
  const [todayPunches, pending, enrollments, lastPunch] = await Promise.all([
    one(`SELECT COUNT(*) n FROM zk_attendance_logs WHERE device_sn = ? AND DATE(check_time) = CURDATE()`, [sn]),
    one(`SELECT COUNT(*) n FROM zk_device_commands WHERE device_sn = ? AND status = 'pending'`, [sn]),
    d.school_id ? one(`SELECT COUNT(*) n FROM biometric_enrollments WHERE school_id = ? AND status IN ('active','pending_capture')`, [d.school_id]) : Promise.resolve(0),
    (async () => (((await query(`SELECT MAX(check_time) t FROM zk_attendance_logs WHERE device_sn = ?`, [sn]).catch(() => [{}])) as any[])[0]?.t ?? null))(),
  ]);
  return {
    ...d, is_online: !!Number(d.is_online),
    counts: { today_punches: todayPunches, pending_commands: pending, mapped_users: enrollments },
    last_punch_at: lastPunch,
  };
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
      // Respect the target school's plan device cap (safe by default — off unless enabled).
      const { enforcePlanLimit } = await import('@/lib/control/plan-enforcement');
      const gate = await enforcePlanLimit(to, 'devices');
      if (!gate.allowed) return { ok: false, reason: gate.reason };
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
