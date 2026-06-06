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
  type AttendanceRule,
  type AttendanceVerdict,
  type RawPunch,
} from '@/lib/attendance/rule-evaluator';
import { ensureAttendanceEngineSchema } from '@/lib/attendance/migrations/attendance-tables-schema';
import { publishEvent } from '@/lib/events/eventbus';
// Phase 5 — registers the notification fanout subscriber the first
// time the engine module loads. The subscriber listens for
// attendance.record.upserted, matches policies, and enqueues
// notification_outbox rows. NO synchronous external calls happen on
// the engine's emit path — the drainer cron is what actually sends.
import { installNotificationFanout } from '@/lib/notifications/fanout';
installNotificationFanout();

export type AttendanceSource = 'zkteco_push' | 'dahua_pull' | 'manual' | 'relay';

export interface RecordRawEventInput {
  schoolId: number;
  deviceSn: string;
  deviceUserId: number;
  displayName?: string | null;
  punchAt: Date;
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
    const result = (await query(
      `INSERT INTO attendance_raw_events
         (school_id, device_sn, device_user_id, display_name, enrollment_id, person_id,
          role_type, role_ref_id, punch_at, verify_type, io_mode, source,
          matched, resolution_path, resolution_score,
          legacy_table, legacy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.verifyType ?? null,
        input.ioMode ?? null,
        input.source,
        input.matched ? 1 : 0,
        input.resolutionPath ?? null,
        input.resolutionScore ?? null,
        input.legacyTable ?? null,
        input.legacyId ?? null,
      ],
    )) as { insertId?: number };
    return result?.insertId ?? null;
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
    `SELECT school_id, person_id, role_type, punch_at
       FROM attendance_raw_events
      WHERE id = ?
      LIMIT 1`,
    [rawEventId],
  )) as Array<{
    school_id: number;
    person_id: number | null;
    role_type: 'student' | 'staff' | 'visitor' | null;
    punch_at: Date | string;
  }>;

  if (rows.length === 0) return;
  const r = rows[0];
  if (!r.person_id || !r.role_type || r.role_type === 'visitor') {
    // Unresolved punches don't produce attendance_records — they sit
    // in raw_events until orphan-claim stamps the person_id. Visitor
    // attendance is out of scope until Phase X.
    return;
  }
  const punchAt = r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at);
  const attendanceDate = startOfDay(punchAt);
  await evaluateDay(r.school_id, r.person_id, r.role_type, attendanceDate);
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

  // 1. Load rule.
  const rule = await loadActiveRule(schoolId, roleType);
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
    `SELECT punch_at, device_sn, io_mode
       FROM attendance_raw_events
      WHERE person_id = ?
        AND punch_at >= ? AND punch_at < ?
      ORDER BY punch_at ASC`,
    [personId, dayStart, dayEnd],
  )) as Array<{ punch_at: Date | string; device_sn: string | null; io_mode: number | null }>;

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
      // Phase 3 doesn't yet read boarding status off the student
      // record — that's wired in the Phase 3 follow-up commit that
      // also extends the UI. Until then evaluator treats all
      // boarding_scope='all' rules as covering everyone.
      personIsBoarding: undefined,
    },
  );

  // 6. UPSERT.
  await persistVerdict(schoolId, personId, roleType, dayStart, rule.id ?? null, verdict);

  // 7. PHASE 5 — emit attendance.record.upserted onto the event bus.
  //    The fanout subscriber matches policies and enqueues outbox
  //    rows. publishEvent never throws — listener errors are swallowed
  //    by the bus, so the engine return is unaffected.
  publishEvent('attendance.record.upserted', {
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
  });
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
): Promise<(AttendanceRule & { id: number }) | null> {
  try {
    const appliesTo = roleType === 'staff' ? "('teachers','all')" : "('students','all')";
    const rows = (await query(
      `SELECT id, arrival_start_time, arrival_end_time, late_threshold_minutes,
              absence_cutoff_time, closing_time,
              departure_start_time, departure_end_time,
              early_leave_threshold_minutes, half_day_threshold_minutes,
              weekday_mask, applies_on_holidays, boarding_scope,
              applies_to, ignore_duplicate_scans_within_minutes
         FROM attendance_rules
        WHERE school_id = ? AND is_active = 1
          AND applies_to IN ${appliesTo}
        ORDER BY priority ASC
        LIMIT 1`,
      [schoolId],
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
): Promise<void> {
  await query(
    `INSERT INTO attendance_records
       (school_id, person_id, role_type, attendance_date,
        first_in_at, last_out_at, first_in_device, last_out_device,
        status, late_minutes, early_minutes, total_minutes,
        rule_id, raw_event_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       raw_event_count = VALUES(raw_event_count)`,
    [
      schoolId, personId, roleType, formatDate(attendanceDate),
      v.firstInAt, v.lastOutAt, v.firstInDevice, v.lastOutDevice,
      v.status, v.lateMinutes, v.earlyMinutes, v.totalMinutes,
      ruleId, v.rawEventCount,
    ],
  );
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
