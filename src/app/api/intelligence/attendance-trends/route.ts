import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

function n(v: unknown): number { return Number(v) || 0; }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/intelligence/attendance-trends
// Daily and weekly attendance breakdown from zk_attendance_logs.
// Returns trend direction with confidence.
//
// Query params:
//   days  — lookback window in days (default 14, max 60)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  const days = Math.min(60, Math.max(7, n(new URL(req.url).searchParams.get('days')) || 14));

  let connection;
  try {
    connection = await getConnection();

    // ── Total enrolled (denominator for %) ───────────────────────────────
    const [[enrRow]] = await connection.execute(
      `SELECT COUNT(DISTINCT e.student_id) AS total
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       WHERE s.school_id = ? AND e.status = 'active' AND s.deleted_at IS NULL`,
      [schoolId]
    ) as any[];
    const totalEnrolled = n(enrRow.total) || 1; // avoid div-by-zero

    // ── Daily breakdown ───────────────────────────────────────────────────
    const [dailyRows] = await connection.execute(
      `SELECT
         DATE(check_time)                   AS att_date,
         COUNT(DISTINCT student_id)         AS distinct_students,
         COUNT(*)                           AS total_scans
       FROM zk_attendance_logs
       WHERE school_id = ?
         AND student_id IS NOT NULL
         AND DATE(check_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(check_time)
       ORDER BY att_date ASC`,
      [schoolId, days]
    ) as any[];

    // Days of week labels
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daily = (dailyRows as any[]).map((r: any) => {
      const d = new Date(r.att_date);
      return {
        date:              r.att_date,
        day:               DOW[d.getDay()],
        distinct_students: n(r.distinct_students),
        total_scans:       n(r.total_scans),
        attendance_pct:    Math.round((n(r.distinct_students) / totalEnrolled) * 100),
      };
    });

    // ── Weekly aggregation ────────────────────────────────────────────────
    // Group daily rows into ISO weeks
    const weekMap = new Map<string, { dates: string[]; students: number[]; scans: number[] }>();
    for (const row of daily) {
      const d = new Date(row.date);
      // ISO week start = Monday
      const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
      const monday = new Date(d);
      monday.setDate(d.getDate() - dow);
      const key = monday.toISOString().split('T')[0];
      if (!weekMap.has(key)) weekMap.set(key, { dates: [], students: [], scans: [] });
      const w = weekMap.get(key)!;
      w.dates.push(row.date);
      w.students.push(row.distinct_students);
      w.scans.push(row.total_scans);
    }

    const weekly = Array.from(weekMap.entries()).map(([weekStart, w]) => {
      const avgStudents = w.students.reduce((a, b) => a + b, 0) / w.students.length;
      const lastDate    = new Date(w.dates[w.dates.length - 1]);
      const mmDd        = `${lastDate.getMonth() + 1}/${lastDate.getDate()}`;
      return {
        week_start:        weekStart,
        label:             `w/e ${mmDd}`,
        school_days:       w.dates.length,
        avg_daily_students: Math.round(avgStudents),
        total_scans:       w.scans.reduce((a, b) => a + b, 0),
        attendance_pct:    Math.round((avgStudents / totalEnrolled) * 100),
      };
    });

    // ── Trend detection (linear slope on daily distinct_students) ─────────
    let trend: 'improving' | 'declining' | 'stable' | 'no_data' = 'no_data';
    let trendConfidence = 0;

    if (daily.length >= 4) {
      // Simple linear regression on daily distinct_students
      const xs = daily.map((_, i) => i);
      const ys = daily.map(r => r.distinct_students);
      const n2  = xs.length;
      const sumX  = xs.reduce((a, b) => a + b, 0);
      const sumY  = ys.reduce((a, b) => a + b, 0);
      const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
      const sumX2 = xs.reduce((s, x) => s + x * x, 0);
      const slope  = (n2 * sumXY - sumX * sumY) / (n2 * sumX2 - sumX * sumX);
      const avgY   = sumY / n2;

      // Confidence: how consistent is the direction (correlation coefficient |r|)
      const yMean  = avgY;
      const ssRes  = ys.reduce((s, y, i) => {
        const predicted = (sumY / n2) + slope * (xs[i] - sumX / n2);
        return s + (y - predicted) ** 2;
      }, 0);
      const ssTot  = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
      const r2     = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
      trendConfidence = Math.round(Math.sqrt(r2) * 100) / 100;

      // Slope threshold: ±0.5 students/day = meaningful
      trend = slope > 0.5 ? 'improving' : slope < -0.5 ? 'declining' : 'stable';
    }

    return NextResponse.json({
      ok: true,
      data: {
        daily,
        weekly,
        trend,
        trend_confidence: trendConfidence,
        total_enrolled: totalEnrolled,
        days_analysed: days,
      },
    });

  } catch (e: any) {
    console.error('attendance-trends error:', e);
    return NextResponse.json({ error: 'Failed to fetch attendance trends' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
