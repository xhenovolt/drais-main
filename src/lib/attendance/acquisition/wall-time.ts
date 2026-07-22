/**
 * DeviceWallTime — THE canonical time representation for attendance
 * acquisition (Phase 1 of docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md).
 *
 * A biometric device reports punches as a timezone-less LOCAL wall clock
 * ("2026-07-17 08:19:33"). The 2026-07 forensic audit found that wrapping
 * that value in a JS `Date` under ad-hoc conventions (server-local via
 * node-zklib, wall-as-UTC via the ADMS normalizer, real-UTC after
 * decidePunchTime) and serializing it back with mismatched formatters
 * produced silent ±3h shifts whose direction depended on the HOST server's
 * timezone (RC-1).
 *
 * The rule this module enforces:
 *   - The wall string is captured verbatim at the protocol boundary and is
 *     the punch's identity through staging, inspection and validation.
 *   - Conversion to a real UTC instant happens EXACTLY ONCE (wallToUtc),
 *     with the timezone offset as an explicit argument, at persistence time.
 *   - No function here ever consults the host timezone. Everything is
 *     tz-invariant and unit-tested as such.
 */

/** "YYYY-MM-DD HH:mm:ss" — a device's local wall clock, no timezone. */
export type DeviceWallTime = string & { readonly __brand?: 'DeviceWallTime' };

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

export function isDeviceWallTime(s: unknown): s is DeviceWallTime {
  if (typeof s !== 'string') return false;
  const m = WALL_RE.exec(s);
  if (!m) return false;
  const [, , mo, d, h, mi, se] = m.map(Number) as unknown as number[];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h <= 23 && mi <= 59 && se <= 59;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/**
 * Recover the device wall string from a node-zklib `recordTime`.
 *
 * node-zklib builds recordTime as `new Date(y, m, d, h, mm, ss)` in the
 * HOST-LOCAL timezone from the device's wall components. Reading it back
 * with local getters is therefore tz-invariant: construction and read use
 * the same zone, so the original wall components come back exactly,
 * regardless of what timezone the host runs in. (Never use toISOString()
 * on these Dates — that is RC-1.)
 */
export function wallFromZkRecordTime(recordTime: Date | string | number): DeviceWallTime | null {
  const d = recordTime instanceof Date ? recordTime : new Date(recordTime);
  if (Number.isNaN(d.getTime())) return null;
  return (
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
    `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
  ) as DeviceWallTime;
}

/**
 * THE single wall→instant conversion. `tzOffsetMinutes` is the zone the
 * DEVICE's clock displays (e.g. 180 for EAT, 480 for a factory-default
 * UTC+8 unit) — always explicit, never inferred from the host.
 */
export function wallToUtc(wall: DeviceWallTime, tzOffsetMinutes: number): Date | null {
  if (!isDeviceWallTime(wall)) return null;
  const asUtcMs = Date.parse(`${wall.replace(' ', 'T')}Z`);
  if (!Number.isFinite(asUtcMs)) return null;
  return new Date(asUtcMs - tzOffsetMinutes * 60_000);
}

/** Inverse of wallToUtc — format a real instant as a device-zone wall string. */
export function utcToWall(instant: Date, tzOffsetMinutes: number): DeviceWallTime {
  const d = new Date(instant.getTime() + tzOffsetMinutes * 60_000);
  return (
    `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ` +
    `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`
  ) as DeviceWallTime;
}

/** Calendar date ("YYYY-MM-DD") of a wall time — for day-window filtering.
 *  Pure string slice: immune to the toISOString().slice() day-boundary bug. */
export function wallDate(wall: DeviceWallTime): string {
  return wall.slice(0, 10);
}

/** Seconds of (a − b) between two wall strings in the same zone. */
export function wallDiffSeconds(a: DeviceWallTime, b: DeviceWallTime): number | null {
  const ams = Date.parse(`${a.replace(' ', 'T')}Z`);
  const bms = Date.parse(`${b.replace(' ', 'T')}Z`);
  if (!Number.isFinite(ams) || !Number.isFinite(bms)) return null;
  return Math.round((ams - bms) / 1000);
}

/**
 * Decode ZKTeco's packed DateTime integer (CMD_GET_TIME reply / DateTime
 * option) to the device's wall clock. Pure inverse of encodeZkDateTime in
 * device-clock.ts:
 *   packed = ((Y-2000)*12*31 + (M-1)*31 + (D-1)) * 86400 + h*3600 + m*60 + s
 */
export function decodeZkPackedTime(packed: number): DeviceWallTime | null {
  if (!Number.isFinite(packed) || packed < 0) return null;
  const s = packed % 60;   packed = (packed - s) / 60;
  const mi = packed % 60;  packed = (packed - mi) / 60;
  const h = packed % 24;   packed = (packed - h) / 24;
  const d = (packed % 31) + 1;   packed = (packed - (d - 1)) / 31;
  const mo = (packed % 12) + 1;  packed = (packed - (mo - 1)) / 12;
  const y = packed + 2000;
  if (y < 2000 || y > 2099) return null;
  const wall = `${y}-${p2(mo)}-${p2(d)} ${p2(h)}:${p2(mi)}:${p2(s)}` as DeviceWallTime;
  return isDeviceWallTime(wall) ? wall : null;
}

/** First-N / last-N punches of a batch by wall order — the operator's
 *  plausibility anchors ("do these look like this morning?"). */
export function summarizeWallTimes<T extends { wall: DeviceWallTime }>(
  records: readonly T[],
  n = 3,
): { first: T[]; last: T[] } {
  const sorted = [...records].sort((a, b) => a.wall < b.wall ? -1 : a.wall > b.wall ? 1 : 0);
  return { first: sorted.slice(0, n), last: sorted.slice(-n).reverse() };
}
