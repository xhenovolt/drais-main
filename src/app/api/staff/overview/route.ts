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

    const [staffCounts, deptCount, attendanceAvg] = await Promise.all([
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
    ]);

    const stats = {
      total_staff: Number(staffCounts[0]?.total_staff ?? 0),
      active_staff: Number(staffCounts[0]?.active_staff ?? 0),
      total_departments: Number(deptCount[0]?.total_departments ?? 0),
      avg_attendance: Number(attendanceAvg[0]?.avg_attendance ?? 0),
    };

    return ok('Staff overview loaded', stats);
  } catch (error: any) {
    console.error('Staff overview error:', error);
    return fail('Failed to load staff overview', 500);
  }
}
