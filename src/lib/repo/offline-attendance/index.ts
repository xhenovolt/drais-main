/**
 * @drais/repo — the first offline-attendance slice.
 *
 * Attendance is Phase 7's own stated highest-priority module (Phase 7's
 * objective line, and ROADMAP.md's mobile-facing module order — the same
 * conclusion reached independently from the mobile side). Its repo-layer
 * tables (`people`, `attendanceRawEvents`, `attendanceRecords`) have existed
 * since sub-effort 1; nothing built the routes/page on top of them until
 * now — the exact gap Students had before sub-effort 11.
 *
 * Scope, decided the same way sub-effort 11 scoped Students (investigate
 * the real feature first, then deliberately build something smaller):
 * the real /attendance/history route (src/app/api/attendance/history/
 * route.ts) is ~440 lines — pagination, sort, a dozen filter dimensions,
 * device/clock-health/notification joins, live clock auto-correction,
 * Sentinel hooks. None of that is a reasonable first offline target.
 *
 * READ-ONLY for this slice, on purpose, not an oversight: `attendance_rules`
 * (the table src/lib/attendance/rule-evaluator.ts needs to decide "is this
 * late?") has no repo yet. Writing a NEW punch offline and computing a
 * status for it without that table would silently invent a rule ("late
 * after what time?") this layer has no business deciding — the same
 * "don't reimplement a rule the server owns" principle drais-mobile's own
 * M0004 already states for a different client. So this slice shows
 * attendance that was ALREADY evaluated (by the real online engine, carried
 * into the local file the same way every other synced table is) — it does
 * not mark attendance. Marking is real, deferred work, tracked as such.
 *
 * Same shape as offline-students: pure, tested business logic here, a thin
 * NextRequest/NextResponse adapter in route-bridge.ts, genuinely new routes
 * that dynamically import that bridge. Lands inert until wired.
 */
import type { Repos } from '../contract';
import type { AttendanceRecordRecord, AttendanceRawEventRecord, PersonRecord } from '../contract/types';

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
