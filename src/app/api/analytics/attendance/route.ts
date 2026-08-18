/**
 * Stability-roadmap Phase 3: repointed at attendance_records — the
 * table the attendance ENGINE (src/lib/attendance/engine) actually
 * writes. Previously read student_attendance / staff_attendance, which
 * are the pre-engine schema and were never migrated or dropped —
 * measured 0 rows in each, vs 10,887 student + 6,750 staff rows in
 * attendance_records. The route returned success with empty arrays
 * rather than erroring, which is why this read as "no attendance yet"
 * rather than as a bug for so long.
 *
 * attendance_records is keyed by (person_id, role_type), not
 * student_id/staff_id — the join to students/staff goes through people.
 * Reference implementation already existed at /api/reports/custom's
 * 'attendance' dataset; this follows the same join shape.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const __denied = await checkModule(session.schoolId, 'analytics');
    if (__denied) return __denied;
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const days = parseInt(searchParams.get('days') || '30', 10);

    const connection = await getConnection();

    // Student attendance trends
    const studentAttendanceTrends = await connection.execute(`
      SELECT
        ar.attendance_date as attendance_date,
        c.name as class_name,
        COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent_count,
        COUNT(ar.id) as total_marked,
        ROUND(COUNT(CASE WHEN ar.status = 'present' THEN 1 END) / NULLIF(COUNT(ar.id), 0) * 100, 2) as attendance_rate
      FROM attendance_records ar
      JOIN students s ON s.person_id = ar.person_id AND ar.role_type = 'student'
        AND s.school_id = ar.school_id AND s.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      WHERE ar.school_id = ?
      AND ar.attendance_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY ar.attendance_date, c.id, c.name
      ORDER BY attendance_date DESC, c.name
    `, [schoolId, days]);

    // Chronic absentees (students with poor attendance)
    const chronicAbsentees = await connection.execute(`
      SELECT
        s.id as student_id,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        s.admission_no,
        c.name as class_name,
        COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_days,
        COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent_days,
        COUNT(ar.id) as total_days,
        ROUND(COUNT(CASE WHEN ar.status = 'present' THEN 1 END) / NULLIF(COUNT(ar.id), 0) * 100, 2) as attendance_rate,
        MAX(CASE WHEN ar.status = 'present' THEN ar.attendance_date END) as last_present_date
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      LEFT JOIN attendance_records ar ON ar.person_id = s.person_id AND ar.role_type = 'student'
        AND ar.school_id = s.school_id
        AND ar.attendance_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY s.id, p.first_name, p.last_name, s.admission_no, c.name
      HAVING attendance_rate < 80 OR absent_days > 5
      ORDER BY attendance_rate ASC, absent_days DESC
    `, [days, schoolId]);

    // Staff attendance summary
    const staffAttendanceSummary = await connection.execute(`
      SELECT
        st.id as staff_id,
        CONCAT(p.first_name, ' ', p.last_name) as staff_name,
        st.position,
        COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_days,
        COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent_days,
        COUNT(ar.id) as total_days,
        ROUND(COUNT(CASE WHEN ar.status = 'present' THEN 1 END) / NULLIF(COUNT(ar.id), 0) * 100, 2) as attendance_rate
      FROM staff st
      JOIN people p ON st.person_id = p.id AND p.deleted_at IS NULL
      LEFT JOIN attendance_records ar ON ar.person_id = st.person_id AND ar.role_type = 'staff'
        AND ar.school_id = st.school_id
        AND ar.attendance_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      WHERE st.school_id = ? AND st.status = 'active'
      GROUP BY st.id, p.first_name, p.last_name, st.position
      ORDER BY attendance_rate DESC
    `, [days, schoolId]);

    // Daily attendance overview
    const dailyOverview = await connection.execute(`
      SELECT
        ar.attendance_date as date,
        ar.role_type as type,
        COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present,
        COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent,
        COUNT(ar.id) as total
      FROM attendance_records ar
      WHERE ar.school_id = ?
      AND ar.attendance_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY ar.attendance_date, ar.role_type
      ORDER BY date DESC, type
    `, [schoolId, days]);

    // Attendance correlation with performance
    const attendancePerformanceCorrelation = await connection.execute(`
      SELECT
        s.id as student_id,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        c.name as class_name,
        ROUND(COUNT(CASE WHEN ar.status = 'present' THEN 1 END) / NULLIF(COUNT(ar.id), 0) * 100, 2) as attendance_rate,
        AVG(cr.score) as avg_performance,
        COUNT(cr.id) as subject_count
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      LEFT JOIN attendance_records ar ON ar.person_id = s.person_id AND ar.role_type = 'student'
        AND ar.school_id = s.school_id
        AND ar.attendance_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      LEFT JOIN class_results cr ON s.id = cr.student_id
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY s.id, p.first_name, p.last_name, c.name
      HAVING subject_count > 0
      ORDER BY attendance_rate DESC, avg_performance DESC
    `, [days, schoolId]);

    await connection.end();

    return NextResponse.json({
      success: true,
      data: {
        studentAttendanceTrends: studentAttendanceTrends[0],
        chronicAbsentees: chronicAbsentees[0],
        staffAttendanceSummary: staffAttendanceSummary[0],
        dailyOverview: dailyOverview[0],
        attendancePerformanceCorrelation: attendancePerformanceCorrelation[0]
      }
    });
  } catch (error: any) {
    console.error('Error fetching attendance analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
