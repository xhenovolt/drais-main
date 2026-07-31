/**
 * First Arrival Health — per-school resilience layer for date-rollover
 * anomalies (Report Engine's sibling: the Attendance Intelligence Engine).
 *
 * Foundational rule, non-negotiable: attendance records are IMMUTABLE. This
 * module may analyze / infer / estimate / score / recommend — it must NEVER
 * write to attendance_raw_events, and never auto-triggers the existing
 * correction flow (previewCorrection/applyCorrection in engine.ts). Any real
 * fix is still a human decision, made through that existing, audited,
 * undoable mechanism. This module's own writes are confined to its two own
 * tables (attendance_first_arrival_anchors, attendance_first_arrival_health)
 * — pure cache/verdict storage, never source-of-truth attendance data.
 *
 * Concept: a school's historically-earliest, most-consistent arrivers (the
 * "anchor cohort" — bounded to ~15-30 people, not the whole school) form a
 * statistical fingerprint of "what a normal morning looks like". Every day,
 * DRAIS checks whether that cohort actually shows up on time. When today's
 * observed first arrivals look suspicious — clustered right around the
 * midnight boundary instead of the cohort's usual early-morning time — a
 * PURE, read-only simulation asks "what if these belonged to the other
 * calendar day?" and reports the comparison as evidence, never as an
 * automatic correction.
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { ensureFirstArrivalSchema } from './schema';
import { median, mad, fmtMinute } from './confidence';
import { minuteOfDay, localDateStr, firstArrivalOf, sweepToday } from './engine';

const MIN_SAMPLE_DAYS = 10;     // fewer days of history isn't enough to trust "usual" for a person
const COHORT_SIZE = 20;         // bounded anchor population, not the whole school
const STALE_MS = 24 * 60 * 60 * 1000;

export interface AnchorCandidate {
  person_id: number;
  role_type: string | null;
  display_name: string | null;
  median_arrival_minute: number;
  mad_minutes: number;
  sample_days: number;
}

/**
 * Rank candidates by "earliness score" = median + 2*MAD (ascending — earlier
 * AND more consistent wins; the 2x weight on spread means a wildly variable
 * early riser ranks behind someone reliably 20 minutes later, since a
 * reliable anchor is more useful than a lucky-early one for this purpose).
 * One aggregate query (MIN per person-day, grouped in SQL, offset-shifted to
 * school-local time) — no N+1 regardless of school size.
 */
export async function rankEarlyArrivers(schoolId: number, windowDays = 120): Promise<AnchorCandidate[]> {
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const rows = (await query(
    `SELECT person_id, MAX(role_type) AS role_type, MAX(display_name) AS display_name,
            DATE(DATE_ADD(punch_at, INTERVAL ? MINUTE)) AS local_date,
            MIN(TIME_TO_SEC(DATE_ADD(punch_at, INTERVAL ? MINUTE)) / 60) AS day_first_minute
       FROM attendance_raw_events
      WHERE school_id = ? AND role_type IN ('student', 'staff')
        AND punch_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY person_id, local_date`,
    [off, off, schoolId, windowDays],
  )) as Array<{ person_id: number; role_type: string; display_name: string | null; local_date: string; day_first_minute: number }>;

  const byPerson = new Map<number, { role_type: string | null; display_name: string | null; minutes: number[] }>();
  for (const r of rows) {
    const cur = byPerson.get(r.person_id) || { role_type: r.role_type, display_name: r.display_name, minutes: [] };
    cur.minutes.push(Math.round(Number(r.day_first_minute)));
    if (r.display_name) cur.display_name = r.display_name;
    byPerson.set(r.person_id, cur);
  }

  const candidates: AnchorCandidate[] = [];
  for (const [person_id, v] of byPerson) {
    if (v.minutes.length < MIN_SAMPLE_DAYS) continue;
    candidates.push({
      person_id, role_type: v.role_type, display_name: v.display_name,
      median_arrival_minute: Math.round(median(v.minutes)),
      mad_minutes: Math.round(mad(v.minutes)),
      sample_days: v.minutes.length,
    });
  }
  candidates.sort((a, b) => (a.median_arrival_minute + 2 * a.mad_minutes) - (b.median_arrival_minute + 2 * b.mad_minutes));
  return candidates;
}

/** The only function in this module allowed to write — and only to this
 *  module's own tables, never attendance_raw_events. */
export async function refreshAnchorCohort(schoolId: number, windowDays = 120, cohortSize = COHORT_SIZE): Promise<AnchorCandidate[]> {
  await ensureFirstArrivalSchema();
  const ranked = await rankEarlyArrivers(schoolId, windowDays);
  const anchors = ranked.slice(0, cohortSize);
  const anchorIds = new Set(anchors.map((a) => a.person_id));

  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i];
    await query(
      `INSERT INTO attendance_first_arrival_anchors
         (school_id, person_id, role_type, display_name, median_arrival_minute, mad_minutes,
          sample_days, window_days, earliness_rank, is_anchor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         role_type=VALUES(role_type), display_name=VALUES(display_name),
         median_arrival_minute=VALUES(median_arrival_minute), mad_minutes=VALUES(mad_minutes),
         sample_days=VALUES(sample_days), window_days=VALUES(window_days),
         earliness_rank=VALUES(earliness_rank), is_anchor=VALUES(is_anchor)`,
      [schoolId, c.person_id, c.role_type, c.display_name, c.median_arrival_minute, c.mad_minutes,
        c.sample_days, windowDays, i + 1, anchorIds.has(c.person_id) ? 1 : 0],
    );
  }
  return anchors;
}

/** Cached cohort, staleness-checked exactly like engine.ts's loadBaseline
 *  (24h). Returns null when stale/missing so the caller refreshes. */
export async function loadAnchorCohort(schoolId: number): Promise<AnchorCandidate[] | null> {
  await ensureFirstArrivalSchema();
  const rows = (await query(
    `SELECT person_id, role_type, display_name, median_arrival_minute, mad_minutes, sample_days, computed_at
       FROM attendance_first_arrival_anchors
      WHERE school_id = ? AND is_anchor = 1
      ORDER BY earliness_rank ASC`,
    [schoolId],
  )) as Array<AnchorCandidate & { computed_at: string | Date }>;
  if (!rows.length) return null;
  const newest = rows.reduce((max, r) => Math.max(max, new Date(r.computed_at).getTime()), 0);
  if (Date.now() - newest > STALE_MS) return null;
  return rows.map(({ person_id, role_type, display_name, median_arrival_minute, mad_minutes, sample_days }) =>
    ({ person_id, role_type, display_name, median_arrival_minute, mad_minutes, sample_days }));
}

async function getOrRefreshAnchorCohort(schoolId: number): Promise<AnchorCandidate[]> {
  const cached = await loadAnchorCohort(schoolId);
  if (cached) return cached;
  return refreshAnchorCohort(schoolId);
}

/* ── Hypothetical previous/next-day shift simulation (PURE — no DB) ────── */

export interface BoundaryPunch {
  id: number;
  person_id: number | null;
  minute: number;        // school-local minute-of-day
  local_date: string;    // YYYY-MM-DD as currently dated
}

export interface ShiftWorld {
  date: string;
  firstArrivalMinute: number | null;
  anchorsPresent: number;
}

export interface ShiftSimulation {
  candidatePunchIds: number[];
  currentWorld: ShiftWorld;
  shiftedWorld: ShiftWorld;
  confidenceCurrent: number;
  confidenceShifted: number;
  recommendation: 'investigate_shift' | 'no_action' | 'inconclusive';
}

const addDays = (dateStr: string, delta: number): string => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

/** How close to a comparison target counts as "matches" for a world's
 *  confidence score — same MAD-tolerance spirit as confidence.ts, capped. */
function worldConfidence(observed: number | null, anchorMedian: number, anchorMad: number): number {
  if (observed == null) return 0;
  const tolerance = Math.min(90, Math.max(20, anchorMad * 3));
  const diff = Math.abs(observed - anchorMedian);
  if (diff <= tolerance) return 95;
  if (diff <= tolerance * 2) return Math.max(10, 95 - Math.round((diff - tolerance) / tolerance * 60));
  return 5;
}

/**
 * PURE: given today's raw punches (plus the trailing edge of the adjacent
 * day's late punches, already fetched by the caller via a plain read-only
 * SELECT), test whether punches clustered right at the midnight boundary
 * make more sense as belonging to the OTHER calendar day. Never touches the
 * database — takes and returns plain in-memory data only, so it cannot
 * write regardless of caller mistakes.
 */
export function simulateBoundaryShift(
  punches: BoundaryPunch[],
  todayDate: string,
  anchorMedian: number,
  anchorMad: number,
  boundaryWindow: { lateEveningFromMinute: number; earlyMorningToMinute: number } = { lateEveningFromMinute: 23 * 60 + 30, earlyMorningToMinute: 2 * 60 },
): ShiftSimulation {
  const yesterday = addDays(todayDate, -1);

  // Boundary-clustered = very late previous-evening OR just-past-midnight —
  // the classic shape of a rollover/delayed-sync artifact, not a genuine
  // early arrival for `todayDate`.
  const isBoundary = (p: BoundaryPunch) =>
    (p.local_date === todayDate && p.minute <= boundaryWindow.earlyMorningToMinute) ||
    (p.local_date === yesterday && p.minute >= boundaryWindow.lateEveningFromMinute);

  const boundaryPunches = punches.filter(isBoundary);
  const candidatePunchIds = boundaryPunches.map((p) => p.id);

  // Current world: exactly as currently dated.
  const todayMinutesAsIs = punches.filter((p) => p.local_date === todayDate).map((p) => p.minute);
  const todayAnchorsAsIs = new Set(
    punches.filter((p) => p.local_date === todayDate && p.person_id != null).map((p) => p.person_id as number),
  );
  const currentWorld: ShiftWorld = {
    date: todayDate,
    firstArrivalMinute: firstArrivalOf(todayMinutesAsIs),
    anchorsPresent: todayAnchorsAsIs.size,
  };

  // Shifted world: every boundary punch reassigned to the OTHER day it's
  // closer to (yesterday's late punches stay late-yesterday conceptually —
  // they're excluded from "today"; today's just-past-midnight punches move
  // to count as yesterday's tail instead). What's left as "today" is
  // whatever wasn't part of the boundary cluster.
  const boundaryIds = new Set(candidatePunchIds);
  const todayMinutesShifted = punches
    .filter((p) => p.local_date === todayDate && !boundaryIds.has(p.id))
    .map((p) => p.minute);
  const todayAnchorsShifted = new Set(
    punches.filter((p) => p.local_date === todayDate && !boundaryIds.has(p.id) && p.person_id != null)
      .map((p) => p.person_id as number),
  );
  const shiftedWorld: ShiftWorld = {
    date: todayDate,
    firstArrivalMinute: firstArrivalOf(todayMinutesShifted),
    anchorsPresent: todayAnchorsShifted.size,
  };

  const confidenceCurrent = worldConfidence(currentWorld.firstArrivalMinute, anchorMedian, anchorMad);
  const confidenceShifted = shiftedWorld.firstArrivalMinute == null
    ? (boundaryPunches.length > 0 ? 60 : 0) // no other arrivals yet is plausible early in the day
    : worldConfidence(shiftedWorld.firstArrivalMinute, anchorMedian, anchorMad);

  let recommendation: ShiftSimulation['recommendation'] = 'inconclusive';
  if (!boundaryPunches.length) recommendation = 'no_action';
  else if (confidenceShifted > confidenceCurrent + 15) recommendation = 'investigate_shift';
  else if (confidenceCurrent >= confidenceShifted) recommendation = 'no_action';

  return { candidatePunchIds, currentWorld, shiftedWorld, confidenceCurrent, confidenceShifted, recommendation };
}

/* ── Orchestrator ────────────────────────────────────────────────────── */

export interface AnchorTodayRow {
  person_id: number;
  display_name: string | null;
  expectedMinute: number;
  observedMinute: number | null;
  present: boolean;
}

export interface EarliestPunchRow {
  id: number;
  person_id: number | null;
  display_name: string | null;
  device_sn: string | null;
  minute: number;
  punch_at: string; // ISO
}

export interface FirstArrivalHealthResult {
  status: 'trusted' | 'review' | 'anomaly';
  confidence: number;
  observedFirstArrivalMinute: number | null;
  anchorCohort: AnchorCandidate[];
  anchorsToday: AnchorTodayRow[];
  /** The actual raw punch records behind the verdict above — always
   *  populated when punches exist, regardless of status. Concrete
   *  evidence, not just a score: see this module's file header. */
  todaysEarliestPunches: EarliestPunchRow[];
  evidence: {
    daysAnalyzed: number;
    cohortSize: number;
    matchPct: number;
    missingCount: number;
    deviceClockStatus: Awaited<ReturnType<typeof sweepToday>>;
    lastSyncAt: string | null;
  };
  recommendation: string;
  shiftSimulation: ShiftSimulation | null;
}

/**
 * Per-school "First Arrival Health" — the always-visible daily indicator.
 * Read-only over attendance_raw_events; writes only to this module's own
 * cache table. Never calls previewCorrection/applyCorrection — any actual
 * fix stays a human decision through that existing, audited flow.
 */
export async function assessFirstArrivalHealth(schoolId: number): Promise<FirstArrivalHealthResult> {
  await ensureFirstArrivalSchema();
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const today = localDateStr(new Date(), off);

  const anchorCohort = await getOrRefreshAnchorCohort(schoolId);
  const anchorMedian = anchorCohort.length
    ? Math.round(median(anchorCohort.map((a) => a.median_arrival_minute))) : 0;
  const anchorMad = anchorCohort.length
    ? Math.round(median(anchorCohort.map((a) => a.mad_minutes))) : 30;

  // Fetch today's + yesterday's-late-tail punches for the anchor cohort AND
  // school-wide (for the true school-wide first arrival) in one read.
  // display_name/device_sn are carried through so the health card can show
  // the ACTUAL raw records behind its verdict — never just a bare score.
  const utcStart = new Date(Date.parse(`${addDays(today, -1)}T18:00:00Z`) - off * 60_000);
  const rows = (await query(
    `SELECT id, person_id, display_name, device_sn, punch_at FROM attendance_raw_events
      WHERE school_id = ? AND punch_at >= ?`,
    [schoolId, utcStart],
  )) as Array<{ id: number; person_id: number | null; display_name: string | null; device_sn: string | null; punch_at: Date | string }>;

  const boundaryPunches: BoundaryPunch[] = rows.map((r) => {
    const p = r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at);
    return { id: r.id, person_id: r.person_id, minute: minuteOfDay(p, off), local_date: localDateStr(p, off) };
  });

  const todayPunches = boundaryPunches.filter((p) => p.local_date === today);
  const observedFirstArrivalMinute = firstArrivalOf(todayPunches.map((p) => p.minute));

  // Concrete evidence, not just a score: the actual earliest raw records for
  // today, sorted ascending, capped for display. This is what a "trusted"
  // verdict is BASED ON — always populated (even on a healthy day), never
  // hidden behind an anomaly flag, so a reviewer can see the real punches
  // for themselves instead of taking the confidence number on faith.
  const todaysEarliestPunches = rows
    .filter((r) => localDateStr(r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at), off) === today)
    .map((r) => {
      const p = r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at);
      return {
        id: r.id, person_id: r.person_id, display_name: r.display_name, device_sn: r.device_sn,
        minute: minuteOfDay(p, off), punch_at: p.toISOString(),
      };
    })
    .sort((a, b) => a.minute - b.minute)
    .slice(0, 15);

  const anchorIds = new Set(anchorCohort.map((a) => a.person_id));
  const todayByPerson = new Map<number, number>();
  for (const p of todayPunches) {
    if (p.person_id == null || !anchorIds.has(p.person_id)) continue;
    const prev = todayByPerson.get(p.person_id);
    if (prev == null || p.minute < prev) todayByPerson.set(p.person_id, p.minute);
  }
  const anchorsToday: AnchorTodayRow[] = anchorCohort.map((a) => ({
    person_id: a.person_id, display_name: a.display_name, expectedMinute: a.median_arrival_minute,
    observedMinute: todayByPerson.get(a.person_id) ?? null,
    present: todayByPerson.has(a.person_id),
  }));
  const anchorsPresent = anchorsToday.filter((a) => a.present).length;
  const anchorsExpected = anchorCohort.length;
  const anchorsMissing = anchorsExpected - anchorsPresent;
  const matchPct = anchorsExpected > 0 ? Math.round((anchorsPresent / anchorsExpected) * 100) : 0;

  // Boundary-cluster suspicion: today's observed first arrival is itself
  // near the midnight boundary AND far from the anchor cohort's usual time.
  const nearBoundary = observedFirstArrivalMinute != null &&
    (observedFirstArrivalMinute <= 2 * 60 || observedFirstArrivalMinute >= 23 * 60);
  const farFromUsual = observedFirstArrivalMinute != null &&
    Math.abs(observedFirstArrivalMinute - anchorMedian) > Math.max(90, anchorMad * 3);
  let shiftSimulation: ShiftSimulation | null = null;
  if (anchorCohort.length && nearBoundary && farFromUsual) {
    shiftSimulation = simulateBoundaryShift(boundaryPunches, today, anchorMedian, anchorMad);
  }

  const deviceClockStatus = await sweepToday(schoolId);
  const lastSyncAt = rows.length
    ? rows.reduce((max, r) => {
      const t = (r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at)).getTime();
      return Math.max(max, t);
    }, 0)
    : null;

  let status: FirstArrivalHealthResult['status'] = 'trusted';
  let confidence = 90;
  if (!anchorCohort.length) { status = 'review'; confidence = 40; }
  else if (shiftSimulation && shiftSimulation.recommendation === 'investigate_shift') { status = 'anomaly'; confidence = 100 - shiftSimulation.confidenceCurrent; }
  else if (matchPct < 50 && observedFirstArrivalMinute != null) { status = 'review'; confidence = matchPct; }
  else if (matchPct >= 50) { confidence = Math.max(matchPct, 60); }

  let recommendation: string;
  if (!anchorCohort.length) {
    recommendation = 'Not enough attendance history yet to establish a first-arrival baseline for this school — check back after a few weeks of data.';
  } else if (shiftSimulation && shiftSimulation.recommendation === 'investigate_shift') {
    recommendation = `Today's earliest records (${fmtMinute(observedFirstArrivalMinute)}) look like previous-day stragglers, not genuine arrivals — interpreting them as belonging to the prior day restores the expected pattern (confidence ${shiftSimulation.confidenceShifted}% vs ${shiftSimulation.confidenceCurrent}% as currently dated). Review before approving today's attendance.`;
  } else if (matchPct < 50 && observedFirstArrivalMinute != null) {
    recommendation = `Only ${anchorsPresent}/${anchorsExpected} usual early arrivers (${matchPct}%) have punched in so far vs their typical ${fmtMinute(anchorMedian)} arrival — worth a look if this persists.`;
  } else if (observedFirstArrivalMinute == null) {
    recommendation = 'No punches yet today — nothing to assess.';
  } else {
    recommendation = `Today's first arrival (${fmtMinute(observedFirstArrivalMinute)}) and ${anchorsPresent}/${anchorsExpected} usual early arrivers (${matchPct}%) look consistent with this school's learned pattern.`;
  }

  await query(
    `INSERT INTO attendance_first_arrival_health
       (school_id, local_date, status, confidence, anchors_expected, anchors_present, anchors_missing,
        match_pct, observed_first_minute, baseline_days, recommendation, likely_cause, shift_simulation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status=VALUES(status), confidence=VALUES(confidence), anchors_expected=VALUES(anchors_expected),
       anchors_present=VALUES(anchors_present), anchors_missing=VALUES(anchors_missing),
       match_pct=VALUES(match_pct), observed_first_minute=VALUES(observed_first_minute),
       baseline_days=VALUES(baseline_days), recommendation=VALUES(recommendation),
       likely_cause=VALUES(likely_cause), shift_simulation=VALUES(shift_simulation)`,
    [schoolId, today, status, confidence, anchorsExpected, anchorsPresent, anchorsMissing,
      matchPct, observedFirstArrivalMinute, anchorCohort[0]?.sample_days ?? 0, recommendation.slice(0, 490),
      shiftSimulation ? 'previous_day_rollover' : null, shiftSimulation ? JSON.stringify(shiftSimulation) : null],
  );

  return {
    status, confidence, observedFirstArrivalMinute, anchorCohort, anchorsToday, todaysEarliestPunches,
    evidence: {
      daysAnalyzed: anchorCohort[0]?.sample_days ?? 0,
      cohortSize: anchorsExpected, matchPct, missingCount: anchorsMissing,
      deviceClockStatus, lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    },
    recommendation, shiftSimulation,
  };
}
