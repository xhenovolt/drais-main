import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { ok, fail } from '@/lib/apiResponse';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return fail('Not authenticated', 401);
    }
    const schoolId = session.schoolId;

    const [staffCounts, deptCount, attendanceAvg, recentStaff, byDept] = await Promise.all([
      query(
        `SELECT
           COUNT(*) AS total_staff,
           SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) AS active_staff
         FROM staff s
         WHERE s.school_id = ? AND s.deleted_at IS NULL`,
        [schoolId],
      ),
      query(
        `SELECT COUNT(*) AS total_departments
         FROM departments
         WHERE school_id = ? AND deleted_at IS NULL`,
        [schoolId],
      ),
      query(
        `SELECT
           ROUND(
             COALESCE(
               SUM(CASE WHEN sa.status = 'present' THEN 1 ELSE 0 END) * 100.0
               / NULLIF(COUNT(*), 0),
             0),
           1) AS avg_attendance
         FROM staff_attendance sa
         JOIN staff s ON sa.staff_id = s.id
         WHERE s.school_id = ? AND s.deleted_at IS NULL
           AND sa.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
        [schoolId],
      ),
      // Recent staff (last 8 added), name from people with denorm fallback.
      query(
        `SELECT
           s.id,
           s.staff_no,
           COALESCE(NULLIF(pe.first_name, ''), NULLIF(s.first_name, ''), '') AS first_name,
           COALESCE(NULLIF(pe.last_name,  ''), NULLIF(s.last_name,  ''), '') AS last_name,
           pe.photo_url,
           s.status,
           p.name AS position_name,
           d.name AS department_name,
           s.created_at
         FROM staff s
         LEFT JOIN people      pe ON pe.id = s.person_id
         LEFT JOIN positions   p  ON p.id  = s.position_id
         LEFT JOIN departments d  ON d.id  = s.department_id
         WHERE s.school_id = ? AND s.deleted_at IS NULL
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT 8`,
        [schoolId],
      ),
      // Headcount by department, for the breakdown panel.
      query(
        `SELECT
           d.id        AS department_id,
           d.name      AS department_name,
           COUNT(s.id) AS staff_count
         FROM departments d
         LEFT JOIN staff s
           ON s.department_id = d.id
          AND s.school_id     = d.school_id
          AND s.deleted_at   IS NULL
          AND s.status        = 'active'
         WHERE d.school_id = ? AND d.deleted_at IS NULL
         GROUP BY d.id, d.name
         ORDER BY staff_count DESC, d.name`,
        [schoolId],
      ),
    ]);

    const stats = {
      total_staff:       Number(staffCounts[0]?.total_staff ?? 0),
      active_staff:      Number(staffCounts[0]?.active_staff ?? 0),
      total_departments: Number(deptCount[0]?.total_departments ?? 0),
      avg_attendance:    Number(attendanceAvg[0]?.avg_attendance ?? 0),
      recent_staff:      recentStaff,
      by_department:     byDept,
    };

    return ok('Staff overview loaded', stats);
  } catch (error: any) {
    console.error('Staff overview error:', error);
    return fail('Failed to load staff overview', 500);
  }
}
