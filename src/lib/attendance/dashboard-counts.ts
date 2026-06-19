/**
 * Dashboard attendance counts (present / late / absent).
 * ─────────────────────────────────────────────────────
 * Derived directly from the raw punches (zk_attendance_logs) + the
 * school's attendance rule, NOT from the canonical attendance_records
 * table — because attendance_records is only populated for matched,
 * engine-evaluated punches and is sparse in practice, which made every
 * dashboard read 0. Raw punches always exist, so this shows real numbers
 * regardless of engine state.
 *
 *   present = distinct matched people with >= 1 punch on the date
 *   late    = of those, whose FIRST punch (in school-local time) is after
 *             arrival_end_time + late_threshold_minutes
 *   absent  = active roster total - present
 *
 * Local time-of-day is computed with the school's UTC offset (time
 * policy), since punch_at is stored as a real UTC instant.
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';

export interface RoleCounts { total: number; present: number; late: number; absent: number; }
export interface DashboardAttendanceCounts {
  date: string;
  students: RoleCounts;
  staff: RoleCounts;
}

function addMinutesToTime(hms: string, mins: number): string {
  const [h, m, s] = (hms || '08:30:00').split(':').map((x) => parseInt(x, 10) || 0);
  let total = h * 3600 + m * 60 + (s || 0) + mins * 60;
  total = ((total % 86400) + 86400) % 86400;
  const hh = Math.floor(total / 3600), mm = Math.floor((total % 3600) / 60), ss = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(hh)}:${p(mm)}:${p(ss)}`;
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

  // Arrival cutoff (on-time end + grace). Prefer the active rule.
  let lateCutoff = '08:45:00';
  try {
    const rules = (await query(
      `SELECT arrival_end_time, late_threshold_minutes
         FROM attendance_rules
        WHERE school_id = ? AND applies_to IN ('students','all')
        ORDER BY is_active DESC, priority DESC, id DESC LIMIT 1`,
      [schoolId],
    )) as Array<{ arrival_end_time: string | null; late_threshold_minutes: number | null }>;
    if (rules[0]?.arrival_end_time) {
      lateCutoff = addMinutesToTime(String(rules[0].arrival_end_time), Number(rules[0].late_threshold_minutes ?? 0));
    }
  } catch { /* default cutoff */ }

  const roleCounts = async (idCol: 'student_id' | 'staff_id'): Promise<{ present: number; late: number }> => {
    try {
      const rows = (await query(
        `SELECT
           COUNT(*) AS present,
           SUM(CASE WHEN TIME(DATE_ADD(first_ct, INTERVAL ? MINUTE)) > ? THEN 1 ELSE 0 END) AS late
         FROM (
           SELECT ${idCol} AS pid, MIN(check_time) AS first_ct
             FROM zk_attendance_logs
            WHERE school_id = ? AND ${idCol} IS NOT NULL AND DATE(check_time) = ?
            GROUP BY ${idCol}
         ) t`,
        [offsetMin, lateCutoff, schoolId, date],
      )) as Array<{ present: number; late: number }>;
      return { present: Number(rows[0]?.present || 0), late: Number(rows[0]?.late || 0) };
    } catch {
      return { present: 0, late: 0 };
    }
  };

  const num = async (sql: string): Promise<number> => {
    try { const r = (await query(sql, [schoolId])) as any[]; return Number(r[0]?.total || 0); } catch { return 0; }
  };

  const [stu, stf, studentTotal, staffTotal] = await Promise.all([
    roleCounts('student_id'),
    roleCounts('staff_id'),
    num(`SELECT COUNT(DISTINCT s.id) AS total
           FROM students s JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
          WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL`),
    num(`SELECT COUNT(*) AS total FROM staff WHERE school_id = ? AND status = 'active'`),
  ]);

  return {
    date,
    students: { total: studentTotal, present: stu.present, late: stu.late, absent: Math.max(0, studentTotal - stu.present) },
    staff: { total: staffTotal, present: stf.present, late: stf.late, absent: Math.max(0, staffTotal - stf.present) },
  };
}
