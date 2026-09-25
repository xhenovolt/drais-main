/**
 * Phase 3 — attendance engine.
 *
 * Orchestrates the pure rule-evaluator (src/lib/attendance/rule-evaluator.ts)
 * around the database:
 *
 *   recordRawEvent(input)        — inserts an attendance_raw_events row
 *                                  and returns the new id. Source-tagged
 *                                  so zk-handler / Dahua / manual all
 *                                  funnel through the same path.
 *
 *   evaluatePunch(rawEventId)    — recomputes the attendance_records row
 *                                  for the (person, date) containing the
 *                                  raw event. Idempotent: re-running on
 *                                  the same id yields the same row
 *                                  because the UNIQUE(person_id,
 *                                  attendance_date) key drives an UPSERT.
 *
 *   evaluateDay(personId, date)  — same as evaluatePunch but driven by
 *                                  an explicit (person, date). Used by
 *                                  the orphan-claim path when a late
 *                                  identity resolution arrives.
 *
 * The engine is intentionally thin. Every decision lives in the pure
 * evaluator; the engine just loads inputs, calls the evaluator,
 * persists the verdict.
 *
 * Backward compatibility
 * ----------------------
 * Phase 3 ships dual-write: zk-handler still writes zk_attendance_logs
 * (legacy readers untouched), then calls recordRawEvent + evaluatePunch
 * for the canonical path. The legacy table becomes a view in the
 * Phase 3 cutover commit (per blueprint week 6); Phase 3 ships only
 * the additive side here.
 */
import { query } from '@/lib/db';
import {
  evaluate,
  deriveEvents,
  type AttendanceRule,
  type AttendanceVerdict,
  type RawPunch,
} from '@/lib/attendance/rule-evaluator';
import { ensureAttendanceEngineSchema } from '@/lib/attendance/migrations/attendance-tables-schema';
import { loadResolvedStaffShift } from './staff-shift';
import { applyWeekdayOverride } from './day-overrides';
import { shiftToAttendanceRule } from './shifts';
import { publishEvent } from '@/lib/events/eventbus';
// Phase 5 — registers the notification fanout subscriber the first
// time the engine module loads. The subscriber listens for
// attendance.record.upserted, matches policies, and enqueues
// notification_outbox rows. NO synchronous external calls happen on
// the engine's emit path — the drainer cron is what actually sends.
import { installNotificationFanout, fanoutAttendanceRecord } from '@/lib/notifications/fanout';
import { getProvisionalAttendanceMeta } from '@/lib/attendance/provisional';
import { getResidencyStatus } from '@/lib/attendance/residency';
import { onRawPunchForLessons } from '@/lib/attendance/lessons/service';
import { getBoardingPolicy, modeForDate, getPeriodFor, recordBoardingReport, hasReported } from '@/lib/attendance/boarding-policy';
import { getBoardingPresenceState, isWithinValidityWindow } from '@/lib/attendance/boarding-presence';
installNotificationFanout();

export type AttendanceSource = 'zkteco_push' | 'dahua_pull' | 'manual' | 'relay';

export interface RecordRawEventInput {
  schoolId: number;
  deviceSn: string;
  deviceUserId: number;
  displayName?: string | null;
  punchAt: Date;
  /** Device's raw reported wall-clock string — the punch IDENTITY / dedup key. */
  deviceReportedTime?: string | null;
  /** device clock − true time, seconds (+ = device ahead). Audit only. */
  clockSkewSeconds?: number | null;
  /** 'device' = punch_at from the device clock; 'server' = corrected. */
  timeSource?: 'device' | 'server' | null;
  /** high | corrected | review | server — confidence in punch_at. */
  timeConfidence?: string | null;
  verifyType?: number | null;
  ioMode?: number | null;
  source: AttendanceSource;
  // Resolution outcome. Caller (zk-handler) has already run
  // resolveIdentity from Phase 1, so these are passed in pre-resolved.
  enrollmentId?: number | null;
  personId?: number | null;
  roleType?: 'student' | 'staff' | 'visitor' | null;
  roleRefId?: number | null;
  matched: boolean;
  resolutionPath?: string | null;
  resolutionScore?: number | null;
  // Dual-write provenance. Lets us trace back to the row in the old
  // table during the Phase 3 migration window.
  legacyTable?: string | null;
  legacyId?: number | null;
}

/**
 * Insert one raw event. Always succeeds; never throws into the caller —
 * the zk-handler insert path must stay fast and unconditional.
 */
export async function recordRawEvent(
  input: RecordRawEventInput,
): Promise<number | null> {
  try {
    await ensureAttendanceEngineSchema();
    const displayName = await resolveDisplayName(input);
    // INSERT IGNORE + UNIQUE uk_raw_punch (school, sn, pin, punch_at,
    // source): ZKTeco devices re-send ATTLOG batches when an ACK is
    // missed. A duplicate returns insertId 0 → caller gets null →
    // evaluatePunch / fanout / SSE are all skipped for the re-send.
    const result = (await query(
      `INSERT IGNORE INTO attendance_raw_events
         (school_id, device_sn, device_user_id, display_name, enrollment_id, person_id,
          role_type, role_ref_id, punch_at, device_reported_time, clock_skew_seconds,
          time_source, time_confidence, verify_type, io_mode, source,
          matched, resolution_path, resolution_score,
          legacy_table, legacy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.schoolId,
        input.deviceSn,
        input.deviceUserId,
        displayName,
        input.enrollmentId ?? null,
        input.personId ?? null,
        input.roleType ?? null,
        input.roleRefId ?? null,
        input.punchAt,
        input.deviceReportedTime ?? null,
        input.clockSkewSeconds ?? null,
        input.timeSource ?? 'device',
        input.timeConfidence ?? null,
        input.verifyType ?? null,
        input.ioMode ?? null,
        input.source,
        input.matched ? 1 : 0,
        input.resolutionPath ?? null,
        input.resolutionScore ?? null,
        input.legacyTable ?? null,
        input.legacyId ?? null,
      ],
    )) as { insertId?: number; affectedRows?: number };
    // affectedRows 0 → duplicate ignored. Return null so the caller
    // skips evaluation/eventing for the re-sent punch.
    if (!result?.insertId || (result.affectedRows ?? 0) === 0) return null;
    return result.insertId;
  } catch (err) {
    // Phase 3 invariant: a raw-event write failure must NOT abort the
    // ingest path. Log and continue; the legacy table still has the
    // punch, the engine can be replayed later.
    console.warn('[attendance-engine] recordRawEvent failed', err);
    return null;
  }
}

async function resolveDisplayName(input: RecordRawEventInput): Promise<string | null> {
  if (input.displayName && String(input.displayName).trim()) {
    return String(input.displayName).trim();
  }

  if (input.personId) {
    try {
      const rows = (await query(
        `SELECT TRIM(CONCAT_WS(' ', first_name, last_name)) AS display_name
           FROM people
          WHERE id = ?
          LIMIT 1`,
        [input.personId],
      )) as Array<{ display_name: string | null }>;
      const displayName = rows[0]?.display_name?.trim();
      if (displayName) return displayName;
    } catch {
      // fall through to device directory
    }
  }

  try {
    const rows = (await query(
      `SELECT device_name
         FROM device_user_directory
        WHERE school_id = ?
          AND device_sn = ?
          AND device_user_id = ?
        LIMIT 1`,
      [input.schoolId, input.deviceSn, String(input.deviceUserId)],
    )) as Array<{ device_name: string | null }>;
    const deviceName = rows[0]?.device_name?.trim();
    if (deviceName) return deviceName;
  } catch {
    // ignore
  }

  return null;
}

/**
 * Re-evaluate the attendance_records row for the (person, date)
 * containing the given raw event. Idempotent.
 */
export async function evaluatePunch(rawEventId: number): Promise<void> {
  await ensureAttendanceEngineSchema();
  const rows = (await query(
    `SELECT school_id, person_id, role_type, punch_at, matched, display_name, device_sn, device_user_id
       FROM attendance_raw_events
      WHERE id = ?
      LIMIT 1`,
    [rawEventId],
  )) as Array<{
    school_id: number;
    person_id: number | null;
    role_type: 'student' | 'staff' | 'visitor' | null;
    punch_at: Date | string;
    matched: number | boolean | null;
    display_name: string | null;
    device_sn: string | null;
    device_user_id: number | string | null;
  }>;

  if (rows.length === 0) return;
  const r = rows[0];
  const meta = getProvisionalAttendanceMeta({ matched: Boolean(r.matched), personId: r.person_id });
  if (!r.person_id || !r.role_type || r.role_type === 'visitor') {
    // Temporary operational mode: unresolved punches still create a
    // visible attendance row as provisional so they are not lost while
    // identity reconciliation catches up. The existing unresolved queue
    // remains intact and later mapping can promote them to matched.
    if (meta.isProvisional) {
      const punchAt = r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at);
      const attendanceDate = startOfDay(punchAt);
      await upsertProvisionalAttendanceRecord(
        r.school_id,
        r.person_id,
        r.role_type ?? 'staff',
        attendanceDate,
        r.display_name,
        r.device_sn,
        r.device_user_id,
        rawEventId,
        meta,
      );
    }
    return;
  }
  const punchAt = r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at);
  const attendanceDate = startOfDay(punchAt);
  await evaluateDay(r.school_id, r.person_id, r.role_type, attendanceDate);
  // Lesson-level attendance is a separate derived layer fed by the same raw event.
  // No-op (one cached read) unless the school enabled it; never throws.
  await onRawPunchForLessons(r.school_id, r.person_id, r.role_type, punchAt.getTime());
}

/**
 * Re-evaluate for an explicit (school, person, role, date). Same code
 * path as evaluatePunch — exposed for the orphan-claim flow where the
 * raw event id is known but the engine should be told a person now
 * exists for that PIN's prior punches.
 */
export async function evaluateDay(
  schoolId: number,
  personId: number,
  roleType: 'student' | 'staff',
  attendanceDate: Date,
): Promise<void> {
  await ensureAttendanceEngineSchema();

  // 0. Residency status (day/boarding) — the signal boarding_scope rules
  //    gate on. Student-only; staff always get null (see residency.ts).
  const boardingStatus = await getResidencyStatus(schoolId, personId, roleType);

  // 1. Load rule. Staff with an assigned shift are classified against THAT
  //    shift; everyone else uses the school's attendance_rules. Opt-in per
  //    school — no shift assignment ⇒ identical to the pre-shift behaviour.
  const baseRule = (roleType === 'staff' ? await loadStaffShiftAsRule(schoolId, personId, attendanceDate) : null)
    ?? await loadActiveRule(schoolId, roleType, boardingStatus);
  // Per-weekday override (e.g. "Saturday arrival ends 10:00") — a no-op
  // for schools without override rows and for shift-derived rules.
  const rule = baseRule ? await applyWeekdayOverride(baseRule, attendanceDate) : null;
  if (!rule) {
    // No rule configured — record a present/absent verdict based on
    // raw count only. This keeps Phase 3 useful for schools that
    // haven't filled in attendance_rules yet.
    await upsertWithFallback(schoolId, personId, roleType, attendanceDate);
    return;
  }

  // 2. Load all raw punches for the (person, date).
  const dayStart = startOfDay(attendanceDate);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const punchRows = (await query(
    `SELECT id, punch_at, device_sn, io_mode
       FROM attendance_raw_events
      WHERE person_id = ?
        AND punch_at >= ? AND punch_at < ?
      ORDER BY punch_at ASC`,
    [personId, dayStart, dayEnd],
  )) as Array<{ id: number; punch_at: Date | string; device_sn: string | null; io_mode: number | null }>;

  const rawPunches: RawPunch[] = punchRows.map(p => ({
    punch_at: p.punch_at instanceof Date ? p.punch_at : new Date(p.punch_at),
    device_sn: p.device_sn,
    io_mode: p.io_mode,
  }));

  // 3. Load holiday context for the date.
  const isHoliday = await isHolidayForSchool(schoolId, dayStart);

  // 4. PHASE 5 — capture the previous status for the event payload's
  //    `previousStatus` field so notification policies can react to
  //    state transitions (e.g. condition status_changed=true).
  const previousStatus = await loadPreviousStatus(personId, dayStart);

  // 5. Evaluate.
  const verdict = evaluate(
    rule,
    rawPunches,
    {
      attendanceDate: dayStart,
      isHoliday,
      personRole: roleType,
      personIsBoarding: boardingStatus === null ? undefined : boardingStatus === 'boarding',
    },
  );

  // 5b. Phase 4 — boarding continuous-presence policy. Only ever consulted
  //     when there is NO biometric evidence for the day (rawPunches empty)
  //     and the winning rule opted into 'continuous' mode for a boarding
  //     student. A day with real punches is always evaluated normally —
  //     policy inference never overrides actual evidence.
  let policyDerivedReason: string | null = null;
  if (
    boardingStatus === 'boarding'
    && rule.boarding_presence_mode === 'continuous'
    && rawPunches.length === 0
    && verdict.status === 'absent'
  ) {
    try {
      const studentRow = (await query(
        `SELECT id FROM students WHERE person_id = ? AND school_id = ? LIMIT 1`,
        [personId, schoolId],
      )) as Array<{ id: number }>;
      const studentId = studentRow[0]?.id;
      if (studentId) {
        const state = await getBoardingPresenceState(schoolId, studentId);
        if (state?.status === 'checked_in' && isWithinValidityWindow(state, dayStart, rule.boarding_presence_validity_days)) {
          verdict.status = 'present';
          verdict.trace = 'boarding_continuous_presence';
          policyDerivedReason = 'boarding_continuous_presence';
        } else if (state?.status === 'on_leave') {
          // Stays 'absent' — but flagged so this doesn't read as an
          // unexplained absence to reports/notifications.
          policyDerivedReason = 'boarding_leave';
        }
      }
    } catch (err) {
      console.warn('[attendance-engine] boarding-presence lookup failed', err);
    }
  }

  // 5c. School boarding policy. DAILY_PUNCH (default) changes nothing. REPORTED_ONCE: a boarder is
  //     "reported" after their first valid punch in the reporting period and is not treated as absent
  //     for not punching again. Reported != present today; both facts stay separate.
  let residenceForEvent: 'day' | 'boarding' | null = boardingStatus === null ? null : (boardingStatus === 'boarding' ? 'boarding' : 'day');
  let boardingModeForEvent: 'DAILY_PUNCH' | 'REPORTED_ONCE' | null = null;
  let boardingReport: { periodKey: string; periodLabel: string; isNew: boolean } | null = null;
  let studentIdForEvent: number | null = null;
  if (roleType === 'student' && boardingStatus === 'boarding') {
    try {
      const dateStr = formatDate(dayStart);
      const bp = await getBoardingPolicy(schoolId);
      boardingModeForEvent = modeForDate(bp, dateStr);
      const sRow = (await query(`SELECT id FROM students WHERE person_id = ? AND school_id = ? LIMIT 1`, [personId, schoolId])) as Array<{ id: number }>;
      studentIdForEvent = sRow[0]?.id ?? null;
      if (boardingModeForEvent === 'REPORTED_ONCE' && studentIdForEvent) {
        const period = await getPeriodFor(schoolId, bp, dateStr);
        if (rawPunches.length > 0) {
          const rep = await recordBoardingReport({
            schoolId, studentId: studentIdForEvent, personId, period, attendanceDate: dateStr,
            reportedAt: rawPunches[0].punch_at, firstPunchEventId: punchRows[0]?.id ?? null,
          });
          boardingReport = { periodKey: period.key, periodLabel: period.label, isNew: rep.isNew };
        } else if (verdict.status === 'absent') {
          if (await hasReported(schoolId, studentIdForEvent, period.key)) {
            verdict.status = 'present';
            verdict.trace = 'boarding_reported_once';
            policyDerivedReason = 'boarding_reported_once';
          } else {
            policyDerivedReason = policyDerivedReason ?? 'boarding_not_reported';
          }
        }
      }
    } catch (err) {
      console.warn('[attendance-engine] boarding policy step failed', err);
    }
  }

  // 6. UPSERT the day verdict.
  await persistVerdict(schoolId, personId, roleType, dayStart, rule.id ?? null, verdict, policyDerivedReason);

  // 6b. Stamp the DERIVED per-punch lifecycle onto each raw event so
  //     logs/popup show "ARRIVED / LATE / CHECKED OUT" — not the device
  //     IN/OUT field. Matched back to rows by punch time (stable within
  //     a day). Best-effort; never blocks the verdict.
  try {
    const events = deriveEvents(rule, rawPunches, {
      attendanceDate: dayStart, isHoliday, personRole: roleType,
      personIsBoarding: boardingStatus === null ? undefined : boardingStatus === 'boarding',
    });
    for (let i = 0; i < events.length && i < punchRows.length; i++) {
      const ev = events[i];
      const row = punchRows[i]; // events are in the same sorted order as punchRows
      await query(
        `UPDATE attendance_raw_events SET derived_event = ?, derived_detail = ? WHERE id = ?`,
        [ev.type, ev.detail.slice(0, 120), row.id],
      );
    }
  } catch (err) {
    console.warn('[attendance-engine] derived-event stamp failed', err);
  }

  // 7. PHASE 5 — emit attendance.record.upserted onto the event bus.
  //    The fanout subscriber matches policies and enqueues outbox
  //    rows. publishEvent never throws — listener errors are swallowed
  //    by the bus, so the engine return is unaffected.
  const recordEvent = {
    schoolId,
    personId,
    roleType,
    attendanceDate: formatDate(dayStart),
    status: verdict.status,
    previousStatus,
    firstInAt: verdict.firstInAt ? verdict.firstInAt.toISOString() : null,
    lastOutAt: verdict.lastOutAt ? verdict.lastOutAt.toISOString() : null,
    lateMinutes: verdict.lateMinutes,
    earlyMinutes: verdict.earlyMinutes,
    totalMinutes: verdict.totalMinutes,
    ruleId: rule.id ?? null,
    isPolicyDerived: policyDerivedReason != null,
    policyDerivedReason,
    residence: residenceForEvent,
    boardingMode: boardingModeForEvent,
    studentId: studentIdForEvent,
    boardingReport,
  };
  publishEvent('attendance.record.upserted', recordEvent);
  // Also enqueue notifications DIRECTLY (awaited) — the bus listener is
  // fire-and-forget and can be killed by a serverless freeze before the
  // outbox row is written. fanoutAttendanceRecord is idempotent (INSERT
  // IGNORE on dedup_key), so the duplicate bus call is harmless.
  try { await fanoutAttendanceRecord(recordEvent); } catch (err) {
    console.warn('[attendance-engine] direct fanout failed', err);
  }
}

async function loadPreviousStatus(
  personId: number,
  attendanceDate: Date,
): Promise<string | null> {
  try {
    const rows = (await query(
      `SELECT status FROM attendance_records
        WHERE person_id = ? AND attendance_date = ?
        LIMIT 1`,
      [personId, formatDate(attendanceDate)],
    )) as Array<{ status: string }>;
    return rows[0]?.status ?? null;
  } catch {
    return null;
  }
}

async function loadActiveRule(
  schoolId: number,
  roleType: 'student' | 'staff',
  boardingStatus: 'boarding' | 'day' | null = null,
): Promise<(AttendanceRule & { id: number }) | null> {
  try {
    const appliesTo = roleType === 'staff' ? "('teachers','all')" : "('students','all')";
    // Candidate rules are restricted to boarding_scope='all' OR an exact
    // match on the person's residency — a rule scoped to the OTHER
    // population is never eligible, so this can't select a mismatched
    // rule. Among eligible rules, prefer the more specific one
    // (boarding_scope matching the person over 'all'), then applies_to
    // specificity, then priority/id — same precedence as before this
    // column was considered, just with boarding_scope now part of it.
    // boardingStatus is null for staff (and for students with no
    // residency_status resolved) — COALESCE(?, 'all') then only matches
    // 'all'-scoped rules, i.e. identical to the pre-residency behaviour.
    const rows = (await query(
      `SELECT id, arrival_start_time, arrival_end_time, late_threshold_minutes,
              absence_cutoff_time, closing_time,
              departure_start_time, departure_end_time,
              early_leave_threshold_minutes, half_day_threshold_minutes,
              weekday_mask, applies_on_holidays, boarding_scope,
              applies_to, ignore_duplicate_scans_within_minutes,
              boarding_presence_mode, boarding_presence_validity_days
         FROM attendance_rules
        WHERE school_id = ? AND is_active = 1
          AND applies_to IN ${appliesTo}
          AND (boarding_scope = 'all' OR boarding_scope = COALESCE(?, 'all'))
        ORDER BY (applies_to = 'all') ASC, (boarding_scope = 'all') ASC, priority ASC, id DESC
        LIMIT 1`,
      [schoolId, boardingStatus],
    )) as Array<Record<string, unknown>>;
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as number,
      arrival_start_time: (r.arrival_start_time as string) ?? null,
      arrival_end_time:   (r.arrival_end_time as string) ?? null,
      late_threshold_minutes: Number(r.late_threshold_minutes ?? 15),
      absence_cutoff_time: (r.absence_cutoff_time as string) ?? null,
      closing_time: (r.closing_time as string) ?? null,
      departure_start_time: (r.departure_start_time as string) ?? null,
      departure_end_time:   (r.departure_end_time as string) ?? null,
      early_leave_threshold_minutes: Number(r.early_leave_threshold_minutes ?? 30),
      half_day_threshold_minutes:    Number(r.half_day_threshold_minutes ?? 240),
      weekday_mask:        Number(r.weekday_mask ?? 31),
      applies_on_holidays: Boolean(r.applies_on_holidays),
      boarding_scope:      (r.boarding_scope as 'all' | 'boarding' | 'day') ?? 'all',
      applies_to: (r.applies_to as 'students' | 'teachers' | 'all') ?? 'students',
      ignore_duplicate_scans_within_minutes: Number(r.ignore_duplicate_scans_within_minutes ?? 2),
      boarding_presence_mode: (r.boarding_presence_mode as 'daily' | 'continuous') ?? 'daily',
      boarding_presence_validity_days: r.boarding_presence_validity_days != null ? Number(r.boarding_presence_validity_days) : null,
    };
  } catch {
    return null;
  }
}

/**
 * If this staff member has a resolved shift for the date, express it as a full
 * AttendanceRule so the SAME evaluator classifies late/early/half-day against
 * the shift's windows. Fields the shift doesn't carry take the rule defaults.
 * Returns null (→ fall back to the school rule) when no shift applies.
 */
async function loadStaffShiftAsRule(
  schoolId: number,
  personId: number,
  date: Date,
): Promise<(AttendanceRule & { id: number }) | null> {
  try {
    const shift = await loadResolvedStaffShift(schoolId, personId, date);
    if (!shift) return null;
    const m = shiftToAttendanceRule(shift);
    return {
      id: -shift.id, // synthetic negative id — never collides with a real rule
      arrival_start_time: m.arrival_start_time,
      arrival_end_time:   m.arrival_end_time,
      late_threshold_minutes: m.late_threshold_minutes,
      absence_cutoff_time: null,
      closing_time: null,
      departure_start_time: m.departure_start_time,
      departure_end_time:   m.departure_end_time,
      early_leave_threshold_minutes: m.early_leave_threshold_minutes,
      half_day_threshold_minutes: 240,
      weekday_mask: m.weekday_mask,
      applies_on_holidays: false,
      boarding_scope: 'all',
      applies_to: 'teachers',
      ignore_duplicate_scans_within_minutes: 2,
    };
  } catch {
    return null;
  }
}

async function isHolidayForSchool(schoolId: number, date: Date): Promise<boolean> {
  try {
    const rows = (await query(
      `SELECT 1 FROM holidays
        WHERE holiday_date = ?
          AND (school_id = ? OR school_id IS NULL)
        LIMIT 1`,
      [formatDate(date), schoolId],
    )) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function persistVerdict(
  schoolId: number,
  personId: number,
  roleType: 'student' | 'staff',
  attendanceDate: Date,
  ruleId: number | null,
  v: AttendanceVerdict,
  policyDerivedReason: string | null = null,
): Promise<void> {
  await query(
    `INSERT INTO attendance_records
       (school_id, person_id, role_type, attendance_date,
        first_in_at, last_out_at, first_in_device, last_out_device,
        status, late_minutes, early_minutes, total_minutes,
        rule_id, raw_event_count, is_policy_derived, policy_derived_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       first_in_at     = VALUES(first_in_at),
       last_out_at     = VALUES(last_out_at),
       first_in_device = VALUES(first_in_device),
       last_out_device = VALUES(last_out_device),
       status          = VALUES(status),
       late_minutes    = VALUES(late_minutes),
       early_minutes   = VALUES(early_minutes),
       total_minutes   = VALUES(total_minutes),
       rule_id         = VALUES(rule_id),
       raw_event_count = VALUES(raw_event_count),
       is_policy_derived    = VALUES(is_policy_derived),
       policy_derived_reason = VALUES(policy_derived_reason)`,
    [
      schoolId, personId, roleType, formatDate(attendanceDate),
      v.firstInAt, v.lastOutAt, v.firstInDevice, v.lastOutDevice,
      v.status, v.lateMinutes, v.earlyMinutes, v.totalMinutes,
      ruleId, v.rawEventCount, policyDerivedReason != null, policyDerivedReason,
    ],
  );
}

async function upsertProvisionalAttendanceRecord(
  schoolId: number,
  personId: number | null,
  roleType: 'student' | 'staff' | 'visitor',
  attendanceDate: Date,
  displayName: string | null,
  deviceSn: string | null,
  deviceUserId: number | string | null,
  rawEventId: number,
  meta: ReturnType<typeof getProvisionalAttendanceMeta>,
): Promise<void> {
  const date = formatDate(attendanceDate);
  const status = meta.isProvisional ? 'present' : 'absent';
  const firstInAt = new Date(attendanceDate);
  const lastOutAt = new Date(attendanceDate);
  const personKey = personId ?? null;
  await query(
    `INSERT INTO attendance_records
       (school_id, person_id, role_type, attendance_date,
        first_in_at, last_out_at, first_in_device, last_out_device,
        status, late_minutes, early_minutes, total_minutes,
        rule_id, raw_event_count, is_provisional, provisional_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       first_in_at         = VALUES(first_in_at),
       last_out_at         = VALUES(last_out_at),
       first_in_device     = VALUES(first_in_device),
       last_out_device     = VALUES(last_out_device),
       status              = VALUES(status),
       late_minutes        = VALUES(late_minutes),
       early_minutes       = VALUES(early_minutes),
       total_minutes       = VALUES(total_minutes),
       rule_id             = VALUES(rule_id),
       raw_event_count     = VALUES(raw_event_count),
       is_provisional      = VALUES(is_provisional),
       provisional_reason  = VALUES(provisional_reason)`,
    [
      schoolId,
      personKey,
      roleType,
      date,
      firstInAt,
      lastOutAt,
      deviceSn,
      deviceSn,
      status,
      0,
      0,
      0,
      null,
      1,
      meta.isProvisional ? 1 : 0,
      meta.provisionalReason,
    ],
  );

  await query(
    `UPDATE attendance_raw_events
        SET is_provisional = ?, provisional_reason = ?,
            display_name = COALESCE(NULLIF(TRIM(?), ''), display_name)
      WHERE id = ?`,
    [meta.isProvisional ? 1 : 0, meta.provisionalReason, displayName ?? null, rawEventId],
  ).catch(() => {});
}

/**
 * Fallback path when no attendance_rule exists for the school. Mark
 * the day `present` if there's at least one punch, otherwise `absent`.
 * The engine still owns the record so reports stay consistent.
 */
async function upsertWithFallback(
  schoolId: number,
  personId: number,
  roleType: 'student' | 'staff',
  attendanceDate: Date,
): Promise<void> {
  const dayStart = startOfDay(attendanceDate);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const rows = (await query(
    `SELECT MIN(punch_at) AS first_in, MAX(punch_at) AS last_out,
            MIN(device_sn) AS first_dev, MAX(device_sn) AS last_dev,
            COUNT(*) AS n
       FROM attendance_raw_events
      WHERE person_id = ? AND punch_at >= ? AND punch_at < ?`,
    [personId, dayStart, dayEnd],
  )) as Array<{
    first_in: Date | string | null;
    last_out: Date | string | null;
    first_dev: string | null;
    last_dev: string | null;
    n: number;
  }>;
  const r = rows[0];
  const status = r && Number(r.n) > 0 ? 'present' : 'absent';
  await persistVerdict(schoolId, personId, roleType, dayStart, null, {
    status,
    firstInAt: r?.first_in ? new Date(r.first_in as any) : null,
    lastOutAt: r?.last_out ? new Date(r.last_out as any) : null,
    firstInDevice: r?.first_dev ?? null,
    lastOutDevice: r?.last_dev ?? null,
    lateMinutes: 0,
    earlyMinutes: 0,
    totalMinutes: 0,
    rawEventCount: Number(r?.n ?? 0),
    trace: 'no_rule_fallback',
  });
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatDate(d: Date): string {
  // YYYY-MM-DD in local timezone — matches DATE column semantics.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
