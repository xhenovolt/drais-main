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
import { normalizeDeviceDateTime } from '@/lib/attendance/adms-protocol';

const DEFAULT_OFFSET_MIN = 180; // EAT / UTC+3

export function schoolUtcOffsetMinutes(): number {
  const raw = process.env.SCHOOL_UTC_OFFSET_MINUTES;
  if (raw == null || raw === '') return DEFAULT_OFFSET_MIN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_OFFSET_MIN;
}

// ── Per-school time policy ─────────────────────────────────────────────
export type DeviceTimePolicyKind =
  | 'TRUST_DEVICE_TIME'          // store device wall-clock as-is (minus tz); never override, never auto-sync
  | 'TRUST_SERVER_RECEIVE_TIME'  // always stamp punch_at = server receive instant
  | 'CORRECT_BY_DRIFT'           // trust device unless future/ahead; recover real instant via learned offset
  | 'MANUAL_REVIEW_IF_DRIFT';    // keep device time but flag for review when drift exceeds max

export interface TimePolicy {
  schoolId: number;
  timezone: string;
  offsetMinutes: number;
  policy: DeviceTimePolicyKind;
  autoSyncDeviceTime: boolean;     // may DRAIS push SET DateTime to the device?
  maxDriftSeconds: number;
  correctOfflineBacklog: boolean;
  displayRawAndCorrected: boolean;
  /**
   * Cap, in seconds, on how far "behind" real time a device clock may read
   * before `correctOfflineBacklog` stops applying automatically. A device
   * genuinely offline for a few hours and catching up on reconnect is normal
   * and should be trusted; a device that reads hours-to-a-day behind while
   * demonstrably online (this same ingest pass) is not offline — its clock
   * is simply wrong in the other direction from the fast-clock case, and
   * blindly trusting it caused a real incident: within one JIPRA batch, some
   * punches read a plausible few minutes/hours behind while others in the
   * SAME short window read up to ~14 hours behind — the device's clock is
   * unstable, not offline. Default 8h covers a school closed overnight
   * without a device restart; beyond that, don't guess — flag for review,
   * exactly like an implausibly-fast reading already does.
   */
  maxOfflineBacklogSeconds: number;
}

const DEFAULT_POLICY: Omit<TimePolicy, 'schoolId'> = {
  timezone: 'Africa/Kampala',
  offsetMinutes: DEFAULT_OFFSET_MIN,
  policy: 'CORRECT_BY_DRIFT',
  autoSyncDeviceTime: false,       // OFF by default — DRAIS won't change device clocks unless opted in
  maxDriftSeconds: 120,
  correctOfflineBacklog: true,
  displayRawAndCorrected: false,
  maxOfflineBacklogSeconds: 8 * 3600,
};

const policyCache = new Map<number, { p: TimePolicy; exp: number }>();

/** Resolve a school's time policy (60s cache; safe defaults if unset/missing). */
export async function resolveTimePolicy(schoolId: number): Promise<TimePolicy> {
  const c = policyCache.get(schoolId);
  if (c && c.exp > Date.now()) return c.p;
  let p: TimePolicy = { schoolId, ...DEFAULT_POLICY };
  try {
    const rows = (await query(
      `SELECT school_timezone, utc_offset_minutes, device_time_policy, auto_sync_device_time,
              max_allowed_drift_seconds, correct_offline_backlog, display_raw_and_corrected_time,
              max_offline_backlog_seconds
         FROM attendance_time_policy WHERE school_id = ? LIMIT 1`,
      [schoolId],
    )) as any[];
    if (rows[0]) {
      const r = rows[0];
      p = {
        schoolId,
        timezone: r.school_timezone ?? DEFAULT_POLICY.timezone,
        offsetMinutes: Number(r.utc_offset_minutes ?? DEFAULT_OFFSET_MIN),
        policy: (r.device_time_policy ?? DEFAULT_POLICY.policy) as DeviceTimePolicyKind,
        autoSyncDeviceTime: !!r.auto_sync_device_time,
        maxDriftSeconds: Number(r.max_allowed_drift_seconds ?? 120),
        correctOfflineBacklog: !!r.correct_offline_backlog,
        displayRawAndCorrected: !!r.display_raw_and_corrected_time,
        maxOfflineBacklogSeconds: Number(r.max_offline_backlog_seconds ?? DEFAULT_POLICY.maxOfflineBacklogSeconds),
      };
    }
  } catch { /* table not migrated yet → defaults */ }
  policyCache.set(schoolId, { p, exp: Date.now() + 60_000 });
  return p;
}

export function clearTimePolicyCache(schoolId?: number): void {
  if (schoolId != null) policyCache.delete(schoolId); else policyCache.clear();
}

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
  /** high = device trusted; corrected = drift-recovered; review = drift over
   *  max, kept device time, needs a human; server = server-receive time. */
  timeConfidence: 'high' | 'corrected' | 'review' | 'server';
  /** which policy produced this decision (audit). */
  policyUsed: DeviceTimePolicyKind;
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
  policy: TimePolicy,
  deviceOffsetMin?: number | null,
  nowMs = Date.now(),
): ClockDecision {
  // Per-device tz override wins over the school offset.
  const normalizedDeviceCheckTime = normalizeDeviceDateTime(deviceCheckTime) ?? deviceCheckTime;
  const offsetMin = deviceOffsetMin != null ? deviceOffsetMin : policy.offsetMinutes;
  const maxDriftMs = Math.max(0, policy.maxDriftSeconds) * 1000;
  const base = { deviceReportedTime: normalizedDeviceCheckTime, policyUsed: policy.policy };

  // The naive device string is the device's LOCAL wall clock. Parse it as
  // an absolute UTC instant: read the digits as UTC, then remove the offset.
  const deviceWallMs = Date.parse(`${normalizedDeviceCheckTime.replace(' ', 'T')}Z`);
  if (!Number.isFinite(deviceWallMs)) {
    return { ...base, punchInstant: new Date(nowMs), skewSeconds: 0, corrected: true, timeSource: 'server', needsResync: false, timeConfidence: 'server' };
  }

  const deviceInstantMs = deviceWallMs - offsetMin * 60_000;
  const skewMs = deviceInstantMs - nowMs; // + = device ahead of real time
  const skewSeconds = Math.round(skewMs / 1000);
  const driftExceeds = Math.abs(skewMs) > maxDriftMs;

  const trustDevice = (confidence: ClockDecision['timeConfidence'], needsResync: boolean): ClockDecision => ({
    ...base, punchInstant: new Date(deviceInstantMs), skewSeconds, corrected: false, timeSource: 'device', needsResync, timeConfidence: confidence,
  });
  const serverTime = (): ClockDecision => ({
    ...base, punchInstant: new Date(nowMs), skewSeconds, corrected: true, timeSource: 'server', needsResync: false, timeConfidence: 'server',
  });

  switch (policy.policy) {
    case 'TRUST_DEVICE_TIME':
      // Store exactly what the device reported (minus tz). No correction, no resync.
      return trustDevice('high', false);

    case 'TRUST_SERVER_RECEIVE_TIME':
      // Attendance time is always the moment DRAIS received the punch.
      return serverTime();

    case 'MANUAL_REVIEW_IF_DRIFT':
      // Keep the device time but flag rows that drift beyond max for a human.
      // Only resync if drift exceeds AND the school opted into auto-sync.
      return trustDevice(driftExceeds ? 'review' : 'high', driftExceeds && policy.autoSyncDeviceTime);

    case 'CORRECT_BY_DRIFT':
    default: {
      // Trust the device UNLESS the punch is in the FUTURE (impossible →
      // fast clock). Past/within-tolerance is trusted (preserves real
      // backlog).
      if (skewMs <= maxDriftMs) {
        const behindBeyondMax = skewMs < -maxDriftMs;
        if (!behindBeyondMax) return trustDevice('high', driftExceeds);

        // Behind-tolerance: genuinely offline-then-reconnected devices catch
        // up looking "behind" — that's normal and, within a plausible window,
        // trusted per policy. But "behind" has no upper bound by itself, and
        // blindly trusting ANY magnitude is exactly what let a live incident
        // through: within one ingest batch, the SAME device produced both a
        // plausible few-minutes/hours-behind reading AND one behind by ~14h,
        // and both were trusted as "high confidence" backlog. A device that
        // far behind, while demonstrably online enough to be delivering this
        // very punch, is not "catching up" — its clock is simply wrong, just
        // in the opposite direction from the future-dated case below. Cap
        // auto-trust at maxOfflineBacklogSeconds; beyond it, don't guess —
        // flag for review exactly like an implausible future timestamp does.
        const withinPlausibleBacklog = Math.abs(skewMs) <= policy.maxOfflineBacklogSeconds * 1000;
        if (withinPlausibleBacklog) {
          return trustDevice(policy.correctOfflineBacklog ? 'high' : 'review', driftExceeds);
        }
        return trustDevice('review', true);
      }
      // Future/ahead → recover the real instant via the learned offset (stable
      // across re-sends), else fall back to server-now on the first faulty punch.
      const storedOffsetMs = (storedOffsetSeconds ?? 0) * 1000;
      if (storedOffsetSeconds != null && storedOffsetMs > maxDriftMs) {
        return { ...base, punchInstant: new Date(deviceInstantMs - storedOffsetMs), skewSeconds, corrected: true, timeSource: 'server', needsResync: true, timeConfidence: 'corrected' };
      }
      return { ...base, punchInstant: new Date(nowMs), skewSeconds, corrected: true, timeSource: 'server', needsResync: true, timeConfidence: 'corrected' };
    }
  }
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
  return (await getDeviceTimeContext(deviceSn)).clockOffsetSeconds;
}

/** Read per-device time context: learned drift + optional tz override. */
export async function getDeviceTimeContext(
  deviceSn: string,
): Promise<{ clockOffsetSeconds: number | null; tzOffsetMinutes: number | null }> {
  try {
    const rows = (await query(
      `SELECT clock_offset_seconds, tz_offset_minutes FROM devices WHERE sn = ? LIMIT 1`,
      [deviceSn],
    )) as Array<{ clock_offset_seconds: number | null; tz_offset_minutes: number | null }>;
    const r = rows?.[0];
    return {
      clockOffsetSeconds: r?.clock_offset_seconds == null ? null : Number(r.clock_offset_seconds),
      tzOffsetMinutes: r?.tz_offset_minutes == null ? null : Number(r.tz_offset_minutes),
    };
  } catch {
    return { clockOffsetSeconds: null, tzOffsetMinutes: null };
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
  offsetMin: number = schoolUtcOffsetMinutes(),
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

    const encoded = encodeZkDateTime(Date.now(), offsetMin);
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
