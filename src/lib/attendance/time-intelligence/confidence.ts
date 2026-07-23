/**
 * Time Confidence Engine — PURE, deterministic, fully unit-testable.
 *
 * Given a school's learned behavioural baseline and today's batch statistics,
 * decide whether the reported timestamps are believable, estimate the drift,
 * name the likely cause, and recommend a correction. No hardcoded school
 * times — everything derives from the baseline. No ML — behavioural
 * statistics are sufficient and explainable.
 */

export interface Baseline {
  median_first_minute: number;   // minute-of-day (school-local) staff/learners usually first punch
  mad_minutes: number;           // spread of that first-arrival minute
  p10_first_minute?: number | null;
  p90_first_minute?: number | null;
  earliest_minute?: number | null;
  median_daily_punches?: number | null;
  sample_days: number;
}

export interface BatchStats {
  firstArrivalMinute: number | null;  // minute-of-day of today's first credible punch
  punchCount: number;
  futureCount: number;                // punches ahead of "now" at ingest
  maxFutureMinutes: number;           // how far ahead the worst one is
  nearMidnightCount: number;          // punches 00:00–03:00 local
  yearOutOfRange: boolean;            // any punch year < 2020 or > now+1 (RTC failure)
  outOfOrderCount: number;            // punch order inverted vs ingest order
}

export type DriftStatus = 'trusted' | 'review' | 'anomaly';

export interface Assessment {
  confidence: number;                 // 0..100 — how believable the batch times are
  status: DriftStatus;
  offsetEstimateMin: number;          // signed; +ve = device AHEAD of reality
  likelyCause: string;
  detail: string;
  recommendedShiftMin: number;        // apply to punch_at (usually -offset)
  driftConfidence: number;            // 0..100 — how sure we are it IS drift (for the warning copy)
}

/* ── stats helpers (exported for baseline computation + tests) ─────────── */

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function mad(xs: number[]): number {
  if (!xs.length) return NaN;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
}

export const fmtMinute = (m: number | null | undefined): string => {
  if (m == null || !Number.isFinite(m)) return '—';
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
};

/* ── the assessment ────────────────────────────────────────────────────── */

export function assessBatch(baseline: Baseline | null, batch: BatchStats): Assessment {
  // Hard failures first — these override everything.
  if (batch.yearOutOfRange) {
    return verdict(2, 'anomaly', 0, 'rtc_failure',
      'Timestamps outside any plausible year — device RTC battery has likely failed. Sync the device clock, then correct the batch.', 0, 97);
  }
  if (batch.punchCount > 0 && batch.futureCount / batch.punchCount > 0.3 && batch.maxFutureMinutes > 30) {
    const off = batch.maxFutureMinutes;
    return verdict(5, 'anomaly', off, 'future_timestamps',
      `${batch.futureCount} punches are stamped up to ${Math.round(off / 60 * 10) / 10}h in the future — the device clock is running fast.`,
      -snapToHour(off), 95);
  }

  if (!baseline || baseline.sample_days < 5 || baseline.median_first_minute == null) {
    return verdict(70, 'review', 0, 'insufficient_history',
      `Only ${baseline?.sample_days ?? 0} baseline days — DRAIS is still learning this school's attendance fingerprint.`, 0, 0);
  }
  if (batch.firstArrivalMinute == null || batch.punchCount === 0) {
    return verdict(70, 'review', 0, 'no_punches', 'No punches in this batch yet.', 0, 0);
  }

  const diff = batch.firstArrivalMinute - baseline.median_first_minute; // +ve = later than usual
  const absd = Math.abs(diff);
  const tolerance = Math.max(20, 3 * (baseline.mad_minutes || 10));

  // Normal day: first arrival within the school's own historical spread.
  if (absd <= tolerance) {
    const conf = absd <= Math.max(10, baseline.mad_minutes || 10) ? 99 : 92;
    return verdict(conf, 'trusted', 0, 'normal',
      `First arrival ${fmtMinute(batch.firstArrivalMinute)} vs usual ${fmtMinute(baseline.median_first_minute)} (±${tolerance} min tolerance).`, 0, 0);
  }

  // Out of tolerance — classify the drift shape.
  const hourSnap = snapToHour(absd);
  const isHourMultiple = hourSnap > 0 && Math.abs(absd - hourSnap) <= 12; // minutes preserved
  const sign = Math.sign(diff);

  // A midnight cluster where this school never punches is a stronger signal
  // than an hour-shaped offset — check it FIRST (a rollover often looks like
  // a whole-hour shift by coincidence).
  if (batch.nearMidnightCount / batch.punchCount > 0.4 && baseline.median_first_minute > 240) {
    return verdict(10, 'anomaly', diff, 'midnight_rollover',
      `${batch.nearMidnightCount} punches near midnight where this school never punches — likely a date rollover / clock reset on the device.`,
      -diff, 85);
  }

  if (isHourMultiple) {
    // Whole-hour shift with minutes intact → clock set wrong hours or a
    // timezone mis-configuration on the device (indistinguishable from data;
    // both take the same correction). NEVER host-TZ dependent.
    const hours = hourSnap / 60;
    const cause = hours <= 3 ? 'timezone_mismatch_or_drift' : 'clock_drift_hours';
    const driftConf = Math.min(98, 80 + Math.min(18, baseline.sample_days));
    return verdict(
      Math.max(2, 20 - hours * 3), 'anomaly', sign * hourSnap, cause,
      `Entire batch appears shifted ${sign > 0 ? '+' : '−'}${hours}h: first arrival ${fmtMinute(batch.firstArrivalMinute)} vs usual ${fmtMinute(baseline.median_first_minute)} — minutes preserved, so the device clock is off by whole hours.`,
      -sign * hourSnap, driftConf,
    );
  }

  // Non-hour offset beyond tolerance: minute-level drift (fast/slow clock).
  const conf = absd > 180 ? 8 : absd > 60 ? 25 : 55;
  const status: DriftStatus = absd > 60 ? 'anomaly' : 'review';
  return verdict(conf, status, diff, diff > 0 ? 'clock_running_fast' : 'clock_running_slow',
    `First arrival ${fmtMinute(batch.firstArrivalMinute)} differs from usual ${fmtMinute(baseline.median_first_minute)} by ${sign > 0 ? '+' : '−'}${absd} min — outside the ±${tolerance} min tolerance.`,
    -diff, Math.min(90, 40 + absd / 4));
}

function snapToHour(mins: number): number {
  return Math.round(mins / 60) * 60;
}

function verdict(
  confidence: number, status: DriftStatus, offsetEstimateMin: number,
  likelyCause: string, detail: string, recommendedShiftMin: number, driftConfidence: number,
): Assessment {
  return { confidence, status, offsetEstimateMin, likelyCause, detail, recommendedShiftMin, driftConfidence };
}
