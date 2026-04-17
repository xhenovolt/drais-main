import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

function n(v: unknown): number { return Number(v) || 0; }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/intelligence/attendance-overview
// School-wide attendance summary derived from zk_attendance_logs.
// student_attendance table is empty — ZK biometric scans are the live source.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  let connection;
  try {
    connection = await getConnection();

    // ── Total active enrollments for this school ──────────────────────────
    const [[enrRow]] = await connection.execute(
      `SELECT COUNT(DISTINCT e.student_id) AS total_enrolled
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       WHERE s.school_id = ? AND e.status = 'active' AND s.deleted_at IS NULL`,
      [schoolId]
    ) as any[];
    const totalEnrolled = n(enrRow.total_enrolled);

    // ── ZK tracking window ────────────────────────────────────────────────
    const [[windowRow]] = await connection.execute(
      `SELECT
         COUNT(DISTINCT DATE(check_time)) AS tracked_days,
         MIN(DATE(check_time))            AS first_day,
         MAX(DATE(check_time))            AS last_day
       FROM zk_attendance_logs
       WHERE school_id = ?`,
      [schoolId]
    ) as any[];
    const trackedDays = n(windowRow.tracked_days);

    if (trackedDays === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          tracked_days: 0,
          total_enrolled: totalEnrolled,
          total_scanned_students: 0,
          never_scanned: totalEnrolled,
          avg_daily_attendance: 0,
          scan_rate_pct: 0,
          today_scans: 0,
          week_avg: 0,
          prev_week_avg: 0,
          week_trend: 'no_data',
          week_delta_pct: null,
          first_day: null,
          last_day: null,
          data_source: 'zk_biometric',
          data_note: 'No biometric scans yet for this school.',
        },
      });
    }

    // ── Distinct students who appeared at least once ───────────────────────
    const [[scannedRow]] = await connection.execute(
      `SELECT COUNT(DISTINCT student_id) AS scanned
       FROM zk_attendance_logs
       WHERE school_id = ? AND student_id IS NOT NULL`,
      [schoolId]
    ) as any[];
    const totalScanned = n(scannedRow.scanned);

    // ── Today's distinct students ─────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];
    const [[todayRow]] = await connection.execute(
      `SELECT COUNT(DISTINCT student_id) AS today_count
       FROM zk_attendance_logs
       WHERE school_id = ? AND student_id IS NOT NULL AND DATE(check_time) = ?`,
      [schoolId, today]
    ) as any[];
    const todayScans = n(todayRow.today_count);

    // ── Average daily attendance across all tracked days ──────────────────
    const [[avgRow]] = await connection.execute(
      `SELECT AVG(day_count) AS avg_daily
       FROM (
         SELECT DATE(check_time) AS d, COUNT(DISTINCT student_id) AS day_count
         FROM zk_attendance_logs
         WHERE school_id = ? AND student_id IS NOT NULL
         GROUP BY DATE(check_time)
       ) sub`,
      [schoolId]
    ) as any[];
    const avgDaily = Math.round(n(avgRow.avg_daily));

    // ── This week vs previous week ────────────────────────────────────────
    const [[thisWeekRow]] = await connection.execute(
      `SELECT AVG(day_count) AS avg
       FROM (
         SELECT DATE(check_time) AS d, COUNT(DISTINCT student_id) AS day_count
         FROM zk_attendance_logs
         WHERE school_id = ? AND student_id IS NOT NULL
           AND DATE(check_time) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         GROUP BY DATE(check_time)
       ) sub`,
      [schoolId]
    ) as any[];

    const [[prevWeekRow]] = await connection.execute(
      `SELECT AVG(day_count) AS avg
       FROM (
         SELECT DATE(check_time) AS d, COUNT(DISTINCT student_id) AS day_count
         FROM zk_attendance_logs
         WHERE school_id = ? AND student_id IS NOT NULL
           AND DATE(check_time) >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
           AND DATE(check_time) <  DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         GROUP BY DATE(check_time)
       ) sub`,
      [schoolId]
    ) as any[];

    const thisWeek  = n(thisWeekRow.avg);
    const prevWeek  = n(prevWeekRow.avg);
    const weekDelta = prevWeek > 0 ? Math.round(((thisWeek - prevWeek) / prevWeek) * 100) : null;
    const weekTrend =
      weekDelta === null ? 'no_data'
      : weekDelta > 5    ? 'improving'
      : weekDelta < -5   ? 'declining'
                         : 'stable';

    const scanRatePct = totalEnrolled > 0
      ? Math.round((totalScanned / totalEnrolled) * 100)
      : 0;

    return NextResponse.json({
      ok: true,
      data: {
        tracked_days:            trackedDays,
        total_enrolled:          totalEnrolled,
        total_scanned_students:  totalScanned,
        never_scanned:           Math.max(0, totalEnrolled - totalScanned),
        avg_daily_attendance:    avgDaily,
        scan_rate_pct:           scanRatePct,
        today_scans:             todayScans,
        week_avg:                Math.round(thisWeek),
        prev_week_avg:           Math.round(prevWeek),
        week_trend:              weekTrend,
        week_delta_pct:          weekDelta,
        first_day:               windowRow.first_day,
        last_day:                windowRow.last_day,
        data_source:             'zk_biometric',
        data_note:               'Derived from ZK biometric device scans. student_attendance table is empty.',
      },
    });

  } catch (e: any) {
    console.error('attendance-overview error:', e);
    return NextResponse.json({ error: 'Failed to fetch attendance overview' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
