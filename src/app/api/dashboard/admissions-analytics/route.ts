import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * GET /api/dashboard/admissions-analytics
 * 
 * Returns admission insights:
 * - Learners admitted today
 * - Total learners admitted so far
 * - Learners admitted this month
 * - Daily admission trend
 * - Average admissions per week
 * - Peak admission periods
 */
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below

    const connection = await getConnection();
    try {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      // 1. Learners admitted today
      const [toadayRows]: any = await connection.execute(
        `SELECT COUNT(*) as count FROM students 
         WHERE school_id = ? AND DATE(admission_date) = ? AND deleted_at IS NULL`,
        [schoolId, today]
      );
      const admittedToday = toadayRows[0]?.count || 0;

      // 2. Total learners admitted so far
      const [totalRows]: any = await connection.execute(
        `SELECT COUNT(*) as count FROM students 
         WHERE school_id = ? AND deleted_at IS NULL`,
        [schoolId]
      );
      const totalAdmitted = totalRows[0]?.count || 0;

      // 3. Learners admitted this month
      const [monthRows]: any = await connection.execute(
        `SELECT COUNT(*) as count FROM students 
         WHERE school_id = ? AND DATE(admission_date) >= ? AND deleted_at IS NULL`,
        [schoolId, monthStart]
      );
      const admittedThisMonth = monthRows[0]?.count || 0;

      // 4. Daily admission trend (last 30 days)
      const [dailyRows]: any = await connection.execute(
        `SELECT 
          DATE(admission_date) as admission_date,
          COUNT(*) as count
         FROM students
         WHERE school_id = ? 
           AND admission_date >= ? 
           AND deleted_at IS NULL
         GROUP BY DATE(admission_date)
         ORDER BY admission_date ASC`,
        [schoolId, thirtyDaysAgo]
      );

      // Calculate statistics from daily data
      let totalLast30Days = 0;
      let peakDay = { date: '', count: 0 };
      const dailyDataFormatted: Array<{ date: string; count: number }> = [];

      if (Array.isArray(dailyRows)) {
        dailyRows.forEach((row: any) => {
          const count = row.count || 0;
          totalLast30Days += count;
          if (count > peakDay.count) {
            peakDay = { date: row.admission_date, count };
          }
          dailyDataFormatted.push({
            date: row.admission_date,
            count: count,
          });
        });
      }

      // 5. Weekly average
      const weeksInPeriod = Math.max(1, Math.ceil(dailyDataFormatted.length / 7));
      const weeklyAverage = Math.round(totalLast30Days / weeksInPeriod);

      // 6. Admission trend by week (last 12 weeks)
      const [weeklyRows]: any = await connection.execute(
        `SELECT 
          YEARWEEK(admission_date) as week_year,
          COUNT(*) as count
         FROM students
         WHERE school_id = ? 
           AND admission_date >= DATE_SUB(CURDATE(), INTERVAL 12 WEEK)
           AND deleted_at IS NULL
         GROUP BY YEARWEEK(admission_date)
         ORDER BY week_year ASC`,
        [schoolId]
      );

      const weeklyData = Array.isArray(weeklyRows)
        ? weeklyRows.map((row: any) => ({
            week: row.week_year,
            count: row.count || 0,
          }))
        : [];

      // 7. Get distribution by class (who are we admitting to?)
      const [classDist]: any = await connection.execute(
        `SELECT 
          c.name as class_name,
          COUNT(DISTINCT s.id) as count
         FROM students s
         LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
         LEFT JOIN classes c ON e.class_id = c.id
         WHERE s.school_id = ? AND s.deleted_at IS NULL
         GROUP BY c.id, c.name
         ORDER BY count DESC
         LIMIT 5`,
        [schoolId]
      );

      const classDistribution = Array.isArray(classDist)
        ? classDist.map((row: any) => ({
            class: row.class_name || 'No Class',
            count: row.count || 0,
          }))
        : [];

      return NextResponse.json({
        success: true,
        data: {
          summary: {
            admittedToday,
            totalAdmitted,
            admittedThisMonth,
            enrollmentRate: totalAdmitted > 0 ? `${Math.round((admittedThisMonth / totalAdmitted) * 100)}%` : '0%',
          },
          trends: {
            dailyData: dailyDataFormatted,
            weeklyData,
            peakDay,
            weeklyAverage,
            totalLast30Days,
          },
          distribution: {
            byClass: classDistribution,
          },
        },
      });
    } finally {
      await connection.end();
    }
  } catch (error: any) {
    console.error('Error fetching admissions analytics:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
