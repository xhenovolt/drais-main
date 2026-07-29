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

/** Mirror of device-clock's policy union (imported as a type only, to keep this
 *  module pure and free of the db-backed device-clock runtime). */
export type TimePolicyKind = 'TRUST_DEVICE_TIME' | 'CORRECT_BY_DRIFT' | 'MANUAL_REVIEW_IF_DRIFT';

export interface Assessment {
  confidence: number;                 // 0..100 — how believable the batch times are
  status: DriftStatus;
  offsetEstimateMin: number;          // signed; +ve = device AHEAD of reality
  likelyCause: string;
  detail: string;
  recommendedShiftMin: number;        // apply to punch_at (usually -offset)
  driftConfidence: number;            // 0..100 — how sure we are it IS drift (for the warning copy)
  // ── policy-aware layer (set by applyPolicy) ──
  rawDriftMin?: number;               // the DEVICE clock's own drift (from ingest skew), signed
  residualDriftMin?: number;          // drift still present in the stored (corrected) punch_at
  resolvedByPolicy?: boolean;         // a real device drift that the policy already realigned
  policy?: TimePolicyKind;            // the active time policy this verdict was read against
}

/** PURE: reinterpret a raw (punch_at-only) assessment in light of the school's
 *  time policy and the device's own clock drift.
 *
 *  The base `assessBatch` verdict only sees `punch_at` (the stored, possibly
 *  already-corrected instant). On its own it cannot tell:
 *    • whether CORRECT_BY_DRIFT already resolved a real device drift, or
 *    • that under TRUST_DEVICE_TIME the drift is kept ON PURPOSE.
 *  This layer adds the device's raw drift + the policy and produces a verdict
 *  that reflects what actually happened — no more "device wrong → shift it"
 *  nags for drift the policy already handled or is meant to keep.
 */
export function applyPolicy(
  base: Assessment,
  ctx: { policy: TimePolicyKind; rawDriftMin: number; maxDriftMin: number },
): Assessment {
  const rawMin = Math.round(ctx.rawDriftMin);
  const residualMin = base.offsetEstimateMin;               // 0 when the stored times are believable
  const sig = Math.max(10, Math.round(ctx.maxDriftMin));    // "significant" device drift, floored at 10 min
  const out: Assessment = {
    ...base, rawDriftMin: rawMin, residualDriftMin: residualMin, policy: ctx.policy, resolvedByPolicy: false,
  };

  // Hard, policy-independent failures (dead RTC, future stamps) and the
  // still-learning / empty states stand exactly as assessed.
  if (['rtc_failure', 'future_timestamps', 'insufficient_history', 'no_punches'].includes(base.likelyCause)) {
    return out;
  }

  const rawSignificant = Math.abs(rawMin) >= sig;
  const residualClean = base.status === 'trusted';          // stored times sit within the school's own spread

  if (ctx.policy === 'CORRECT_BY_DRIFT') {
    if (rawSignificant && residualClean) {
      // The previously-invisible good news: the device was off, the policy fixed it.
      return {
        ...out, status: 'trusted', confidence: Math.max(base.confidence, 90),
        likelyCause: 'auto_resolved', resolvedByPolicy: true, recommendedShiftMin: 0, driftConfidence: 0,
        detail: `The device clock was off by about ${fmtDrift(rawMin)}, but auto-correction (Correct by drift) already realigned these punches — no action needed.`,
      };
    }
    if (!residualClean) {
      // Auto-correction ran but did not fully land — point at the real remedy.
      return {
        ...out, likelyCause: 'auto_correct_incomplete',
        detail: `Auto-correction ran but about ${fmtDrift(residualMin)} still remains in the stored times — the device's known offset is stale. Enable device auto-sync, or correct this batch.`,
      };
    }
    return out; // device clean + stored clean → ordinary trusted
  }

  if (ctx.policy === 'TRUST_DEVICE_TIME') {
    if (rawSignificant || !residualClean) {
      // Drift is retained by design — inform, don't nag; no manual shift.
      return {
        ...out, status: base.status === 'anomaly' ? 'review' : base.status,
        likelyCause: 'trusted_by_policy', recommendedShiftMin: 0,
        detail: `The device clock looks off by about ${fmtDrift(rawMin || residualMin)}, but this school's policy is “trust device time”, so punches are kept as-is by design. Switch to “Correct by drift” if you want DRAIS to auto-correct.`,
      };
    }
    return out;
  }

  // MANUAL_REVIEW_IF_DRIFT
  if (rawSignificant || !residualClean) {
    return {
      ...out, status: 'review', likelyCause: 'manual_review_flagged',
      detail: `Drift of about ${fmtDrift(residualMin || rawMin)} detected; this school's policy is manual review, so the times are kept pending your decision. Review & correct if they are wrong.`,
    };
  }
  return out;
}

/** Human drift size: whole-hour when it snaps to hours, else minutes. */
function fmtDrift(min: number): string {
  const a = Math.abs(min);
  if (a >= 55 && Math.abs(a - Math.round(a / 60) * 60) <= 12) return `${Math.round(a / 60)}h`;
  return `${a} min`;
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
  // Cap the MAD-derived spread at MAX_TOLERANCE_MIN. A baseline learned over a
  // window that included genuine clock-drift days (before this engine
  // existed, or before a device's fault was caught) can carry an inflated
  // mad_minutes — the drift itself gets absorbed into "normal", which is
  // precisely how a live incident scored a 3h+ deviation as 92%/"resolved":
  // the tolerance band had already widened to cover it. learnBaseline() now
  // also excludes days flagged 'anomaly' going forward, but this cap is the
  // backstop for baselines computed before that existed, or for any residual
  // contamination — "normal" can never legitimately mean "anywhere from
  // midnight to 11am".
  const MAX_TOLERANCE_MIN = 90;
  const cappedMad = Math.min(baseline.mad_minutes || 10, MAX_TOLERANCE_MIN);
  const tolerance = Math.min(MAX_TOLERANCE_MIN, Math.max(20, 3 * cappedMad));

  // Normal day: first arrival within the school's own historical spread.
  if (absd <= tolerance) {
    const conf = absd <= Math.max(10, cappedMad) ? 99 : 92;
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
