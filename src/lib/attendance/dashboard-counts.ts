/**
 * Dashboard attendance counts (present / late / absent).
 * ─────────────────────────────────────────────────────
 * present/late are read straight off attendance_records — the SAME
 * canonical, per-person, boarding_scope-aware verdicts src/lib/attendance/
 * breakdown.ts and the engine itself produce. (Two earlier versions of this
 * function existed: one read the legacy zk_attendance_logs table, whose
 * student_id/staff_id columns are only populated by the retired mapping
 * path; a second re-derived "late" from attendance_raw_events against a
 * single per-role cutoff picked with `ORDER BY ... id DESC`, which — for a
 * school with both a day-scholar rule and a boarding rule active for
 * students — arbitrarily used whichever rule happened to have the higher
 * id for EVERY student, ignoring boarding_scope entirely. Confirmed live at
 * Nakifuma: that version reported 98 "late" for a day breakdown.ts's
 * boarding_scope-aware read of the same attendance_records rows reports as
 * 4 late, because it was judging ~185 boarding students against the day
 * rule's 07:25 cutoff instead of their own 08:45 one. Reading the already-
 * evaluated status column has no such blind spot — it can't drift from the
 * canonical model because it IS the canonical model.)
 *
 *   present = people with a punch-backed present/half_day/early_leave verdict today
 *   late    = people with a late verdict today
 *   absent  = active roster total − present − late (never-yet-verdicted
 *             people show up here as "not yet arrived", which for a day
 *             still in progress includes people simply not there yet —
 *             see src/lib/attendance/breakdown.ts's `awaiting` bucket for
 *             the fuller reconciliation this rolls up from)
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';

export interface RoleCounts { total: number; present: number; late: number; absent: number; }
export interface DashboardAttendanceCounts {
  date: string;
  students: RoleCounts;
  staff: RoleCounts;
}

/** School-local date (YYYY-MM-DD) for "now" given the policy offset. */
function localTodayStr(offsetMin: number): string {
  const d = new Date(Date.now() + offsetMin * 60_000);
  return d.toISOString().slice(0, 10);
}

export async function getDashboardAttendanceCounts(
  schoolId: number,
  dateStr?: string,
): Promise<DashboardAttendanceCounts> {
  const policy = await resolveTimePolicy(schoolId);
  const offsetMin = policy.offsetMinutes;
  const date = dateStr || localTodayStr(offsetMin);

  const roleCounts = async (role: 'student' | 'staff'): Promise<{ present: number; late: number }> => {
    try {
      const rows = (await query(
        `SELECT
           SUM(status IN ('present', 'half_day', 'early_leave')) AS present,
           SUM(status = 'late') AS late
         FROM attendance_records
        WHERE school_id = ? AND role_type = ? AND attendance_date = ?`,
        [schoolId, role, date],
      )) as Array<{ present: number | string | null; late: number | string | null }>;
      return { present: Number(rows[0]?.present || 0), late: Number(rows[0]?.late || 0) };
    } catch {
      return { present: 0, late: 0 };
    }
  };

  const num = async (sql: string): Promise<number> => {
    try { const r = (await query(sql, [schoolId])) as any[]; return Number(r[0]?.total || 0); } catch { return 0; }
  };

  const [stu, stf, studentTotal, staffTotal] = await Promise.all([
    roleCounts('student'),
    roleCounts('staff'),
    // Population = active student roster, not "has an active enrollment row".
    // Enrollment rows go 'closed' the moment a class-promotion / academic-year
    // rollover writes the next one, which can lag the roster by days at a
    // school mid-promotion (confirmed live at Nakifuma: 521 of 527 recent
    // enrollment rows 'closed', only 6 'active', while 495 students are
    // s.status='active' — requiring an active enrollment undercounted the
    // real population by ~98%). EXISTS any (non-deleted) enrollment row still
    // excludes genuinely never-enrolled draft records without depending on
    // that row's status staying fresh.
    num(`SELECT COUNT(*) AS total
           FROM students s
          WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
            AND EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id AND e.deleted_at IS NULL)`),
    num(`SELECT COUNT(*) AS total FROM staff WHERE school_id = ? AND status = 'active' AND deleted_at IS NULL`),
  ]);

  return {
    date,
    students: { total: studentTotal, present: stu.present, late: stu.late, absent: Math.max(0, studentTotal - stu.present - stu.late) },
    staff: { total: staffTotal, present: stf.present, late: stf.late, absent: Math.max(0, staffTotal - stf.present - stf.late) },
  };
}
