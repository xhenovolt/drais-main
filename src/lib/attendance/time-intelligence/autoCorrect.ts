/**
 * Automatic post-batch clock-drift correction.
 * ────────────────────────────────────────────
 * WHY THIS EXISTS
 * JIPRA's device (GED7254601154) keeps a wrong clock and lives offline: staff
 * connect it when they want to upload the day's logs and print. Every day for
 * three weeks somebody opened Time Health and shifted the day by hand —
 * 8 separate days corrected by exactly −5h (855 punches), plus small mop-ups
 * for stragglers. That is the founder-dependence loop this module closes:
 * once the batch has finished arriving, DRAIS works out the same number and
 * applies it itself.
 *
 * WHAT IT DOES NOT DO
 * It does not hardcode −5h. It does not push a clock to the device (that
 * device is offline almost always, so a sync command would rarely land, and
 * the school has not asked DRAIS to touch their hardware). And it never
 * corrects a day a human already corrected.
 *
 * ── THE TWO SIGNALS ──────────────────────────────────────────────────────
 *
 * 1. FUTURE OVERSHOOT — the hard evidence, and it needs no baseline.
 *    A device physically cannot record a punch that has not happened yet. So
 *    if the newest punch in a batch reads 22:37 while the batch arrives at
 *    17:44, the clock is AT LEAST 4h53m fast. This is measured against the
 *    server clock, which is authoritative, and it is immune to the problem
 *    that sank the obvious approach: JIPRA's own attendance history is mostly
 *    drifted, so a baseline learned from it treats 13:00 as a normal first
 *    arrival and would "correct" the good days into the bad ones.
 *
 *    It is a LOWER bound. People punch right up to the moment the device is
 *    connected, so in practice it is tight — but it can under-read if nobody
 *    punched near connection time, which is why it is corroborated by:
 *
 * 2. THE OPERATOR'S OWN HISTORY — a human-confirmed prior.
 *    Every manual correction is recorded in attendance_time_corrections with
 *    the shift, the row count, and whether it was later undone. Those are
 *    verified answers from someone who could see the real times. The modal
 *    shift, weighted by rows and excluding undone ones, is the prior. For
 *    JIPRA that is −300 minutes.
 *
 * A candidate drift is accepted when the two agree. Where they disagree the
 * measured overshoot wins (it is evidence, not memory) but confidence drops,
 * and below the threshold nothing is applied and the day is flagged instead.
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────
 * • Idempotent. Correction goes through applyRecomputeFromDeviceTime, which
 *   recomputes punch_at from device_reported_time rather than adding a shift,
 *   so running twice cannot double-subtract (10:21 → 05:21 → 05:21).
 * • Raw evidence untouched. device_reported_time is never written.
 * • Reversible. Originals are snapshotted into attendance_time_corrections
 *   and undoCorrection() restores them.
 * • Never fights a human. A day carrying any non-auto correction is skipped.
 * • Self-cancelling. When the device is repaired the overshoot goes to zero,
 *   no correction is applied, and the prior stops being consulted — so the
 *   day the clock is fixed is the day DRAIS stops shifting.
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { applyRecomputeFromDeviceTime } from './engine';

/** A batch is "settled" once nothing new has arrived for this long. */
export const QUIET_MINUTES = 10;

/** Below this, treat the clock as correct and do nothing. */
export const DEADBAND_MINUTES = 20;

/** Correction granularity — operators shift in clean steps, so should we. */
const STEP_MINUTES = 15;

/** Minimum punches before a day is worth judging at all. */
const MIN_PUNCHES = 8;

/** Confidence needed to write to attendance without a human. */
export const AUTO_APPLY_CONFIDENCE = 75;

export interface DriftFinding {
  schoolId: number;
  deviceSn: string;
  localDate: string;
  punches: number;
  /** Hours the device clock is AHEAD of real time. + = fast. */
  driftHours: number;
  /** Hard lower bound from the newest punch vs. when the batch arrived. */
  overshootHours: number;
  /** Modal shift this operator has applied before, in hours (+ = fast). */
  priorHours: number | null;
  priorDays: number;
  confidence: number;
  verdict: 'clock_ok' | 'drift_detected' | 'insufficient_evidence' | 'already_corrected' | 'not_settled';
  reason: string;
}

/* ── Signal 2: what the operator has confirmed before ─────────────────── */

/**
 * The device's learned drift prior, from corrections a human applied and did
 * NOT undo. Weighted by affected rows so a 250-row correction outranks a
 * 2-row mop-up, and bucketed to STEP_MINUTES so near-identical shifts
 * reinforce instead of splitting the vote.
 */
export async function learnDriftPrior(
  schoolId: number, deviceSn: string,
): Promise<{ priorHours: number | null; days: number }> {
  const rows = (await query(
    `SELECT shift_minutes, affected_rows, local_date
       FROM attendance_time_corrections
      WHERE school_id = ? AND device_sn = ? AND undone_at IS NULL
        AND source <> 'auto'
        AND local_date >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)`,
    [schoolId, deviceSn],
  ).catch(() => [])) as any[];
  if (!rows.length) return { priorHours: null, days: 0 };

  const votes = new Map<number, { weight: number; days: Set<string> }>();
  for (const r of rows) {
    // A correction of −300 min means "the device was 300 min FAST".
    const driftMin = -Number(r.shift_minutes);
    if (!Number.isFinite(driftMin) || Math.abs(driftMin) < DEADBAND_MINUTES) continue;
    const bucket = Math.round(driftMin / STEP_MINUTES) * STEP_MINUTES;
    const v = votes.get(bucket) ?? { weight: 0, days: new Set<string>() };
    v.weight += Math.max(1, Number(r.affected_rows) || 1);
    v.days.add(String(r.local_date).slice(0, 10));
    votes.set(bucket, v);
  }
  if (!votes.size) return { priorHours: null, days: 0 };

  let best: [number, { weight: number; days: Set<string> }] | null = null;
  for (const entry of votes) if (!best || entry[1].weight > best[1].weight) best = entry;
  return { priorHours: best![0] / 60, days: best![1].days.size };
}

/* ── Signal 1: the device cannot record the future ────────────────────── */

/**
 * Measures the day's batch. Returns the overshoot (hours the newest punch
 * sits beyond the moment it was received) plus the punch count.
 *
 * Rows are selected by `ingested_at`, never by `punch_at` — a badly drifted
 * punch_at may not even fall on the right day, which is exactly the state we
 * are trying to repair.
 */
async function measureBatch(schoolId: number, deviceSn: string, localDate: string, offsetMin: number) {
  const utcStart = new Date(Date.parse(`${localDate}T00:00:00Z`) - offsetMin * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);

  const rows = (await query(
    `SELECT COUNT(*)                          AS punches,
            MAX(device_reported_time)         AS newest_device_wall,
            MAX(ingested_at)                  AS last_ingest,
            MIN(device_reported_time)         AS oldest_device_wall
       FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ?
        AND ingested_at >= ? AND ingested_at < ?
        AND device_reported_time IS NOT NULL`,
    [schoolId, deviceSn, utcStart, utcEnd],
  ).catch(() => [])) as any[];

  const r = rows[0];
  const punches = Number(r?.punches ?? 0);
  if (!punches || !r?.newest_device_wall || !r?.last_ingest) {
    return { punches, overshootHours: 0, lastIngestMs: 0, spanHours: 0 };
  }

  // device_reported_time is the device's LOCAL wall clock stored as a naive
  // datetime; convert to a real instant the same way ingest does.
  const newestDeviceInstant = new Date(r.newest_device_wall).getTime() - offsetMin * 60_000;
  const oldestDeviceInstant = new Date(r.oldest_device_wall).getTime() - offsetMin * 60_000;
  const lastIngestMs = new Date(r.last_ingest).getTime();

  return {
    punches,
    overshootHours: (newestDeviceInstant - lastIngestMs) / 3_600_000,
    lastIngestMs,
    spanHours: (newestDeviceInstant - oldestDeviceInstant) / 3_600_000,
  };
}

/* ── Signal 3: what time this school actually opens ───────────────────── */

const medianOf = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Median minute-of-day of each person's FIRST device-reported punch. Uses
 *  device_reported_time, which corrections never touch, so it is stable
 *  whether or not the day has been repaired. */
async function firstArrivalMedian(schoolId: number, deviceSn: string, localDate: string, offsetMin: number) {
  const utcStart = new Date(Date.parse(`${localDate}T00:00:00Z`) - offsetMin * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);
  const rows = (await query(
    `SELECT MIN(HOUR(device_reported_time) * 60 + MINUTE(device_reported_time)) AS m
       FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND ingested_at >= ? AND ingested_at < ?
        AND device_reported_time IS NOT NULL
      GROUP BY person_id, role_type`,
    [schoolId, deviceSn, utcStart, utcEnd],
  ).catch(() => [])) as any[];
  return medianOf(rows.map((r: any) => Number(r.m)).filter(Number.isFinite));
}

/**
 * The school's REAL opening, in minutes past midnight.
 *
 * This is the piece that makes the whole thing safe. A baseline learned
 * straight from JIPRA's history is useless — most days are drifted, so the
 * history says the median person first appears at 13:00 and a correct day
 * looks like the anomaly. But on days where the future-overshoot PROVED the
 * drift, subtracting that proven drift from the day's observed first-arrival
 * median yields the true opening. Median those, and the school's real opening
 * emerges from evidence rather than assumption.
 *
 * Returns null when there is not enough proven-drift history yet, in which
 * case the caller must not guess.
 */
export async function calibrateTrueOpening(
  schoolId: number, deviceSn: string, offsetMin: number,
): Promise<{ openingMinute: number | null; fromDays: number }> {
  const days = (await query(
    `SELECT DISTINCT DATE(ingested_at) AS d FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND ingested_at >= DATE_SUB(CURDATE(), INTERVAL 45 DAY)`,
    [schoolId, deviceSn],
  ).catch(() => [])) as any[];

  const opens: number[] = [];
  for (const row of days) {
    const d = new Date(row.d).toISOString().slice(0, 10);
    const batch = await measureBatch(schoolId, deviceSn, d, offsetMin);
    if (batch.punches < MIN_PUNCHES) continue;
    // Only days whose drift was independently proven by the overshoot.
    if (batch.overshootHours * 60 < DEADBAND_MINUTES) continue;
    const med = await firstArrivalMedian(schoolId, deviceSn, d, offsetMin);
    if (med == null) continue;
    opens.push(med - batch.overshootHours * 60);
  }
  if (opens.length < 3) return { openingMinute: null, fromDays: opens.length };
  return { openingMinute: Math.round(medianOf(opens)!), fromDays: opens.length };
}

/* ── Combine ──────────────────────────────────────────────────────────── */

export async function detectDailyDrift(
  schoolId: number, deviceSn: string, localDate: string, nowMs = Date.now(),
): Promise<DriftFinding> {
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;

  const base: Omit<DriftFinding, 'verdict' | 'reason' | 'confidence' | 'driftHours'> & Record<string, any> = {
    schoolId, deviceSn, localDate, punches: 0, overshootHours: 0, priorHours: null, priorDays: 0,
  };

  // Never touch a day a person has already judged.
  const existing = (await query(
    `SELECT source FROM attendance_time_corrections
      WHERE school_id = ? AND device_sn = ? AND local_date = ? AND undone_at IS NULL`,
    [schoolId, deviceSn, localDate],
  ).catch(() => [])) as any[];
  if (existing.length) {
    const byHuman = existing.some((e: any) => String(e.source) !== 'auto');
    return {
      ...base, driftHours: 0, confidence: 100, verdict: 'already_corrected',
      reason: byHuman
        ? 'A person already corrected this day — leaving it alone.'
        : 'DRAIS already corrected this day.',
    } as DriftFinding;
  }

  const batch = await measureBatch(schoolId, deviceSn, localDate, off);
  base.punches = batch.punches;
  base.overshootHours = Number(batch.overshootHours.toFixed(3));

  if (batch.punches < MIN_PUNCHES) {
    return { ...base, driftHours: 0, confidence: 0, verdict: 'insufficient_evidence',
      reason: `Only ${batch.punches} punch(es) — too few to judge a clock.` } as DriftFinding;
  }

  // Has the upload finished? Correcting mid-upload would leave the tail of the
  // batch uncorrected and the day half-right, which is worse than waiting.
  const quietMinutes = (nowMs - batch.lastIngestMs) / 60_000;
  if (quietMinutes < QUIET_MINUTES) {
    return { ...base, driftHours: 0, confidence: 0, verdict: 'not_settled',
      reason: `Still receiving — last punch arrived ${Math.round(quietMinutes)} min ago.` } as DriftFinding;
  }

  const { priorHours, days: priorDays } = await learnDriftPrior(schoolId, deviceSn);
  base.priorHours = priorHours;
  base.priorDays = priorDays;

  // The measured lower bound, snapped to the operator's granularity.
  const snap = (h: number) => Math.round((h * 60) / STEP_MINUTES) * STEP_MINUTES / 60;
  const measured = snap(batch.overshootHours);

  // Nothing arrived stamped in the future. That is either a healthy clock or
  // a drifted one uploaded so late that even the shifted times had already
  // passed — the two are indistinguishable from the overshoot alone.
  // Measured on 10 Aug: overshoot read −0.79h while the day was in fact 5h
  // out, and treating that as healthy would have silently left it wrong.
  // So cross-check the day's shape against the school's calibrated opening.
  if (batch.overshootHours * 60 < DEADBAND_MINUTES) {
    const { openingMinute, fromDays } = await calibrateTrueOpening(schoolId, deviceSn, off);
    const med = await firstArrivalMedian(schoolId, deviceSn, localDate, off);

    if (openingMinute == null || med == null) {
      return { ...base, driftHours: 0, confidence: 60, verdict: 'clock_ok',
        reason: 'No punch arrived stamped in the future — the device clock reads correctly.' } as DriftFinding;
    }

    const impliedHours = (med - openingMinute) / 60;
    const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

    if (Math.abs(impliedHours) * 60 < DEADBAND_MINUTES) {
      // THE SELF-CANCEL. Clock reads true and the day looks like a school day,
      // so no shift is applied and the prior is deliberately ignored. The day
      // the device is repaired is the day DRAIS stops correcting.
      return { ...base, driftHours: 0, confidence: 95, verdict: 'clock_ok',
        reason: `Clock reads correctly and first arrivals cluster at ${hh(med)}, matching this school's usual ${hh(openingMinute)}.` } as DriftFinding;
    }

    // Looks shifted but cannot be measured — never guess silently on money-
    // grade data. Flag it for a person instead.
    return { ...base, driftHours: Number(impliedHours.toFixed(3)), confidence: 55,
      verdict: 'insufficient_evidence',
      reason: `Nothing arrived stamped in the future, but first arrivals cluster at ${hh(med)} against this school's usual ${hh(openingMinute)} (from ${fromDays} proven days) — about ${impliedHours.toFixed(1)}h out. The device was likely connected too late to measure the clock directly; please review.` } as DriftFinding;
  }

  // Corroborate. Agreement with what a human previously confirmed for this
  // same device is the strongest signal available; disagreement is not fatal
  // but must cost confidence, because the overshoot is only a lower bound.
  let confidence = 55;
  let drift = measured;
  let reason = `Newest punch was stamped ${batch.overshootHours.toFixed(2)}h after it arrived — impossible unless the clock is fast.`;

  if (priorHours != null) {
    const gapMin = Math.abs(priorHours - measured) * 60;
    if (gapMin <= STEP_MINUTES) {
      // Measurement and history agree — take the prior's cleaner number.
      drift = priorHours;
      confidence = 95;
      reason += ` Matches the ${priorHours}h drift corrected by hand on ${priorDays} previous day(s).`;
    } else if (priorHours > measured && gapMin <= 90) {
      // THE OVERSHOOT IS A LOWER BOUND — it can only ever UNDER-state the
      // drift, because it depends on somebody punching close to the moment
      // the device was connected. When the operator's confirmed history says
      // the clock is further ahead than we could measure, history is the
      // better number. Measured on 11 Aug: overshoot read 3.90h because the
      // last punch was an hour before connection, while the true drift was
      // the usual 5h. Taking the measured value there would have left every
      // punch an hour wrong.
      drift = priorHours;
      confidence = 85;
      reason += ` Under-measured (nobody punched near connection time); using the ${priorHours}h drift corrected by hand on ${priorDays} previous day(s).`;
    } else if (gapMin <= 60) {
      confidence = 82;
      reason += ` Close to the ${priorHours}h drift corrected by hand on ${priorDays} previous day(s).`;
    } else {
      confidence = 60;
      reason += ` Differs from the ${priorHours}h usually corrected by hand — using the measured value.`;
    }
  } else {
    // No manual history to lean on — either a new device, or (eventually)
    // JIPRA's own corrections aged past the 60-day window. Without a second
    // opinion this used to score 70, just under the auto-apply bar, so the
    // whole thing would have quietly stopped working about two months from
    // now with nobody able to say why. Corroborate against the school's
    // calibrated opening instead: if shifting by the measured drift lands
    // first arrivals where this school actually starts, that is independent
    // confirmation and needs no memory of past corrections at all.
    const { openingMinute, fromDays } = await calibrateTrueOpening(schoolId, deviceSn, off);
    const med = await firstArrivalMedian(schoolId, deviceSn, localDate, off);
    const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

    if (openingMinute != null && med != null) {
      const landsAt = med - measured * 60;
      const missMin = Math.abs(landsAt - openingMinute);
      if (missMin <= 45) {
        confidence = 92;
        reason += ` Shifting by ${measured}h puts first arrivals at ${hh(landsAt)}, matching this school's usual ${hh(openingMinute)} (from ${fromDays} proven days).`;
      } else {
        confidence = 65;
        reason += ` Shifting by ${measured}h would put first arrivals at ${hh(landsAt)}, away from this school's usual ${hh(openingMinute)} — worth a look.`;
      }
    } else {
      confidence = 70;
      reason += ' No previous correction and no established opening time for this device to compare against.';
    }
  }

  // More punches, more confidence — a handful could be a coincidence.
  if (batch.punches >= 40) confidence = Math.min(99, confidence + 4);
  if (batch.punches < 15) confidence -= 10;

  return {
    ...base,
    driftHours: Number(drift.toFixed(3)),
    confidence: Math.max(0, Math.min(99, Math.round(confidence))),
    verdict: 'drift_detected',
    reason,
  } as DriftFinding;
}

/* ── Act ──────────────────────────────────────────────────────────────── */

export interface AutoCorrectResult extends DriftFinding {
  applied: boolean;
  correctionId?: number;
  affected?: number;
}

/**
 * Detect and, when the evidence is strong enough, correct — recording it as
 * source 'auto' so it is distinguishable from a human's work and undoable in
 * exactly the same way.
 */
export async function autoCorrectDay(
  schoolId: number, deviceSn: string, localDate: string,
  opts: { dryRun?: boolean; nowMs?: number } = {},
): Promise<AutoCorrectResult> {
  const finding = await detectDailyDrift(schoolId, deviceSn, localDate, opts.nowMs);

  if (finding.verdict !== 'drift_detected' || finding.confidence < AUTO_APPLY_CONFIDENCE) {
    return { ...finding, applied: false };
  }
  if (opts.dryRun) return { ...finding, applied: false };

  const res = await applyRecomputeFromDeviceTime(
    schoolId, deviceSn, localDate, finding.driftHours, null, 'auto',
  );

  return { ...finding, applied: res.affected > 0, correctionId: res.correctionId, affected: res.affected };
}

/**
 * Every device that received punches for `localDate` and has since gone quiet.
 * This is the "the batch has finished" test: the school connects the device,
 * it uploads, it stops. Selected by ingest time, so a device whose punch_at is
 * wildly wrong is still found.
 */
export async function settledDevices(
  localDate: string, nowMs = Date.now(),
): Promise<Array<{ schoolId: number; deviceSn: string; punches: number; quietMinutes: number }>> {
  const rows = (await query(
    `SELECT re.school_id, re.device_sn, COUNT(*) AS punches, MAX(re.ingested_at) AS last_ingest
       FROM attendance_raw_events re
      WHERE re.ingested_at >= DATE_SUB(?, INTERVAL 2 DAY)
        AND re.device_reported_time IS NOT NULL
      GROUP BY re.school_id, re.device_sn`,
    [`${localDate} 23:59:59`],
  ).catch(() => [])) as any[];

  return rows
    .map((r: any) => ({
      schoolId: Number(r.school_id),
      deviceSn: String(r.device_sn),
      punches: Number(r.punches),
      quietMinutes: (nowMs - new Date(r.last_ingest).getTime()) / 60_000,
    }))
    .filter((d) => d.quietMinutes >= QUIET_MINUTES);
}
