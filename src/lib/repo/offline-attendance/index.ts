/**
 * @drais/repo — the offline-attendance slice.
 *
 * Attendance is Phase 7's own stated highest-priority module (Phase 7's
 * objective line, and ROADMAP.md's mobile-facing module order — the same
 * conclusion reached independently from the mobile side). Its repo-layer
 * tables (`people`, `attendanceRawEvents`, `attendanceRecords`) have existed
 * since sub-effort 1; nothing built the routes/page on top of them until
 * sub-effort 12 — the exact gap Students had before sub-effort 11.
 *
 * Scope, decided the same way sub-effort 11 scoped Students (investigate
 * the real feature first, then deliberately build something smaller):
 * the real /attendance/history route (src/app/api/attendance/history/
 * route.ts) is ~440 lines — pagination, sort, a dozen filter dimensions,
 * device/clock-health/notification joins, live clock auto-correction,
 * Sentinel hooks. None of that is a reasonable first offline target.
 *
 * Sub-effort 12 was READ-ONLY on purpose: `attendance_rules` (the table
 * rule-evaluator.ts needs to decide "is this late?") had no repo yet.
 * Sub-effort 19 closes that gap — `AttendanceRuleRepo` now exists — and
 * adds real marking: recordOfflinePunch (Create), overrideOfflineStatus
 * (Update), deleteOfflineManualPunch (Delete), alongside the existing
 * reads. The evaluation itself REUSES src/lib/attendance/rule-evaluator.ts's
 * `evaluate()` directly, not a re-implementation — that module is
 * genuinely pure (zero imports, zero DB, zero clock access beyond what's
 * passed in, per its own header), so importing it costs nothing extra in
 * the module graph and, more importantly, GUARANTEES byte-for-byte parity
 * with online evaluation rather than risking two implementations drifting
 * apart. This is the one deliberate exception to "write fresh against the
 * schema, don't import from online files" (§25a) — that rule is about not
 * grafting mode-branches into existing ROUTES; reusing a stateless, already
 * independently-tested pure function is the opposite of that risk.
 *
 * Deliberate simplifications, documented rather than hidden:
 * - No timezone shift (unlike engine.ts's own documented fix this
 *   session). The online engine needs one because the CLOUD SERVER runs
 *   in UTC while the school is elsewhere; a local install runs ON the
 *   school's own machine, so the device's wall-clock IS the school's
 *   local time already — there is no runtime/school timezone mismatch to
 *   correct for here, structurally.
 * - isHoliday is always false — no HolidayRepo exists in this layer yet.
 * - personIsBoarding is always unresolved (undefined) — the offline
 *   `students` table doesn't carry residency_status yet. This only
 *   affects rules scoped specifically to boarding_scope='boarding'/'day';
 *   an 'all'-scoped rule (the common case) behaves identically.
 * - A punch in the narrow window between local midnight and local
 *   midnight-plus-UTC-offset (e.g. 00:00-03:00 for a UTC+3 school) could
 *   be attributed to the adjacent calendar day by the underlying
 *   `listByPersonAndDateRange`'s SQL-level UTC date() extraction — a real
 *   edge case, not expected to matter for actual school hours, not
 *   silently ignored either.
 */
import type { Repos } from '../contract';
import type { AttendanceRecordRecord, AttendanceRawEventRecord, PersonRecord, AttendanceRuleRecord, AttendanceDayRoleType, AttendanceDayStatus } from '../contract/types';
import { RepoError } from '../contract/types';
import { evaluate, type AttendanceRule as PureAttendanceRule, type RawPunch } from '@/lib/attendance/rule-evaluator';

/** A day's attendance summary, joined to the person's name — composed from
 *  two clean repo calls (listBySchoolAndDate + one people.findById per row),
 *  the same N+1-accepted pattern offline-students already established for a
 *  single-school local file with no network latency and a modest row count. */
export interface OfflineAttendanceRow {
  id: number;
  personId: number;
  roleType: 'student' | 'staff';
  attendanceDate: string;
  firstInAt: string | null;
  lastOutAt: string | null;
  status: AttendanceRecordRecord['status'];
  lateMinutes: number;
  earlyMinutes: number;
  totalMinutes: number;
  firstName: string;
  lastName: string;
  otherName: string | null;
}

function toRow(record: AttendanceRecordRecord, person: PersonRecord): OfflineAttendanceRow {
  return {
    id: record.id, personId: record.personId, roleType: record.roleType,
    attendanceDate: record.attendanceDate, firstInAt: record.firstInAt, lastOutAt: record.lastOutAt,
    status: record.status, lateMinutes: record.lateMinutes, earlyMinutes: record.earlyMinutes,
    totalMinutes: record.totalMinutes,
    firstName: person.firstName, lastName: person.lastName, otherName: person.otherName,
  };
}

export interface OfflineAttendanceSummary {
  date: string;
  total: number;
  present: number;
  late: number;
  absent: number;
  halfDay: number;
  earlyLeave: number;
}

function summarize(date: string, rows: OfflineAttendanceRow[]): OfflineAttendanceSummary {
  const s: OfflineAttendanceSummary = { date, total: rows.length, present: 0, late: 0, absent: 0, halfDay: 0, earlyLeave: 0 };
  for (const r of rows) {
    if (r.status === 'present') s.present++;
    else if (r.status === 'late') s.late++;
    else if (r.status === 'absent') s.absent++;
    else if (r.status === 'half_day') s.halfDay++;
    else if (r.status === 'early_leave') s.earlyLeave++;
  }
  return s;
}

/** Every evaluated attendance row for one school-day, newest-arrival-first,
 *  joined to the person's name. A person whose `people` row is missing
 *  (deleted independently — the same orphan case offline-students already
 *  handles) is skipped rather than crashing the list. */
export async function listOfflineAttendanceForDate(
  repos: Repos, schoolId: number, date: string,
): Promise<{ rows: OfflineAttendanceRow[]; summary: OfflineAttendanceSummary }> {
  const records = await repos.attendanceRecords.listBySchoolAndDate(schoolId, date);
  const rows: OfflineAttendanceRow[] = [];
  for (const record of records) {
    const person = await repos.people.findById(record.personId);
    if (!person) continue;
    rows.push(toRow(record, person));
  }
  rows.sort((a, b) => (b.firstInAt ?? '').localeCompare(a.firstInAt ?? ''));
  return { rows, summary: summarize(date, rows) };
}

/** A cap on the date-range walk below — protects against an accidentally
 *  huge range on a synchronous local driver; generous enough for any
 *  realistic "recent history" screen (a term is well under this). */
const MAX_HISTORY_DAYS = 62;

function eachDate(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return out;
  for (let d = from; d <= to && out.length < MAX_HISTORY_DAYS; d = new Date(d.getTime() + 86_400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export interface OfflinePersonAttendanceHistory {
  personId: number;
  firstName: string;
  lastName: string;
  otherName: string | null;
  days: OfflineAttendanceRow[];
  rawEvents: AttendanceRawEventRecord[];
}

/** One person's evaluated daily status across a bounded date range, plus
 *  their raw punches over the same range (the same two repo calls the real
 *  attendance history page ultimately reads, without that page's filters/
 *  pagination/joins). `null` if the person doesn't exist in this school's
 *  local copy at all — distinct from "exists but has no attendance yet",
 *  which returns an empty `days`/`rawEvents` pair. */
export async function getOfflinePersonAttendance(
  repos: Repos, schoolId: number, personId: number, fromDate: string, toDate: string,
): Promise<OfflinePersonAttendanceHistory | null> {
  const person = await repos.people.findById(personId);
  if (!person) return null;

  const days: OfflineAttendanceRow[] = [];
  for (const date of eachDate(fromDate, toDate)) {
    const record = await repos.attendanceRecords.findByPersonAndDate(schoolId, personId, date);
    if (record) days.push(toRow(record, person));
  }
  const rawEvents = await repos.attendanceRawEvents.listByPersonAndDateRange(schoolId, personId, fromDate, toDate);

  return { personId, firstName: person.firstName, lastName: person.lastName, otherName: person.otherName, days, rawEvents };
}

// ── Sub-effort 19: marking (Create/Update/Delete) ──────────────────────

function toPureRule(r: AttendanceRuleRecord): PureAttendanceRule {
  return {
    id: r.id,
    arrival_start_time: r.arrivalStartTime, arrival_end_time: r.arrivalEndTime,
    late_threshold_minutes: r.lateThresholdMinutes, absence_cutoff_time: r.absenceCutoffTime,
    closing_time: r.closingTime, departure_start_time: r.departureStartTime, departure_end_time: r.departureEndTime,
    early_leave_threshold_minutes: r.earlyLeaveThresholdMinutes, half_day_threshold_minutes: r.halfDayThresholdMinutes,
    weekday_mask: r.weekdayMask, applies_on_holidays: r.appliesOnHolidays,
    boarding_scope: r.boardingScope, applies_to: r.appliesTo,
    ignore_duplicate_scans_within_minutes: r.ignoreDuplicateScansWithinMinutes,
  };
}

/** The device's own local calendar date — deliberately NOT a UTC-string
 *  slice (see this file's header: no timezone shift needed, but the
 *  local/UTC date distinction still matters at this one boundary). */
function localDateStr(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function reEvaluateDay(
  repos: Repos, schoolId: number, personId: number, roleType: AttendanceDayRoleType, dateStr: string, rule: AttendanceRuleRecord,
): Promise<OfflineAttendanceRow> {
  const rawEvents = await repos.attendanceRawEvents.listByPersonAndDateRange(schoolId, personId, dateStr, dateStr);
  const rawPunches: RawPunch[] = rawEvents.map((e) => ({
    punch_at: new Date(e.punchAt), device_sn: e.deviceSn, io_mode: e.ioMode,
  }));
  const verdict = evaluate(toPureRule(rule), rawPunches, {
    attendanceDate: new Date(`${dateStr}T00:00:00`),
    isHoliday: false, // no HolidayRepo yet — see this file's header
    personRole: roleType,
    personIsBoarding: undefined, // residency_status not modeled offline yet — see this file's header
  });
  const record = await repos.attendanceRecords.upsert({
    schoolId, personId, roleType, attendanceDate: dateStr,
    firstInAt: verdict.firstInAt ? verdict.firstInAt.toISOString() : null,
    lastOutAt: verdict.lastOutAt ? verdict.lastOutAt.toISOString() : null,
    firstInDevice: verdict.firstInDevice, lastOutDevice: verdict.lastOutDevice,
    status: verdict.status, lateMinutes: verdict.lateMinutes, earlyMinutes: verdict.earlyMinutes,
    totalMinutes: verdict.totalMinutes, ruleId: rule.id, rawEventCount: verdict.rawEventCount,
  });
  const person = await repos.people.findById(personId);
  if (!person) throw new RepoError(`Person ${personId} not found in school ${schoolId}`, 'NOT_FOUND');
  return toRow(record, person);
}

/** CREATE — record a punch for right now (or a caller-supplied instant)
 *  and re-evaluate that calendar day's verdict from every punch on
 *  record for it, exactly how the real engine evaluates a day: never
 *  invented locally, always the real evaluate() function. Throws
 *  INVALID_INPUT if no active rule is configured for this role — marking
 *  attendance against no rule at all would mean this layer silently
 *  deciding what "late" means, which it has no authority to do. */
export async function recordOfflinePunch(
  repos: Repos, schoolId: number, personId: number, roleType: AttendanceDayRoleType, punchAt: Date = new Date(),
): Promise<OfflineAttendanceRow> {
  const rule = await repos.attendanceRules.findActiveForRole(schoolId, roleType);
  if (!rule) throw new RepoError(`No active attendance rule configured for ${roleType}s in school ${schoolId}`, 'INVALID_INPUT');

  await repos.attendanceRawEvents.create({
    schoolId, deviceSn: 'OFFLINE_MANUAL', deviceUserId: personId,
    personId, roleType, punchAt: punchAt.toISOString(), source: 'manual',
  });
  return reEvaluateDay(repos, schoolId, personId, roleType, localDateStr(punchAt), rule);
}

/** UPDATE — a direct administrative correction to a day's status,
 *  bypassing evaluation entirely (ruleId is set to null to mark the row
 *  as manually overridden, not rule-derived — distinguishable from a
 *  genuinely evaluated row on inspection). Existing first-in/last-out/
 *  minutes are preserved from whatever's already on record; only the
 *  status itself changes. Distinct from recordOfflinePunch (which adds
 *  evidence and lets the rule decide) — this is for the case where the
 *  rule's verdict is wrong for a real-world reason the rule can't see
 *  (an excused absence, a known device outage), not a replacement for it. */
export async function overrideOfflineAttendanceStatus(
  repos: Repos, schoolId: number, personId: number, roleType: AttendanceDayRoleType, dateStr: string, status: AttendanceDayStatus,
): Promise<OfflineAttendanceRow> {
  const existing = await repos.attendanceRecords.findByPersonAndDate(schoolId, personId, dateStr);
  const record = await repos.attendanceRecords.upsert({
    schoolId, personId, roleType, attendanceDate: dateStr,
    firstInAt: existing?.firstInAt ?? null, lastOutAt: existing?.lastOutAt ?? null,
    firstInDevice: existing?.firstInDevice ?? null, lastOutDevice: existing?.lastOutDevice ?? null,
    status, lateMinutes: existing?.lateMinutes ?? 0, earlyMinutes: existing?.earlyMinutes ?? 0,
    totalMinutes: existing?.totalMinutes ?? 0, ruleId: null, rawEventCount: existing?.rawEventCount ?? 0,
  });
  const person = await repos.people.findById(personId);
  if (!person) throw new RepoError(`Person ${personId} not found in school ${schoolId}`, 'NOT_FOUND');
  return toRow(record, person);
}

/** DELETE — undo a manually-recorded punch (never a real device punch;
 *  AttendanceRawEventRepo.deleteManualEvent() refuses anything else) and
 *  re-evaluate the day from whatever punches remain. Returns null, not
 *  an error, when no active rule exists to re-evaluate against — the
 *  punch is still genuinely gone; the day's last-evaluated summary just
 *  can't be refreshed without a rule, same "can't invent what's not
 *  configured" principle as recordOfflinePunch. */
export async function deleteOfflineManualPunch(
  repos: Repos, schoolId: number, personId: number, roleType: AttendanceDayRoleType, rawEventId: number,
): Promise<OfflineAttendanceRow | null> {
  const event = await repos.attendanceRawEvents.findById(schoolId, rawEventId);
  if (!event) throw new RepoError(`Raw event ${rawEventId} not found in school ${schoolId}`, 'NOT_FOUND');
  const dateStr = localDateStr(new Date(event.punchAt));

  await repos.attendanceRawEvents.deleteManualEvent(schoolId, rawEventId);

  const rule = await repos.attendanceRules.findActiveForRole(schoolId, roleType);
  if (!rule) return null;
  return reEvaluateDay(repos, schoolId, personId, roleType, dateStr, rule);
}
