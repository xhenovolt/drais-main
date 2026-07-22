/**
 * Dashboard attendance counts (present / late / absent).
 * ─────────────────────────────────────────────────────
 * Reads attendance_raw_events — the CANONICAL punch store that ingestion,
 * identity matching, and repairs all write to. (The previous version read
 * the legacy zk_attendance_logs table, whose student_id/staff_id columns
 * are only populated by the retired mapping path — so people mapped
 * through biometric_enrollments never appeared in the dashboard numbers.)
 *
 *   present = distinct matched people with ≥ 1 punch on the school-local date
 *   late    = of those, whose FIRST punch (school-local) is after the
 *             ROLE's rule cutoff (arrival_end_time + grace) — staff and
 *             students each use their own applicable rule
 *   absent  = active roster total − present
 *
 * punch_at is a real UTC instant; the school-local day window is
 * [localMidnight − offset, +24h) — no DATE(punch_at) shortcuts, which
 * misplace 00:00–02:59 punches on non-UTC schools.
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

/** UTC SQL instant for local midnight of `date` (+`plusDays`). */
function utcBoundary(date: string, offsetMin: number, plusDays = 0): string {
  const ms = Date.parse(`${date}T00:00:00Z`) - offsetMin * 60_000 + plusDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** The role's late cutoff from the school's own active rules. */
async function roleLateCutoff(schoolId: number, role: 'student' | 'staff'): Promise<string> {
  const applies = role === 'staff'
    ? `('staff','teachers','all')`
    : `('students','learners','all')`;
  try {
    // Same selection semantics as the engine: active rules only, a
    // role-specific rule beats 'all', then priority ASC (the generic
    // 'all' 10:00 rule must never override the staff 08:30 rule).
    const rules = (await query(
      `SELECT arrival_end_time, late_threshold_minutes
         FROM attendance_rules
        WHERE school_id = ? AND is_active = 1 AND applies_to IN ${applies}
        ORDER BY (applies_to = 'all') ASC, priority ASC, id DESC LIMIT 1`,
      [schoolId],
    )) as Array<{ arrival_end_time: string | null; late_threshold_minutes: number | null }>;
    if (rules[0]?.arrival_end_time) {
      return addMinutesToTime(String(rules[0].arrival_end_time), Number(rules[0].late_threshold_minutes ?? 0));
    }
  } catch { /* default */ }
  return '08:45:00';
}

export async function getDashboardAttendanceCounts(
  schoolId: number,
  dateStr?: string,
): Promise<DashboardAttendanceCounts> {
  const policy = await resolveTimePolicy(schoolId);
  const offsetMin = policy.offsetMinutes;
  const date = dateStr || localTodayStr(offsetMin);
  const utcStart = utcBoundary(date, offsetMin, 0);
  const utcEnd = utcBoundary(date, offsetMin, 1);

  const roleCounts = async (role: 'student' | 'staff'): Promise<{ present: number; late: number }> => {
    try {
      const cutoff = await roleLateCutoff(schoolId, role);
      const rows = (await query(
        `SELECT
           COUNT(*) AS present,
           SUM(CASE WHEN TIME(DATE_ADD(first_at, INTERVAL ? MINUTE)) > ? THEN 1 ELSE 0 END) AS late
         FROM (
           SELECT role_ref_id, MIN(punch_at) AS first_at
             FROM attendance_raw_events
            WHERE school_id = ? AND matched = 1 AND role_type = ?
              AND role_ref_id IS NOT NULL
              AND punch_at >= ? AND punch_at < ?
            GROUP BY role_ref_id
         ) t`,
        [offsetMin, cutoff, schoolId, role, utcStart, utcEnd],
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
    roleCounts('student'),
    roleCounts('staff'),
    num(`SELECT COUNT(DISTINCT s.id) AS total
           FROM students s JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
          WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL`),
    num(`SELECT COUNT(*) AS total FROM staff WHERE school_id = ? AND status = 'active' AND deleted_at IS NULL`),
  ]);

  return {
    date,
    students: { total: studentTotal, present: stu.present, late: stu.late, absent: Math.max(0, studentTotal - stu.present) },
    staff: { total: staffTotal, present: stf.present, late: stf.late, absent: Math.max(0, staffTotal - stf.present) },
  };
}
