import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

function n(v: unknown): number { return Number(v) || 0; }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/intelligence/attendance-risk
// Per-student attendance risk signals derived from zk_attendance_logs.
//
// Risk categories (among students who appeared in ZK at least once):
//   recently_absent  — appeared before but NOT in last 3 school days school was open
//   sparse           — appeared < 50% of tracked school days
//
// Query params:
//   limit  — max students to return (default 50)
//   class_id — filter by class
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  const { searchParams } = new URL(req.url);
  const limit   = Math.min(200, Math.max(1, n(searchParams.get('limit')) || 50));
  const classId = searchParams.get('class_id');

  let connection;
  try {
    connection = await getConnection();

    // ── Total school days tracked ─────────────────────────────────────────
    const [[{ tracked_days }]] = await connection.execute(
      `SELECT COUNT(DISTINCT DATE(check_time)) AS tracked_days
       FROM zk_attendance_logs WHERE school_id = ?`,
      [schoolId]
    ) as any[];
    const totalDays = n(tracked_days);

    if (totalDays === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          summary: { recently_absent: 0, sparse: 0, total_at_risk: 0 },
          students: [],
          tracked_days: 0,
          data_note: 'No biometric data available for this school yet.',
        },
      });
    }

    // ── The last 3 school days (days school was open = any scan happened) ─
    const [last3DaysRows] = await connection.execute(
      `SELECT DISTINCT DATE(check_time) AS d
       FROM zk_attendance_logs WHERE school_id = ?
       ORDER BY d DESC LIMIT 3`,
      [schoolId]
    ) as any[];
    // cutoff: student must have appeared on at least 1 of last 3 days to be "not recently absent"
    const last3Dates = (last3DaysRows as any[]).map((r: any) => r.d);
    const cutoffDate = last3Dates.length > 0 ? last3Dates[last3Dates.length - 1] : null; // oldest of last 3

    // ── Per-student attendance stats ─────────────────────────────────────
    let classFilter = '';
    const params: any[] = [schoolId, schoolId];
    if (classId) {
      classFilter = 'AND s.class_id = ?';
      params.push(classId);
    }

    const [studentRows] = await connection.execute(
      `SELECT
         s.id                                         AS student_id,
         CONCAT(p.first_name, ' ', p.last_name)       AS name,
         s.admission_no,
         c.name                                       AS class_name,
         COUNT(DISTINCT DATE(z.check_time))           AS days_present,
         MAX(DATE(z.check_time))                      AS last_seen,
         MIN(DATE(z.check_time))                      AS first_seen
       FROM zk_attendance_logs z
       JOIN students s  ON s.id = z.student_id
       JOIN people   p  ON p.id = s.person_id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE z.school_id = ?
         AND z.student_id IS NOT NULL
         AND s.school_id  = ?
         ${classFilter}
       GROUP BY s.id, p.first_name, p.last_name, s.admission_no, c.name`,
      params
    ) as any[];

    // ── Flag students ─────────────────────────────────────────────────────
    const atRiskStudents: any[] = [];

    for (const row of studentRows as any[]) {
      const daysPresent   = n(row.days_present);
      const attendancePct = totalDays > 0 ? Math.round((daysPresent / totalDays) * 100) : 0;
      const lastSeen      = row.last_seen ? new Date(row.last_seen).toISOString().split('T')[0] : null;

      // recently_absent: was seen before, but not in the last 3 school days
      const recentlyAbsent =
        cutoffDate !== null &&
        lastSeen !== null &&
        lastSeen < cutoffDate;

      // sparse: appeared but < 50% of tracked days
      const sparse = attendancePct < 50 && daysPresent > 0;

      if (!recentlyAbsent && !sparse) continue;

      // Determine highest severity risk
      const risk =
        recentlyAbsent && sparse ? 'high'
        : recentlyAbsent          ? 'high'
                                  : 'medium';

      const reasons: string[] = [];
      if (recentlyAbsent) reasons.push(`Not seen in last 3 school days (last: ${lastSeen})`);
      if (sparse)         reasons.push(`Only present ${daysPresent}/${totalDays} days (${attendancePct}%)`);

      atRiskStudents.push({
        student_id:     n(row.student_id),
        name:           row.name,
        admission_no:   row.admission_no ?? null,
        class_name:     row.class_name   ?? null,
        risk,
        reasons,
        days_present:   daysPresent,
        tracked_days:   totalDays,
        attendance_pct: attendancePct,
        last_seen:      lastSeen,
        first_seen:     row.first_seen ? new Date(row.first_seen).toISOString().split('T')[0] : null,
      });
    }

    // Sort: high risk first, then by days_present ascending
    atRiskStudents.sort((a, b) => {
      if (a.risk !== b.risk) return a.risk === 'high' ? -1 : 1;
      return a.days_present - b.days_present;
    });

    const recentlyAbsentCount = atRiskStudents.filter(s => s.risk === 'high').length;
    const sparseCount         = atRiskStudents.filter(s => s.risk === 'medium').length;

    return NextResponse.json({
      ok: true,
      data: {
        summary: {
          recently_absent: recentlyAbsentCount,
          sparse:          sparseCount,
          total_at_risk:   atRiskStudents.length,
        },
        students:     atRiskStudents.slice(0, limit),
        tracked_days: totalDays,
        cutoff_date:  cutoffDate,
      },
    });

  } catch (e: any) {
    console.error('attendance-risk error:', e);
    return NextResponse.json({ error: 'Failed to fetch attendance risk' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
