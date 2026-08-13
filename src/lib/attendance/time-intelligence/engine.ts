/**
 * Time Intelligence Engine — orchestration.
 *
 *   learnBaseline()        Phase 0/6 — compute a school+device's attendance
 *                          fingerprint from 90 days of history. Re-running it
 *                          after corrections is the "learning": corrected
 *                          punch_at values sharpen the baseline.
 *   evaluateDeviceDay()    Phase 1/2 — batch stats + assessBatch → upsert
 *                          device_clock_health for the day.
 *   sweepToday()           evaluate every active device for today.
 *   previewCorrection()    Phase 4/5 — before/after rows, nothing written.
 *   applyCorrection()      shift punch_at, keep device_reported_time verbatim,
 *                          store originals for undo, re-evaluate verdicts.
 *   undoCorrection()       restore original punch_at values + re-evaluate.
 *   deviceHealthOverview() Phase 7/8 — per-device clock health + trend.
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { ensureTimeIntelligenceSchema } from './schema';
import { assessBatch, applyPolicy, median, mad, percentile, type Baseline, type BatchStats, type Assessment } from './confidence';

const MIN_PUNCHES_FOR_DAY = 5; // fewer looks like a holiday/weekend — not a school day

/** Minute-of-day (school-local) for a UTC instant. */
export const minuteOfDay = (utc: Date, offsetMin: number): number => {
  const l = new Date(utc.getTime() + offsetMin * 60_000);
  return l.getUTCHours() * 60 + l.getUTCMinutes();
};
export const localDateStr = (utc: Date, offsetMin: number): string =>
  new Date(utc.getTime() + offsetMin * 60_000).toISOString().slice(0, 10);

/** Robust "first arrival": the 3rd earliest punch minute of the day (one or
 *  two stray night punches can't fake an early opening). */
export function firstArrivalOf(minutes: number[]): number | null {
  if (minutes.length < 3) return minutes.length ? Math.min(...minutes) : null;
  return [...minutes].sort((a, b) => a - b)[2];
}

/* ── Phase 0/6: learn the fingerprint ─────────────────────────────────── */

export async function learnBaseline(schoolId: number, deviceSn: string, windowDays = 90): Promise<Baseline | null> {
  await ensureTimeIntelligenceSchema();
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;

  const rows = (await query(
    `SELECT punch_at FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ?
        AND punch_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND punch_at < DATE_SUB(NOW(), INTERVAL 0 DAY)`,
    [schoolId, deviceSn, windowDays],
  )) as Array<{ punch_at: Date | string }>;

  // Days DRAIS itself already flagged as anomalous — excluded from the
  // learning set below. Without this, a day the clock was genuinely broken
  // teaches the baseline that its own corruption IS "normal", widening
  // mad_minutes until future occurrences of the SAME fault fall back inside
  // "tolerance" and get silently trusted again — the exact failure mode a
  // live incident exposed (a 3h+ deviation still scored 92%/"resolved"
  // because the baseline's own spread had already absorbed it).
  const anomalyDays = new Set(
    (await query(
      `SELECT local_date FROM device_clock_health WHERE school_id = ? AND device_sn = ? AND status = 'anomaly'`,
      [schoolId, deviceSn],
    ).catch(() => []) as Array<{ local_date: Date | string }>)
      .map((r) => localDateStr(r.local_date instanceof Date ? r.local_date : new Date(r.local_date), 0)),
  );

  // Group punches by school-local day.
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    const d = r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at);
    const key = localDateStr(d, off);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(minuteOfDay(d, off));
  }

  // Working days only (enough punches), excluding today (it may be the
  // anomaly) and any day already flagged anomalous.
  const today = localDateStr(new Date(), off);
  const firsts: number[] = [];
  const dailyCounts: number[] = [];
  for (const [day, mins] of byDay) {
    if (day === today || anomalyDays.has(day) || mins.length < MIN_PUNCHES_FOR_DAY) continue;
    const f = firstArrivalOf(mins);
    if (f != null) { firsts.push(f); dailyCounts.push(mins.length); }
  }

  const baseline: Baseline & { earliest_minute: number | null; latest_first_minute?: number | null } = {
    median_first_minute: firsts.length ? median(firsts) : (null as any),
    mad_minutes: firsts.length ? mad(firsts) : (null as any),
    p10_first_minute: firsts.length ? percentile(firsts, 10) : null,
    p90_first_minute: firsts.length ? percentile(firsts, 90) : null,
    earliest_minute: firsts.length ? Math.min(...firsts) : null,
    latest_first_minute: firsts.length ? Math.max(...firsts) : null,
    median_daily_punches: dailyCounts.length ? median(dailyCounts) : null,
    sample_days: firsts.length,
  };

  await query(
    `INSERT INTO attendance_time_baselines
       (school_id, device_sn, median_first_minute, mad_minutes, p10_first_minute, p90_first_minute,
        earliest_minute, latest_first_minute, median_daily_punches, sample_days, window_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       median_first_minute=VALUES(median_first_minute), mad_minutes=VALUES(mad_minutes),
       p10_first_minute=VALUES(p10_first_minute), p90_first_minute=VALUES(p90_first_minute),
       earliest_minute=VALUES(earliest_minute), latest_first_minute=VALUES(latest_first_minute),
       median_daily_punches=VALUES(median_daily_punches), sample_days=VALUES(sample_days), window_days=VALUES(window_days)`,
    [schoolId, deviceSn,
      baseline.median_first_minute ?? null, baseline.mad_minutes ?? null,
      baseline.p10_first_minute, baseline.p90_first_minute,
      baseline.earliest_minute, baseline.latest_first_minute,
      baseline.median_daily_punches, baseline.sample_days, windowDays],
  );
  return baseline.sample_days ? baseline : null;
}

async function loadBaseline(schoolId: number, deviceSn: string): Promise<Baseline | null> {
  const rows = (await query(
    `SELECT median_first_minute, mad_minutes, p10_first_minute, p90_first_minute,
            earliest_minute, median_daily_punches, sample_days, computed_at
       FROM attendance_time_baselines WHERE school_id = ? AND device_sn = ? LIMIT 1`,
    [schoolId, deviceSn],
  )) as any[];
  const b = rows[0];
  if (!b) return null;
  // Stale baseline (>24h old) refreshes lazily.
  if (b.computed_at && Date.now() - new Date(b.computed_at).getTime() > 24 * 3600_000) return null;
  return b.median_first_minute == null ? null : {
    median_first_minute: Number(b.median_first_minute), mad_minutes: Number(b.mad_minutes ?? 10),
    p10_first_minute: b.p10_first_minute, p90_first_minute: b.p90_first_minute,
    earliest_minute: b.earliest_minute, median_daily_punches: b.median_daily_punches,
    sample_days: Number(b.sample_days || 0),
  };
}

/* ── Phase 1/2: assess one device-day ─────────────────────────────────── */

export async function evaluateDeviceDay(schoolId: number, deviceSn: string, dateStr?: string): Promise<Assessment & { local_date: string; batch_size: number; first_arrival_minute: number | null }> {
  await ensureTimeIntelligenceSchema();
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const date = dateStr || localDateStr(new Date(), off);

  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);
  const rows = (await query(
    `SELECT punch_at, ingested_at, clock_skew_seconds FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND punch_at >= ? AND punch_at < ?`,
    [schoolId, deviceSn, utcStart, utcEnd],
  )) as Array<{ punch_at: Date | string; ingested_at: Date | string | null; clock_skew_seconds: number | null }>;

  const nowMs = Date.now();
  const minutes: number[] = [];
  const skews: number[] = []; // device clock − true time (sec, +ve = device ahead), recorded at ingest
  let futureCount = 0, maxFutureMinutes = 0, nearMidnight = 0, yearBad = false, outOfOrder = 0;
  let prevPunch = -Infinity;
  for (const r of rows) {
    const p = r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at);
    const m = minuteOfDay(p, off);
    minutes.push(m);
    if (r.clock_skew_seconds != null && Number.isFinite(Number(r.clock_skew_seconds))) skews.push(Number(r.clock_skew_seconds));
    const ing = r.ingested_at ? new Date(r.ingested_at as any).getTime() : nowMs;
    if (p.getTime() > ing + 2 * 60_000 && p.getTime() > nowMs + 2 * 60_000) {
      futureCount++;
      maxFutureMinutes = Math.max(maxFutureMinutes, Math.round((p.getTime() - Math.max(ing, nowMs)) / 60_000));
    }
    if (m < 180) nearMidnight++;
    const y = p.getUTCFullYear();
    if (y < 2020 || y > new Date().getUTCFullYear() + 1) yearBad = true;
    if (p.getTime() < prevPunch - 60_000) outOfOrder++;
    prevPunch = p.getTime();
  }

  const batch: BatchStats = {
    firstArrivalMinute: firstArrivalOf(minutes),
    punchCount: minutes.length,
    futureCount, maxFutureMinutes,
    nearMidnightCount: nearMidnight,
    yearOutOfRange: yearBad,
    outOfOrderCount: outOfOrder,
  };

  let baseline = await loadBaseline(schoolId, deviceSn);
  if (!baseline) baseline = await learnBaseline(schoolId, deviceSn);

  // Raw device drift (what the CLOCK did), from the skew recorded at ingest —
  // independent of whatever landed in punch_at after the policy ran.
  const rawDriftMin = skews.length ? Math.round(median(skews) / 60) : 0;
  // Reinterpret the punch_at-only verdict in light of the policy + raw drift,
  // so an already-auto-corrected drift reads as resolved (not "still wrong").
  const assessment = applyPolicy(assessBatch(baseline, batch), {
    policy: policy.policy, rawDriftMin, maxDriftMin: (policy.maxDriftSeconds ?? 120) / 60,
  });

  await query(
    `INSERT INTO device_clock_health
       (school_id, device_sn, local_date, confidence, status, offset_estimate_min, likely_cause, detail, batch_size, first_arrival_minute,
        raw_drift_min, residual_drift_min, resolved_by_policy, policy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       confidence=VALUES(confidence), status=VALUES(status), offset_estimate_min=VALUES(offset_estimate_min),
       likely_cause=VALUES(likely_cause), detail=VALUES(detail), batch_size=VALUES(batch_size),
       first_arrival_minute=VALUES(first_arrival_minute),
       raw_drift_min=VALUES(raw_drift_min), residual_drift_min=VALUES(residual_drift_min),
       resolved_by_policy=VALUES(resolved_by_policy), policy=VALUES(policy)`,
    [schoolId, deviceSn, date, assessment.confidence, assessment.status, assessment.offsetEstimateMin,
      assessment.likelyCause, assessment.detail.slice(0, 250), batch.punchCount, batch.firstArrivalMinute,
      assessment.rawDriftMin ?? 0, assessment.residualDriftMin ?? assessment.offsetEstimateMin,
      assessment.resolvedByPolicy ? 1 : 0, assessment.policy ?? policy.policy],
  );

  return { ...assessment, local_date: date, batch_size: batch.punchCount, first_arrival_minute: batch.firstArrivalMinute };
}

/** Evaluate every device that has punches today for this school. */
export async function sweepToday(schoolId: number): Promise<Array<Assessment & { device_sn: string; local_date: string; batch_size: number; first_arrival_minute: number | null }>> {
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const date = localDateStr(new Date(), off);
  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const devices = (await query(
    `SELECT DISTINCT device_sn FROM attendance_raw_events
      WHERE school_id = ? AND punch_at >= ? AND device_sn IS NOT NULL`,
    [schoolId, utcStart],
  )) as Array<{ device_sn: string }>;
  const out = [];
  for (const d of devices) {
    out.push({ device_sn: d.device_sn, ...(await evaluateDeviceDay(schoolId, d.device_sn, date)) });
  }
  return out;
}

/* ── Phase 4/5: assisted correction (preview → apply → undo) ──────────── */

export interface CorrectionPreviewRow { id: number; name: string | null; before: string; after: string; }

export interface DevicePunchRow {
  id: number; person_id: number | null; name: string | null; time: string;
  /** 'today' = within the requested local day. 'previous_late' = late-night
   *  punches on the PRECEDING local day (default: from 18:00) — the classic
   *  shape of a mis-clocked early-morning arrival that got stamped as "last
   *  night" instead of rolling into today. Surfaced alongside 'today' so an
   *  operator can select them together and shift them forward across
   *  midnight into the correct day in one action. */
  bucket: 'today' | 'previous_late';
}

/**
 * Full (untruncated) list of a device's punches for one local day, PLUS the
 * preceding day's late-night stragglers — for the per-person
 * selective-correction UI. Unlike previewCorrection's `sample` (capped at 12,
 * for a quick glance), this returns every row so an operator can pick exactly
 * which people's punches were actually wrong when only some of a batch is
 * corrupted, not the whole device — including people whose bad punch landed
 * on the WRONG calendar day because the shift needed crosses midnight.
 */
export async function listPunchesForDate(
  schoolId: number, deviceSn: string, date: string, previousLateFromHour = 18,
): Promise<DevicePunchRow[]> {
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);
  const prevLateStart = new Date(utcStart.getTime() - 86_400_000 + previousLateFromHour * 3_600_000);
  const rows = (await query(
    `SELECT id, person_id, display_name, punch_at FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND punch_at >= ? AND punch_at < ?
      ORDER BY punch_at ASC`,
    [schoolId, deviceSn, prevLateStart, utcEnd],
  )) as any[];
  const fmt = (d: Date) => new Date(d.getTime() + off * 60_000).toISOString().slice(11, 16);
  return rows.map((r) => {
    const p = new Date(r.punch_at);
    return {
      id: Number(r.id), person_id: r.person_id != null ? Number(r.person_id) : null,
      name: r.display_name ?? null, time: fmt(p),
      bucket: p < utcStart ? 'previous_late' : 'today',
    } as DevicePunchRow;
  });
}

export interface DeviceTimeSampleRow {
  id: number;
  name: string | null;
  /** The device's own raw wall-clock reading at punch time, verbatim —
   *  never re-offset, never corrected. What the device's screen actually
   *  showed. */
  device_time: string;
  /** DRAIS's stored (possibly policy-corrected) instant, in school-local
   *  wall-clock. What attendance actually reports today. */
  drais_time: string;
  /** device clock − real time, seconds (from ingest). null pre-dates the
   *  clock-authority columns. */
  skew_seconds: number | null;
  time_source: string | null;
}

/**
 * The first and last N punches of a device's local day, with the device's
 * OWN raw reported time next to DRAIS's stored (corrected) time — so an
 * operator can SEE the actual drift instead of inferring it only from an
 * aggregate confidence score. Reported live: Time Health showed a verdict
 * but never the underlying evidence, forcing corrections to be made
 * "blindly from the UI".
 *
 * device_reported_time is stored as the device's raw wall-clock digits
 * (see device-clock.ts's formatWallEpoch — a naive string, not a real UTC
 * instant), so it's read back with the UTC getters verbatim; punch_at IS a
 * real instant and is rendered in school-local wall-clock like every other
 * time on this page.
 */
export async function sampleDevicePunches(
  schoolId: number, deviceSn: string, date: string, n = 10,
): Promise<{ first: DeviceTimeSampleRow[]; last: DeviceTimeSampleRow[]; total: number }> {
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);
  const rows = (await query(
    `SELECT id, display_name, punch_at, device_reported_time, clock_skew_seconds, time_source
       FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND punch_at >= ? AND punch_at < ?
      ORDER BY punch_at ASC`,
    [schoolId, deviceSn, utcStart, utcEnd],
  )) as any[];

  const fmtLocal = (d: Date) => new Date(d.getTime() + off * 60_000).toISOString().slice(11, 16);
  const fmtDeviceRaw = (d: Date | string | null): string => {
    if (!d) return '—';
    const dd = d instanceof Date ? d : new Date(d);
    if (!Number.isFinite(dd.getTime())) return '—';
    return `${String(dd.getUTCHours()).padStart(2, '0')}:${String(dd.getUTCMinutes()).padStart(2, '0')}`;
  };
  const toRow = (r: any): DeviceTimeSampleRow => ({
    id: Number(r.id), name: r.display_name ?? null,
    device_time: fmtDeviceRaw(r.device_reported_time),
    drais_time: fmtLocal(new Date(r.punch_at)),
    skew_seconds: r.clock_skew_seconds != null ? Number(r.clock_skew_seconds) : null,
    time_source: r.time_source ?? null,
  });

  return {
    first: rows.slice(0, n).map(toRow),
    last: rows.length > n ? rows.slice(-n).map(toRow) : [],
    total: rows.length,
  };
}

export interface HistoricalDayAnalysis {
  date: string;
  rowCount: number;
  /** Distinct skew clusters found in this day's stored clock_skew_seconds,
   *  sorted largest-first. A healthy/smoothly-drifting day has exactly one. */
  bands: Array<{ skewSeconds: number; count: number }>;
  stable: boolean;
  /** Rounded hours for the dominant band, only populated when it covers at
   *  least half the day's rows — a plain "not stable" split. Ambiguous days
   *  (no clear majority band) get null: worth a human's eyes, not a guess. */
  suggestedDriftHours: number | null;
}

const HISTORY_BAND_GAP_SECONDS = 1800; // 30 min — wider than this within a sorted run means a genuine jump, not noise.

/**
 * PURE: cluster one day's raw clock_skew_seconds values into distinct
 * "bands" — a sorted run splits wherever consecutive values are more than
 * `gapSeconds` apart. A smoothly-drifting clock produces exactly one band;
 * a clock that jumped mid-day (RTC failure signature) produces several.
 * Exported standalone so the clustering rule itself is unit-testable
 * without a database.
 */
export function clusterSkewBands(
  skews: number[], gapSeconds = HISTORY_BAND_GAP_SECONDS,
): Array<{ skewSeconds: number; count: number }> {
  if (!skews.length) return [];
  const sorted = [...skews].sort((a, b) => a - b);
  const clusters: number[][] = [];
  let current: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > gapSeconds) { clusters.push(current); current = []; }
    current.push(sorted[i]);
  }
  clusters.push(current);
  return clusters
    .map((c) => ({ skewSeconds: Math.round(c.reduce((a, b) => a + b, 0) / c.length), count: c.length }))
    .sort((a, b) => b.count - a.count);
}

/**
 * PURE: turn one day's clustered bands into the day-level verdict —
 * stable/unstable and a suggested correction, if there's a clear majority.
 */
export function summarizeDayBands(bands: Array<{ skewSeconds: number; count: number }>, totalRows: number): {
  stable: boolean; suggestedDriftHours: number | null;
} {
  const stable = bands.length <= 1;
  const suggestedDriftHours = !stable && bands[0].count >= totalRows / 2
    ? Math.round(bands[0].skewSeconds / 3600) : null;
  return { stable, suggestedDriftHours };
}

/**
 * Analyze ALREADY-STORED punches for a device over a trailing window, day by
 * day, to find days whose clock_skew_seconds splits into multiple distinct
 * clusters — the stored signature of a clock that jumped mid-day (the
 * pattern diagnosed live on JIPRA's device) rather than drifted smoothly.
 * Purely diagnostic: flags candidates and suggests an hours value for
 * previewRecomputeFromDeviceTime/applyRecomputeFromDeviceTime to try — it
 * never writes anything itself.
 */
export async function analyzeDeviceHistory(
  schoolId: number, deviceSn: string, days = 30,
): Promise<HistoricalDayAnalysis[]> {
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const rows = (await query(
    `SELECT punch_at, clock_skew_seconds FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND clock_skew_seconds IS NOT NULL
        AND punch_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY punch_at ASC`,
    [schoolId, deviceSn, Math.max(1, Math.min(90, days))],
  )) as Array<{ punch_at: Date | string; clock_skew_seconds: number }>;

  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    const d = localDateStr(new Date(r.punch_at), off);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(Number(r.clock_skew_seconds));
  }

  const out: HistoricalDayAnalysis[] = [];
  for (const [date, skews] of byDay) {
    const bands = clusterSkewBands(skews);
    const { stable, suggestedDriftHours } = summarizeDayBands(bands, skews.length);
    out.push({ date, rowCount: skews.length, bands, stable, suggestedDriftHours });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export async function previewCorrection(
  schoolId: number, deviceSn: string, date: string, shiftMinutes: number,
): Promise<{ affected: number; sample: CorrectionPreviewRow[] }> {
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);
  const rows = (await query(
    `SELECT id, display_name, punch_at FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND punch_at >= ? AND punch_at < ?
      ORDER BY punch_at ASC`,
    [schoolId, deviceSn, utcStart, utcEnd],
  )) as any[];
  const fmt = (d: Date) => new Date(d.getTime() + off * 60_000).toISOString().slice(11, 16);
  return {
    affected: rows.length,
    sample: rows.slice(0, 12).map((r) => {
      const p = new Date(r.punch_at);
      return { id: Number(r.id), name: r.display_name ?? null, before: fmt(p), after: fmt(new Date(p.getTime() + shiftMinutes * 60_000)) };
    }),
  };
}

export async function applyCorrection(
  schoolId: number, deviceSn: string, date: string, shiftMinutes: number,
  userId?: number | null, source: 'assisted' | 'manual' | 'auto' = 'assisted',
): Promise<{ correctionId: number; affected: number; reEvaluated: number }> {
  await ensureTimeIntelligenceSchema();
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);

  // Snapshot originals FIRST — undo depends on this.
  const rows = (await query(
    `SELECT id, person_id, role_type, punch_at FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND punch_at >= ? AND punch_at < ?`,
    [schoolId, deviceSn, utcStart, utcEnd],
  )) as any[];
  if (!rows.length) return { correctionId: 0, affected: 0, reEvaluated: 0 };

  const originals = rows.map((r) => ({ id: Number(r.id), punch_at: new Date(r.punch_at).toISOString() }));
  const ins = (await query(
    `INSERT INTO attendance_time_corrections
       (school_id, device_sn, local_date, shift_minutes, affected_rows, original_times, source, applied_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, deviceSn, date, shiftMinutes, rows.length, JSON.stringify(originals), source, userId ?? null],
  )) as unknown as { insertId: number };

  await query(
    `UPDATE attendance_raw_events
        SET punch_at = DATE_ADD(punch_at, INTERVAL ? MINUTE),
            clock_skew_seconds = ?
      WHERE school_id = ? AND device_sn = ? AND punch_at >= ? AND punch_at < ?`,
    [shiftMinutes, -shiftMinutes * 60, schoolId, deviceSn, utcStart, utcEnd],
  );

  const reEvaluated = await reevaluateAffected(schoolId, rows, shiftMinutes, off);

  await query(
    `UPDATE device_clock_health SET corrected = 1, confidence = 90, status = 'trusted',
            detail = CONCAT('Corrected ', ?, ' min by admin')
      WHERE school_id = ? AND device_sn = ? AND local_date = ?`,
    [shiftMinutes, schoolId, deviceSn, date],
  ).catch(() => {});
  // Learning: refresh the fingerprint with the corrected data.
  learnBaseline(schoolId, deviceSn).catch(() => {});

  return { correctionId: ins.insertId, affected: rows.length, reEvaluated };
}

/**
 * Recompute-from-raw correction — unlike applyCorrection (which ADDS a shift
 * to whatever punch_at currently holds), this recomputes punch_at fresh from
 * device_reported_time every time: punch_at = raw_digits − tz_offset −
 * driftHours. It is therefore idempotent and immune to compounding, which
 * matters when a device's drift was measured inconsistently across the day
 * (confirmed live: the SAME device's batches this session measured skew of
 * +6h in one ingest and a different value in another — applyCorrection's
 * additive shift would stack on top of that mixed state and make the
 * already-wrong subset worse, not better). Selects rows by `ingested_at`
 * (server receipt time — always reliable) rather than the current, possibly
 * wrong, `punch_at`, so every punch actually received today is included
 * regardless of how badly its stored time already drifted.
 */
export async function previewRecomputeFromDeviceTime(
  schoolId: number, deviceSn: string, date: string, driftHours: number,
): Promise<{ affected: number; sample: CorrectionPreviewRow[] }> {
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);
  const rows = (await query(
    `SELECT id, display_name, punch_at, device_reported_time FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND ingested_at >= ? AND ingested_at < ?
        AND device_reported_time IS NOT NULL
      ORDER BY device_reported_time ASC`,
    [schoolId, deviceSn, utcStart, utcEnd],
  )) as any[];
  const fmtLocal = (ms: number) => new Date(ms + off * 60_000).toISOString().slice(11, 16);
  const recompute = (r: any) => new Date(r.device_reported_time).getTime() - off * 60_000 - driftHours * 3_600_000;
  return {
    affected: rows.length,
    sample: rows.slice(0, 12).map((r) => ({
      id: Number(r.id), name: r.display_name ?? null,
      before: fmtLocal(new Date(r.punch_at).getTime()), after: fmtLocal(recompute(r)),
    })),
  };
}

export async function applyRecomputeFromDeviceTime(
  schoolId: number, deviceSn: string, date: string, driftHours: number,
  userId?: number | null, source: 'assisted' | 'manual' | 'auto' = 'assisted',
): Promise<{ correctionId: number; affected: number; reEvaluated: number }> {
  await ensureTimeIntelligenceSchema();
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);

  const rows = (await query(
    `SELECT id, person_id, role_type, punch_at, device_reported_time FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND ingested_at >= ? AND ingested_at < ?
        AND device_reported_time IS NOT NULL`,
    [schoolId, deviceSn, utcStart, utcEnd],
  )) as any[];
  if (!rows.length) return { correctionId: 0, affected: 0, reEvaluated: 0 };

  const recompute = (r: any) => new Date(r.device_reported_time).getTime() - off * 60_000 - driftHours * 3_600_000;
  const originals = rows.map((r) => ({ id: Number(r.id), punch_at: new Date(r.punch_at).toISOString() }));
  // Representative shift — used ONLY so undo's re-evaluation step knows which
  // second date-bucket to also re-check; the actual restore uses the
  // `originals` snapshot above, never this number.
  const repShiftMinutes = Math.round(
    rows.reduce((sum, r) => sum + (recompute(r) - new Date(r.punch_at).getTime()) / 60_000, 0) / rows.length,
  );

  const ins = (await query(
    `INSERT INTO attendance_time_corrections
       (school_id, device_sn, local_date, shift_minutes, affected_rows, original_times, source, applied_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, deviceSn, date, repShiftMinutes, rows.length, JSON.stringify(originals), source, userId ?? null],
  )) as unknown as { insertId: number };

  for (const r of rows) {
    await query(
      `UPDATE attendance_raw_events SET punch_at = ?, clock_skew_seconds = ? WHERE id = ? AND school_id = ?`,
      [new Date(recompute(r)), driftHours * 3600, Number(r.id), schoolId],
    );
  }

  const reEvaluated = await reevaluateAffected(schoolId, rows, repShiftMinutes, off);

  await query(
    `UPDATE device_clock_health SET corrected = 1, confidence = 90, status = 'trusted',
            detail = CONCAT('Recomputed from raw device time, ', ?, 'h drift, by admin')
      WHERE school_id = ? AND device_sn = ? AND local_date = ?`,
    [driftHours, schoolId, deviceSn, date],
  ).catch(() => {});
  learnBaseline(schoolId, deviceSn).catch(() => {});

  return { correctionId: Number(ins.insertId), affected: rows.length, reEvaluated };
}

/**
 * SELECTIVE correction — shift only specific punches (by raw-event id) rather
 * than the whole device batch. For when just some people's times are wrong
 * (e.g. an AM/PM mix-up on a subset), not the whole device. Snapshots originals
 * for undo (via the same `undoCorrection`), re-evaluates the affected
 * person-days (both the old and the shifted date), and keeps
 * `device_reported_time` verbatim.
 */
export async function correctPunches(
  schoolId: number, ids: number[], shiftMinutes: number, userId?: number | null,
): Promise<{ correctionId: number; affected: number; reEvaluated: number }> {
  await ensureTimeIntelligenceSchema();
  const cleanIds = [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (!cleanIds.length || !Number.isFinite(shiftMinutes) || shiftMinutes === 0) {
    return { correctionId: 0, affected: 0, reEvaluated: 0 };
  }
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const ph = cleanIds.map(() => '?').join(',');

  const rows = (await query(
    `SELECT id, person_id, role_type, punch_at, device_sn FROM attendance_raw_events
      WHERE school_id = ? AND id IN (${ph})`,
    [schoolId, ...cleanIds],
  )) as any[];
  if (!rows.length) return { correctionId: 0, affected: 0, reEvaluated: 0 };

  const originals = rows.map((r) => ({ id: Number(r.id), punch_at: new Date(r.punch_at).toISOString() }));
  const localDate = localDateStr(new Date(rows[0].punch_at), off);
  const deviceSn = rows[0].device_sn || 'SELECTIVE';
  const ins = (await query(
    `INSERT INTO attendance_time_corrections
       (school_id, device_sn, local_date, shift_minutes, affected_rows, original_times, source, applied_by)
     VALUES (?, ?, ?, ?, ?, ?, 'selective', ?)`,
    [schoolId, deviceSn, localDate, shiftMinutes, rows.length, JSON.stringify(originals), userId ?? null],
  )) as unknown as { insertId: number };

  await query(
    `UPDATE attendance_raw_events SET punch_at = DATE_ADD(punch_at, INTERVAL ? MINUTE)
      WHERE school_id = ? AND id IN (${ph})`,
    [shiftMinutes, schoolId, ...cleanIds],
  );

  const reEvaluated = await reevaluateAffected(schoolId, rows, shiftMinutes, off);
  return { correctionId: Number(ins?.insertId || 0), affected: rows.length, reEvaluated };
}

export async function undoCorrection(schoolId: number, correctionId: number, userId?: number | null): Promise<{ restored: number }> {
  await ensureTimeIntelligenceSchema();
  const rows = (await query(
    `SELECT * FROM attendance_time_corrections WHERE id = ? AND school_id = ? AND undone_at IS NULL LIMIT 1`,
    [correctionId, schoolId],
  )) as any[];
  const c = rows[0];
  if (!c) return { restored: 0 };
  const originals: Array<{ id: number; punch_at: string }> = JSON.parse(c.original_times || '[]');
  for (const o of originals) {
    await query(`UPDATE attendance_raw_events SET punch_at = ? WHERE id = ? AND school_id = ?`,
      [new Date(o.punch_at), o.id, schoolId]);
  }
  await query(`UPDATE attendance_time_corrections SET undone_by = ?, undone_at = NOW() WHERE id = ?`, [userId ?? null, correctionId]);

  // Re-evaluate the affected person-days at BOTH the corrected and restored dates.
  const policy = await resolveTimePolicy(schoolId);
  const affected = (await query(
    `SELECT id, person_id, role_type, punch_at FROM attendance_raw_events WHERE school_id = ? AND id IN (${originals.map(() => '?').join(',')})`,
    [schoolId, ...originals.map((o) => o.id)],
  )) as any[];
  await reevaluateAffected(schoolId, affected, -Number(c.shift_minutes), policy.offsetMinutes);
  return { restored: originals.length };
}

async function reevaluateAffected(schoolId: number, rows: any[], shiftMinutes: number, off: number): Promise<number> {
  const keys = new Set<string>();
  for (const r of rows) {
    if (!r.person_id || !r.role_type) continue;
    const p = new Date(r.punch_at);
    for (const t of [p, new Date(p.getTime() + shiftMinutes * 60_000)]) {
      keys.add(`${r.person_id}|${r.role_type}|${localDateStr(t, off)}`);
    }
  }
  const { evaluateDay } = await import('@/lib/attendance/engine');
  let n = 0;
  for (const key of keys) {
    const [personId, roleType, d] = key.split('|');
    await evaluateDay(schoolId, Number(personId), roleType as any, new Date(`${d}T00:00:00`)).catch(() => {});
    n++;
  }
  return n;
}

/* ── Phase 7/8: device health overview ────────────────────────────────── */

export async function deviceHealthOverview(schoolId: number) {
  await ensureTimeIntelligenceSchema();
  const policy = await resolveTimePolicy(schoolId);
  const today = await sweepToday(schoolId);
  const history = (await query(
    `SELECT device_sn,
            ROUND(AVG(ABS(COALESCE(offset_estimate_min, 0)))) AS avg_drift_min,
            MAX(ABS(COALESCE(offset_estimate_min, 0))) AS max_drift_min,
            SUM(corrected) AS corrections,
            SUM(status = 'anomaly') AS anomaly_days,
            MAX(CASE WHEN status = 'trusted' THEN local_date END) AS last_accurate_day,
            COUNT(*) AS tracked_days
       FROM device_clock_health
      WHERE school_id = ? AND local_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY device_sn`,
    [schoolId],
  )) as any[];
  const baselines = (await query(
    `SELECT device_sn, median_first_minute, mad_minutes, sample_days FROM attendance_time_baselines WHERE school_id = ?`,
    [schoolId],
  )) as any[];
  const corrections = (await query(
    `SELECT c.id, c.device_sn, c.local_date, c.shift_minutes, c.affected_rows, c.source, c.applied_at, c.undone_at,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.username) AS applied_by_name
       FROM attendance_time_corrections c LEFT JOIN users u ON u.id = c.applied_by
      WHERE c.school_id = ? ORDER BY c.id DESC LIMIT 20`,
    [schoolId],
  )) as any[];
  return { today, history, baselines, corrections, policy: policy.policy };
}
