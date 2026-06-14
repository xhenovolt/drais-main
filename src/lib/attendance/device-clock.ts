/**
 * Device clock authority (Layer A + Layer B).
 * ───────────────────────────────────────────
 * The biometric devices keep their own RTC, backed by a coin-cell
 * battery. When that battery weakens — or someone sets the clock by
 * hand — the device clock drifts. A live K40 was found ~8h FAST, which
 * stamps every punch with a future wall-clock and corrupts attendance
 * times and lateness.
 *
 * Two layers defend against this:
 *
 *   Layer B (server-side authority) — the integrity guarantee:
 *     On ingest we compare the device's reported wall-clock to the
 *     wall-clock the device *should* be showing (server time + the
 *     school's UTC offset). A punch stamped in the FUTURE is physically
 *     impossible (you can't record attendance that hasn't happened),
 *     so when the device is currently ahead beyond tolerance we treat
 *     the device clock as faulty and correct the punch.
 *
 *     The correction subtracts the device's *stored* clock offset
 *     (devices.clock_offset_seconds), NOT server-now. This matters for
 *     two reasons:
 *       1. Dedup safety — ZKTeco devices re-send ATTLOG batches when an
 *          ACK is missed. uk_punch (sn, pin, check_time) must collapse
 *          the re-send. Using server-now would stamp each delivery
 *          differently and double-count. A correction that is a pure
 *          function of (device wall-clock, stored offset) is stable
 *          across re-sends.
 *       2. Backlog safety — the correction is gated on the *live* skew,
 *          so once the device is resynced and reports correct time we
 *          stop correcting (a stale stored offset is never applied to a
 *          now-correct punch).
 *
 *     The very first faulty punch (before an offset is learned) is kept
 *     at device time but flagged; the offset is recorded and every
 *     subsequent punch is corrected. The device value + skew are always
 *     preserved for audit.
 *
 *   Layer A (device resync) — keeps the device's own display correct:
 *     When we measure a real clock fault we queue a ZKTeco
 *     `SET OPTIONS DateTime=...` command. The device applies it on its
 *     next heartbeat, so it self-heals even if the RTC battery is dead
 *     (it re-corrects after every power cycle). Throttled per device so
 *     we don't re-queue on every punch.
 *
 * NOTE: the school UTC offset defaults to +180 min (EAT / UTC+3, which
 * covers Uganda + East Africa). Override with SCHOOL_UTC_OFFSET_MINUTES
 * if DRAIS is ever deployed in another zone. Per-school offsets are a
 * future enhancement (would live on the schools table).
 */

import { query } from '@/lib/db';

const DEFAULT_OFFSET_MIN = 180; // EAT / UTC+3

export function schoolUtcOffsetMinutes(): number {
  const raw = process.env.SCHOOL_UTC_OFFSET_MINUTES;
  if (raw == null || raw === '') return DEFAULT_OFFSET_MIN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_OFFSET_MIN;
}

/** Clock is "ahead/future" beyond this → unambiguously a fault. */
const AHEAD_OVERRIDE_MS = 120_000; // 2 min
/** Either-direction skew beyond this → queue a device resync. */
const RESYNC_THRESHOLD_MS = 120_000; // 2 min
/** Don't re-queue a resync for the same device more than once per hour. */
const RESYNC_THROTTLE_MS = 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Format a "wall epoch" — an epoch whose UTC fields ARE the wall clock —
 * as "YYYY-MM-DD HH:mm:ss". Used for naive device strings parsed as UTC.
 */
function formatWallEpoch(wallMs: number): string {
  const d = new Date(wallMs);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/**
 * Format a real (UTC) epoch as the school's local wall-clock string,
 * matching how the device reports time and how punch_at is stored.
 */
export function localWallString(epochMs: number, offsetMin = schoolUtcOffsetMinutes()): string {
  return formatWallEpoch(epochMs + offsetMin * 60_000);
}

export interface ClockDecision {
  /**
   * The ACTUAL instant the punch happened, as a real UTC Date. Store this
   * in punch_at / check_time (real timestamp → the browser renders the
   * correct local time, with no phantom +offset).
   */
  punchInstant: Date;
  /**
   * The device's raw reported wall-clock string. This is the punch's
   * IDENTITY — store it in device_reported_time and dedup on it (ZKTeco
   * re-sends the same value on a missed ACK).
   */
  deviceReportedTime: string;
  /** device clock − true time, seconds. + = device ahead/future. */
  skewSeconds: number;
  /** true when we could not trust the device clock and overrode it. */
  corrected: boolean;
  /** 'device' = punch_at came from the device's (accurate) clock;
   *  'server' = punch_at is the server instant / offset-recovered. */
  timeSource: 'device' | 'server';
  /** true when the skew warrants pushing a time-sync command. */
  needsResync: boolean;
}

/**
 * Decide the ACTUAL punch instant for one device punch.
 *
 * The device clock is only trusted when it is accurate (small skew); in
 * that case the device-reported instant IS the real punch time and is
 * used verbatim (this also handles legitimate backlog uploads from a
 * device that was offline but keeping correct time). When the clock is
 * wrong we recover the real instant by subtracting the device's learned
 * offset, or — on the very first faulty punch before an offset is known —
 * fall back to the server receive instant.
 *
 * Dedup is keyed on deviceReportedTime (the punch identity), so the
 * computed instant may safely differ between re-sends without
 * double-counting.
 *
 * @param deviceCheckTime     normalized device wall-clock "YYYY-MM-DD HH:mm:ss"
 * @param storedOffsetSeconds devices.clock_offset_seconds (null if unknown)
 * @param nowMs               server receive time (defaults to Date.now())
 */
export function decidePunchTime(
  deviceCheckTime: string,
  storedOffsetSeconds: number | null,
  nowMs = Date.now(),
): ClockDecision {
  const offsetMin = schoolUtcOffsetMinutes();
  // The naive device string is the device's LOCAL wall clock. Parse it as
  // an absolute UTC instant: read the digits as UTC, then remove the
  // school's UTC offset → the instant the device thinks the punch occurred.
  const deviceWallMs = Date.parse(`${deviceCheckTime.replace(' ', 'T')}Z`);

  // Unparseable → fall back to the server instant; nothing else we can do.
  if (!Number.isFinite(deviceWallMs)) {
    return {
      punchInstant: new Date(nowMs),
      deviceReportedTime: deviceCheckTime,
      skewSeconds: 0,
      corrected: true,
      timeSource: 'server',
      needsResync: false,
    };
  }

  const deviceInstantMs = deviceWallMs - offsetMin * 60_000;
  const skewMs = deviceInstantMs - nowMs; // + = device clock ahead of real time
  const skewSeconds = Math.round(skewMs / 1000);
  const needsResync = Math.abs(skewMs) > RESYNC_THRESHOLD_MS;

  // Trust the device instant UNLESS the punch is clearly in the FUTURE.
  // A future punch is physically impossible → the clock is fast → override.
  // Everything else (small drift, or a punch in the PAST) is trusted: a
  // past timestamp is ambiguous between a slow clock and a legitimate
  // backlog upload from an offline-but-on-time device, and trusting the
  // device value is the only choice that preserves real backlog times. A
  // genuinely slow clock is still flagged (needsResync) and healed by the
  // device resync, never by inventing a time here.
  if (skewMs <= AHEAD_OVERRIDE_MS) {
    return {
      punchInstant: new Date(deviceInstantMs),
      deviceReportedTime: deviceCheckTime,
      skewSeconds,
      corrected: false,
      timeSource: 'device',
      needsResync,
    };
  }

  // Future punch → fast clock. If we know the persistent offset, recover the
  // real instant stably (handles backlog from a fast device too).
  const storedOffsetMs = (storedOffsetSeconds ?? 0) * 1000;
  if (storedOffsetSeconds != null && storedOffsetMs > AHEAD_OVERRIDE_MS) {
    return {
      punchInstant: new Date(deviceInstantMs - storedOffsetMs),
      deviceReportedTime: deviceCheckTime,
      skewSeconds,
      corrected: true,
      timeSource: 'server',
      needsResync: true,
    };
  }

  // Bootstrap: device clock wrong, offset not learned yet. Use the server
  // receive instant (accurate for a realtime push) and learn the offset
  // (queueDeviceTimeSync) so subsequent punches are recovered precisely.
  return {
    punchInstant: new Date(nowMs),
    deviceReportedTime: deviceCheckTime,
    skewSeconds,
    corrected: true,
    timeSource: 'server',
    needsResync: true,
  };
}

/**
 * ZKTeco "DateTime" option encoding (packed integer):
 *   ((Y-2000)*12*31 + (M-1)*31 + (D-1)) * 86400 + h*3600 + m*60 + s
 * Built from the school-local wall clock so the device displays local
 * time after applying it.
 */
export function encodeZkDateTime(epochMs = Date.now(), offsetMin = schoolUtcOffsetMinutes()): number {
  const d = new Date(epochMs + offsetMin * 60_000);
  const Y = d.getUTCFullYear();
  const M = d.getUTCMonth() + 1;
  const D = d.getUTCDate();
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  return ((Y - 2000) * 12 * 31 + (M - 1) * 31 + (D - 1)) * 86400 + h * 3600 + m * 60 + s;
}

/** Read the device's last-measured clock offset (seconds), or null. */
export async function getDeviceClockOffset(deviceSn: string): Promise<number | null> {
  try {
    const rows = (await query(
      `SELECT clock_offset_seconds FROM devices WHERE sn = ? LIMIT 1`,
      [deviceSn],
    )) as Array<{ clock_offset_seconds: number | null }>;
    const v = rows?.[0]?.clock_offset_seconds;
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

/**
 * Layer A — queue a `SET OPTIONS DateTime=...` command for the device and
 * persist the measured offset, throttled to at most once per hour
 * (devices.clock_last_synced_at). Best-effort: never throws into ingest.
 */
export async function queueDeviceTimeSync(
  schoolId: number,
  deviceSn: string,
  skewSeconds: number,
): Promise<void> {
  try {
    // Persist the freshly-measured offset so the next punch can correct
    // stably (this is cheap and always worth doing).
    await query(
      `UPDATE devices SET clock_offset_seconds = ? WHERE sn = ?`,
      [skewSeconds, deviceSn],
    );

    // Throttle the actual command: skip if we synced this device recently.
    const rows = (await query(
      `SELECT clock_last_synced_at FROM devices WHERE sn = ? LIMIT 1`,
      [deviceSn],
    )) as Array<{ clock_last_synced_at: Date | string | null }>;
    const last = rows?.[0]?.clock_last_synced_at;
    if (last) {
      const lastMs = last instanceof Date ? last.getTime() : Date.parse(`${String(last).replace(' ', 'T')}Z`);
      if (Number.isFinite(lastMs) && Date.now() - lastMs < RESYNC_THROTTLE_MS) {
        return; // synced recently — let the pending command land first
      }
    }

    // Skip if a DateTime command is already pending for this device.
    const pending = (await query(
      `SELECT id FROM zk_device_commands
        WHERE device_sn = ? AND status = 'pending' AND command LIKE 'SET OPTIONS DateTime=%'
        LIMIT 1`,
      [deviceSn],
    )) as Array<{ id: number }>;
    if (pending?.length) return;

    const encoded = encodeZkDateTime();
    await query(
      `INSERT INTO zk_device_commands (school_id, device_sn, command, status, priority, expires_at)
       VALUES (?, ?, ?, 'pending', 50, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      [schoolId, deviceSn, `SET OPTIONS DateTime=${encoded}`],
    );
    await query(
      `UPDATE devices SET clock_last_synced_at = NOW() WHERE sn = ?`,
      [deviceSn],
    );
  } catch {
    /* clock resync is best-effort — never disrupt ingest */
  }
}
