/**
 * Phase 2 — automatic validation of a staged acquisition batch.
 *
 * Runs immediately after staging (docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md
 * §7-§9, mission Phase 3 "Automatic Validation"). Everything here is
 * read-only against production attendance — it annotates the STAGING rows
 * and the batch, never attendance_raw_events.
 *
 * Checks:
 *   - identity: resolve each distinct device PIN against biometric
 *     enrollments (names for the inspection screen; unmatched counted)
 *   - duplicates: staged wall identity vs existing attendance_raw_events
 *     (device_reported_time holds the wall clock — Phase 0 restored that
 *     contract) → duplicate_of_event_id
 *   - future punches: wall time ahead of the device's own probed clock
 *     (or the server-derived device wall when no probe) beyond tolerance
 *   - first-3 / last-3 plausibility anchors for the operator
 */
import { query } from '@/lib/db';
import { resolveIdentity } from '@/lib/biometric/identity/resolve';
import { ensureAcquisitionSchema } from './schema';
import {
  isDeviceWallTime, summarizeWallTimes, utcToWall, wallDiffSeconds,
  type DeviceWallTime,
} from './wall-time';

const FUTURE_TOLERANCE_SECONDS = 120;

export interface ValidationSummary {
  acquisitionId: number;
  records: number;
  matched: number;
  unmatched: number;
  duplicates: number;
  futureFlagged: number;
  first3: Array<{ pin: string; wall: string; name: string | null }>;
  last3: Array<{ pin: string; wall: string; name: string | null }>;
  deviceWallNow: string | null;
  serverWallNow: string;
  clockDeltaSeconds: number | null;
  warnings: string[];
}

interface StagedRow {
  id: number;
  device_user_id: string;
  device_wall_time: string;
  display_name: string | null;
}

export async function validateAcquisition(args: {
  schoolId: number;
  acquisitionId: number;
  deviceSn: string | null;
  tzOffsetMinutes: number;
  /** Device wall clock probed at pull time (CMD_GET_TIME), if available. */
  deviceWallNow?: DeviceWallTime | null;
}): Promise<ValidationSummary> {
  const { schoolId, acquisitionId, deviceSn, tzOffsetMinutes } = args;
  await ensureAcquisitionSchema();

  const rows = (await query(
    `SELECT id, device_user_id, device_wall_time, display_name
       FROM attendance_acquisition_records
      WHERE acquisition_id = ?
      ORDER BY device_wall_time ASC, id ASC`,
    [acquisitionId],
  )) as StagedRow[];

  const warnings: string[] = [];
  const serverWallNow = utcToWall(new Date(), tzOffsetMinutes);
  const deviceWallNow = args.deviceWallNow && isDeviceWallTime(args.deviceWallNow) ? args.deviceWallNow : null;
  const clockDeltaSeconds = deviceWallNow ? wallDiffSeconds(deviceWallNow, serverWallNow) : null;
  if (clockDeltaSeconds != null && Math.abs(clockDeltaSeconds) > FUTURE_TOLERANCE_SECONDS) {
    warnings.push(`Device clock differs from server by ${clockDeltaSeconds}s (device wall ${deviceWallNow}, expected ~${serverWallNow}).`);
  }

  // ── Identity resolution: once per distinct PIN ────────────────────────
  const byPin = new Map<string, StagedRow[]>();
  for (const r of rows) {
    const list = byPin.get(r.device_user_id) ?? [];
    list.push(r); byPin.set(r.device_user_id, list);
  }
  const pinResolution = new Map<string, { matched: boolean; personId: number | null; roleType: string | null; roleRefId: number | null; name: string | null }>();
  for (const pin of byPin.keys()) {
    let res: Awaited<ReturnType<typeof resolveIdentity>> | null = null;
    if (deviceSn) {
      try { res = await resolveIdentity({ schoolId, deviceSn, deviceUserId: pin }); } catch { res = null; }
    }
    let name: string | null = null;
    if (res?.resolved) {
      try {
        if (res.roleType === 'student' && res.studentId) {
          name = (await query(`SELECT full_name FROM students WHERE id = ? AND school_id = ? LIMIT 1`, [res.studentId, schoolId]))?.[0]?.full_name ?? null;
        } else if (res.roleType === 'staff' && res.staffId) {
          name = (await query(`SELECT full_name FROM staff WHERE id = ? AND school_id = ? LIMIT 1`, [res.staffId, schoolId]))?.[0]?.full_name ?? null;
        }
      } catch { name = null; }
    }
    pinResolution.set(pin, {
      matched: res?.resolved ?? false,
      personId: res?.personId ?? null,
      roleType: res?.roleType ?? null,
      roleRefId: (res?.studentId ?? res?.staffId) ?? null,
      name,
    });
  }

  // ── Duplicate detection against existing raw events ───────────────────
  // device_reported_time is the wall identity (Phase 0 restored this for
  // the legacy rows). One ranged query covers the whole batch.
  const dupKey = new Map<string, number>(); // "pin|wall" → raw event id
  if (rows.length && deviceSn) {
    const minWall = rows[0].device_wall_time;
    const maxWall = rows[rows.length - 1].device_wall_time;
    const existing = (await query(
      `SELECT id, device_user_id,
              DATE_FORMAT(device_reported_time, '%Y-%m-%d %H:%i:%s') AS wall
         FROM attendance_raw_events
        WHERE school_id = ? AND device_sn = ?
          AND device_reported_time BETWEEN ? AND ?`,
      [schoolId, deviceSn, minWall, maxWall],
    )) as Array<{ id: number; device_user_id: number | string; wall: string }>;
    for (const e of existing) dupKey.set(`${e.device_user_id}|${e.wall}`, e.id);
  }

  // ── Annotate staged rows ──────────────────────────────────────────────
  let matched = 0, unmatched = 0, duplicates = 0, futureFlagged = 0;
  const wallNowForFuture = deviceWallNow ?? serverWallNow;
  for (const r of rows) {
    const res = pinResolution.get(r.device_user_id)!;
    const flags: string[] = [];
    const dupId = dupKey.get(`${r.device_user_id}|${r.device_wall_time}`) ?? null;
    if (dupId != null) { flags.push('duplicate'); duplicates++; }
    if (!res.matched) { flags.push('unmatched'); unmatched++; } else { matched++; }
    const aheadSec = wallDiffSeconds(r.device_wall_time as DeviceWallTime, wallNowForFuture);
    if (aheadSec != null && aheadSec > FUTURE_TOLERANCE_SECONDS) { flags.push('future'); futureFlagged++; }

    await query(
      `UPDATE attendance_acquisition_records
          SET matched = ?, person_id = ?, role_type = ?, role_ref_id = ?,
              display_name = COALESCE(display_name, ?),
              duplicate_of_event_id = ?, validation_flags = ?
        WHERE id = ?`,
      [
        res.matched ? 1 : 0, res.personId, res.roleType, res.roleRefId,
        res.name, dupId, flags.length ? flags.join(',') : null, r.id,
      ],
    );
  }
  if (futureFlagged) warnings.push(`${futureFlagged} punch(es) are timestamped in the device's future — inspect before saving.`);

  const nameOf = (r: StagedRow) => pinResolution.get(r.device_user_id)?.name ?? r.display_name ?? null;
  const summary = summarizeWallTimes(rows.map(r => ({ wall: r.device_wall_time as DeviceWallTime, row: r })));

  await query(
    `UPDATE attendance_acquisitions
        SET status = 'validated', records_unmatched = ?, records_duplicate = ?,
            device_time_at_pull = COALESCE(?, device_time_at_pull),
            clock_delta_seconds = COALESCE(?, clock_delta_seconds),
            warnings_json = ?
      WHERE id = ? AND school_id = ?`,
    [
      unmatched, duplicates, deviceWallNow, clockDeltaSeconds,
      warnings.length ? JSON.stringify(warnings) : null,
      acquisitionId, schoolId,
    ],
  );

  return {
    acquisitionId,
    records: rows.length,
    matched, unmatched, duplicates, futureFlagged,
    first3: summary.first.map(({ row }) => ({ pin: row.device_user_id, wall: row.device_wall_time, name: nameOf(row) })),
    last3:  summary.last.map(({ row }) => ({ pin: row.device_user_id, wall: row.device_wall_time, name: nameOf(row) })),
    deviceWallNow, serverWallNow, clockDeltaSeconds, warnings,
  };
}
