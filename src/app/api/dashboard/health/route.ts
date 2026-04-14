import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { calculateHealthScore } from '@/lib/narrativeEngine';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { schoolId } = session;
  let conn;

  try {
    conn = await getConnection();

    const [
      topStudents,
      bottomStudents,
      mostConsistent,
      mostAbsent,
      classBestAttendance,
      classWorstAttendance,
      genderAttendance,
      feeCompliance,
      weeklyTrend,
      avgAcademic,
      predictiveForecast,
      chronicAbsent,
    ] = await Promise.all([

      // ── Top 5 performing students (by avg score in class_results) ─────────────
      conn.execute(
        `SELECT
           CONCAT(p.first_name,' ',p.last_name) AS name,
           COALESCE(c.name,'Unknown')            AS class_name,
           ROUND(AVG(cr.score),1)               AS avg_score,
           MAX(cr.grade)                        AS grade
         FROM class_results cr
         JOIN students s ON s.id = cr.student_id AND s.school_id = ?
         JOIN people   p ON p.id = s.person_id
         LEFT JOIN classes c ON c.id = cr.class_id AND c.school_id = ?
         WHERE cr.score IS NOT NULL
         GROUP BY cr.student_id, p.first_name, p.last_name, c.name
         ORDER BY avg_score DESC
         LIMIT 5`,
        [schoolId, schoolId],
      ),

      // ── Bottom 5 performing students ────────────────────────────────────
      conn.execute(
        `SELECT
           CONCAT(p.first_name,' ',p.last_name) AS name,
           COALESCE(c.name,'Unknown')            AS class_name,
           ROUND(AVG(cr.score),1)               AS avg_score,
           MAX(cr.grade)                        AS grade
         FROM class_results cr
         JOIN students s ON s.id = cr.student_id AND s.school_id = ?
         JOIN people   p ON p.id = s.person_id
         LEFT JOIN classes c ON c.id = cr.class_id AND c.school_id = ?
         WHERE cr.score IS NOT NULL AND cr.score > 0
         GROUP BY cr.student_id, p.first_name, p.last_name, c.name
         ORDER BY avg_score ASC
         LIMIT 5`,
        [schoolId, schoolId],
      ),

      // ── Most consistent attendees (30d) ───────────────────────────────────
      conn.execute(
        `SELECT
           CONCAT(p.first_name,' ',p.last_name)  AS name,
           COALESCE(c.name,'Unknown')             AS class_name,
           COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.date END) AS present_days,
           COUNT(DISTINCT sa.date)                AS total_days,
           ROUND(COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.date END)
                 / NULLIF(COUNT(DISTINCT sa.date),0) * 100, 1)                        AS rate
         FROM students s
         JOIN people p      ON p.id = s.person_id
         JOIN enrollments e ON e.student_id = s.id AND e.school_id = s.school_id AND e.status='active'
         JOIN classes     c ON c.id = e.class_id  AND c.school_id  = s.school_id
         LEFT JOIN student_attendance sa ON sa.student_id = s.id
                                          AND sa.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         WHERE s.school_id = ? AND s.status = 'active'
         GROUP BY s.id, p.first_name, p.last_name, c.name
         HAVING total_days >= 5
         ORDER BY rate DESC, present_days DESC
         LIMIT 5`,
        [schoolId],
      ),

      // ── Most absent learners (30d) ────────────────────────────────────────
      conn.execute(
        `SELECT
           CONCAT(p.first_name,' ',p.last_name)  AS name,
           COALESCE(c.name,'Unknown')             AS class_name,
           COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) AS absent_days,
           COUNT(DISTINCT sa.date)                           AS total_days,
           ROUND(COUNT(CASE WHEN sa.status = 'absent' THEN 1 END)
                 / NULLIF(COUNT(DISTINCT sa.date),0) * 100, 1)  AS absence_rate
         FROM students s
         JOIN people p      ON p.id = s.person_id
         JOIN enrollments e ON e.student_id = s.id AND e.school_id = s.school_id AND e.status='active'
         JOIN classes     c ON c.id = e.class_id  AND c.school_id  = s.school_id
         LEFT JOIN student_attendance sa ON sa.student_id = s.id
                                          AND sa.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         WHERE s.school_id = ? AND s.status = 'active'
         GROUP BY s.id, p.first_name, p.last_name, c.name
         HAVING absent_days >= 3
         ORDER BY absent_days DESC, absence_rate DESC
         LIMIT 5`,
        [schoolId],
      ),

      // ── Best attending class today ────────────────────────────────────────
      conn.execute(
        `SELECT
           c.name AS class_name,
           COUNT(DISTINCT s.id)  AS total,
           COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END) AS present,
           ROUND(COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END)
                 / NULLIF(COUNT(DISTINCT s.id),0) * 100, 1) AS rate
         FROM classes c
         JOIN enrollments e ON e.class_id  = c.id AND e.school_id = c.school_id AND e.status='active'
         JOIN students    s ON s.id = e.student_id AND s.status = 'active'
         LEFT JOIN student_attendance sa ON sa.student_id = s.id AND sa.date = CURDATE()
         WHERE c.school_id = ?
         GROUP BY c.id, c.name
         HAVING total >= 5
         ORDER BY rate DESC
         LIMIT 3`,
        [schoolId],
      ),

      // ── Worst attending class today ───────────────────────────────────────
      conn.execute(
        `SELECT
           c.name AS class_name,
           COUNT(DISTINCT s.id)  AS total,
           COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END) AS present,
           ROUND(COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END)
                 / NULLIF(COUNT(DISTINCT s.id),0) * 100, 1) AS rate
         FROM classes c
         JOIN enrollments e ON e.class_id  = c.id AND e.school_id = c.school_id AND e.status='active'
         JOIN students    s ON s.id = e.student_id AND s.status = 'active'
         LEFT JOIN student_attendance sa ON sa.student_id = s.id AND sa.date = CURDATE()
         WHERE c.school_id = ?
         GROUP BY c.id, c.name
         HAVING total >= 5
         ORDER BY rate ASC
         LIMIT 3`,
        [schoolId],
      ),

      // ── Gender attendance today ───────────────────────────────────────────
      conn.execute(
        `SELECT
           COALESCE(p.gender,'Unknown') AS gender,
           COUNT(DISTINCT s.id)         AS total,
           COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END) AS present,
           ROUND(COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END)
                 / NULLIF(COUNT(DISTINCT s.id),0) * 100, 1) AS rate
         FROM students s
         JOIN people p ON p.id = s.person_id
         LEFT JOIN student_attendance sa ON sa.student_id = s.id AND sa.date = CURDATE()
         WHERE s.school_id = ? AND s.status='active'
         GROUP BY p.gender`,
        [schoolId],
      ),

      // ── Fee compliance ────────────────────────────────────────────────────
      conn.execute(
        `SELECT
           COUNT(DISTINCT s.id)                                                               AS total_students,
           COUNT(DISTINCT CASE WHEN sfi.balance IS NULL OR sfi.balance <= 0 THEN s.id END)   AS compliant,
           COUNT(DISTINCT CASE WHEN sfi.balance > 0                         THEN s.id END)   AS in_arrears,
           COALESCE(SUM(CASE WHEN sfi.balance > 0 THEN sfi.balance ELSE 0 END),0)            AS total_outstanding
         FROM students s
         LEFT JOIN student_fee_items sfi ON sfi.student_id = s.id AND sfi.balance > 0
         WHERE s.school_id = ? AND s.status = 'active'`,
        [schoolId],
      ),

      // ── 10-day trend for forecast ─────────────────────────────────────────
      conn.execute(
        `SELECT
           sa.date,
           COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END) AS present,
           COUNT(DISTINCT CASE WHEN sa.status = 'absent'            THEN sa.student_id END) AS absent
         FROM student_attendance sa
         INNER JOIN students ss ON ss.id = sa.student_id AND ss.school_id = ?
         WHERE sa.date >= DATE_SUB(CURDATE(), INTERVAL 10 DAY)
         GROUP BY sa.date
         ORDER BY sa.date ASC`,
        [schoolId],
      ),

      // ── Avg academic score (from class_results) ─────────────────────────────
      conn.execute(
        `SELECT ROUND(AVG(cr.score),1)           AS avg_score,
                COUNT(DISTINCT cr.student_id)    AS students_with_results
         FROM class_results cr
         JOIN students s ON s.id = cr.student_id AND s.school_id = ?
         WHERE cr.score IS NOT NULL`,
        [schoolId],
      ),

      // ── Predictive: avg attendance per day last 7 days (for linear extrapolation) ──
      conn.execute(
        `SELECT
           sa.date,
           COUNT(DISTINCT CASE WHEN sa.status IN ('present','late') THEN sa.student_id END) AS present,
           COUNT(DISTINCT sa.student_id) AS total_marked
         FROM student_attendance sa
         INNER JOIN students ss ON ss.id = sa.student_id AND ss.school_id = ?
         WHERE sa.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         GROUP BY sa.date
         ORDER BY sa.date ASC`,
        [schoolId],
      ),

      // ── Chronic absentees (< 60% in 14d, at least 5 days recorded) ───────
      conn.execute(
        `SELECT
           CONCAT(p.first_name,' ',p.last_name) AS name,
           COALESCE(c.name,'Unknown')            AS class_name,
           SUM(CASE WHEN sa.status='absent' THEN 1 ELSE 0 END)                  AS absent_days,
           SUM(CASE WHEN sa.status IN ('present','late') THEN 1 ELSE 0 END)     AS present_days,
           COUNT(sa.id)                                                          AS total_days,
           ROUND(SUM(CASE WHEN sa.status IN ('present','late') THEN 1 ELSE 0 END)
                 / NULLIF(COUNT(sa.id),0) * 100, 1)                             AS rate
         FROM students s
         JOIN people p      ON p.id = s.person_id
         JOIN enrollments e ON e.student_id = s.id AND e.school_id = s.school_id AND e.status='active'
         JOIN classes     c ON c.id = e.class_id  AND c.school_id  = s.school_id
         JOIN student_attendance sa ON sa.student_id = s.id
                                    AND sa.date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
         WHERE s.school_id = ? AND s.status='active'
         GROUP BY s.id, p.first_name, p.last_name, c.name
         HAVING total_days >= 5 AND rate < 60
         ORDER BY rate ASC
         LIMIT 10`,
        [schoolId],
      ),
    ]);

    // ── Normalise ─────────────────────────────────────────────────────────
    const rawTop      = (topStudents[0]           as any[]);
    const rawBottom   = (bottomStudents[0]         as any[]);
    const rawConsist  = (mostConsistent[0]         as any[]);
    const rawAbsent   = (mostAbsent[0]             as any[]);
    const rawBestCls  = (classBestAttendance[0]   as any[]);
    const rawWorstCls = (classWorstAttendance[0]  as any[]);
    const rawGender   = (genderAttendance[0]      as any[]);
    const feeRow      = (feeCompliance[0]          as any[])[0] ?? {};
    const trendDays   = (weeklyTrend[0]            as any[]);
    const acadRow     = (avgAcademic[0]            as any[])[0] ?? {};
    const forecastDays= (predictiveForecast[0]     as any[]);
    const rawChronic  = (chronicAbsent[0]          as any[]);

    // ── Fee compliance % ──────────────────────────────────────────────────
    const feeTotal    = n(feeRow.total_students);
    const feeCompliantPct = feeTotal > 0
      ? Math.round((n(feeRow.compliant) / feeTotal) * 100) : 100;

    // ── Predictive linear extrapolation (14-day forecast) ────────────────
    const forecast = buildForecast(forecastDays, feeTotal);

    // ── School health score ───────────────────────────────────────────────
    const deviceRow = { online: 1, total: 1 }; // will get from intelligence endpoint; default safe
    const healthScore = calculateHealthScore({
      attendanceRate:  forecast.currentRate,
      weeklyTrend:     trendDays.map((d: any) => ({ present: n(d.present), absent: n(d.absent) })),
      riskStudentsPct: rawChronic.length > 0 && feeTotal > 0
        ? (rawChronic.length / feeTotal) * 100 : 0,
      deviceOnlinePct: 100,
      feeCompliancePct: feeCompliantPct,
      avgAcademicScore: n(acadRow.avg_score),
    });

    // ── Gender analysis narrative ─────────────────────────────────────────
    const genders = rawGender.map((g: any) => ({
      gender:  g.gender === 'M' ? 'Male' : g.gender === 'F' ? 'Female' : String(g.gender),
      total:   n(g.total),
      present: n(g.present),
      rate:    n(g.rate),
    }));
    const genderInsight = buildGenderInsight(genders);

    return NextResponse.json({
      success: true,
      data: {
        health_score: healthScore,
        top_students:    rawTop.map(normaliseStudent),
        bottom_students: rawBottom.map(normaliseStudent),
        most_consistent: rawConsist.map((s: any) => ({ name: s.name, class_name: s.class_name, rate: n(s.rate), present_days: n(s.present_days) })),
        most_absent:     rawAbsent.map((s: any) => ({ name: s.name, class_name: s.class_name, absent_days: n(s.absent_days), absence_rate: n(s.absence_rate) })),
        class_best:      rawBestCls.map(normaliseClass),
        class_worst:     rawWorstCls.map(normaliseClass),
        genders,
        gender_insight:  genderInsight,
        fee_compliance:  {
          total:      feeTotal,
          compliant:  n(feeRow.compliant),
          in_arrears: n(feeRow.in_arrears),
          pct:        feeCompliantPct,
          outstanding: n(feeRow.total_outstanding),
        },
        academic: {
          avg_score:           n(acadRow.avg_score),
          students_with_results: n(acadRow.students_with_results),
          has_data:            n(acadRow.students_with_results) > 0,
        },
        chronic_absent: rawChronic.map((s: any) => ({
          name: s.name, class_name: s.class_name, absent_days: n(s.absent_days), rate: n(s.rate),
        })),
        forecast,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[health] Error:', msg);
    return NextResponse.json({ error: 'Failed to load school health data', detail: msg }, { status: 500 });
  } finally {
    if (conn && typeof (conn as any).release === 'function') (conn as any).release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function n(v: unknown) { return Number(v) || 0; }

function normaliseStudent(s: any) {
  return { name: String(s.name ?? ''), class_name: String(s.class_name ?? ''), avg_score: n(s.avg_score), grade: s.grade ?? '' };
}
function normaliseClass(c: any) {
  return { class_name: String(c.class_name ?? ''), total: n(c.total), present: n(c.present), rate: n(c.rate) };
}

function buildGenderInsight(genders: { gender: string; total: number; present: number; rate: number }[]): string {
  if (genders.length === 0) return 'No gender breakdown available for today.';
  const male   = genders.find(g => g.gender === 'Male');
  const female = genders.find(g => g.gender === 'Female');
  if (!male && !female) return 'Gender data is not configured in student profiles.';
  if (!male || !female) {
    const g = male ?? female!;
    return `${g.gender} attendance today: ${g.rate}% (${g.present}/${g.total} students).`;
  }
  const diff = Math.abs(male.rate - female.rate);
  const higher = male.rate >= female.rate ? 'Male' : 'Female';
  const lower  = male.rate >= female.rate ? 'Female' : 'Male';
  if (diff < 5) {
    return `Male and female attendance are equivalent today (${male.rate}% vs ${female.rate}%) — no gender disparity.`;
  }
  return `${higher} attendance (${Math.max(male.rate, female.rate)}%) is ${diff.toFixed(1)} percentage points higher than ${lower} (${Math.min(male.rate, female.rate)}%) — this imbalance should be monitored.`;
}

interface ForecastResult {
  currentRate: number;
  forecastRate14d: number | null;
  forecastDirection: 'up' | 'down' | 'stable';
  forecastSentence: string;
  chronicRiskCount: number;
  classDecliningCount: number;
}

function buildForecast(
  days: { date: string; present: number; total_marked: number }[],
  totalStudents: number,
): ForecastResult {
  if (days.length < 3) {
    return {
      currentRate: 0,
      forecastRate14d: null,
      forecastDirection: 'stable',
      forecastSentence: 'Insufficient attendance history to forecast trends. At least 3 days of data required.',
      chronicRiskCount: 0,
      classDecliningCount: 0,
    };
  }

  const rates = days.map(d => {
    const denom = totalStudents > 0 ? totalStudents : n(d.total_marked);
    return denom > 0 ? (n(d.present) / denom) * 100 : 0;
  }).filter(r => r > 0);

  if (rates.length < 2) {
    return {
      currentRate: rates[0] ?? 0,
      forecastRate14d: null,
      forecastDirection: 'stable',
      forecastSentence: 'Not enough attendance data to make a reliable forecast.',
      chronicRiskCount: 0,
      classDecliningCount: 0,
    };
  }

  const currentRate = rates[rates.length - 1];
  // Simple linear regression-style slope
  const slope = (rates[rates.length - 1] - rates[0]) / (rates.length - 1);
  const forecastRate14d = Math.min(100, Math.max(0, currentRate + slope * 14));

  let forecastDirection: 'up' | 'down' | 'stable' = 'stable';
  let forecastSentence = '';

  if (slope < -1) {
    forecastDirection = 'down';
    forecastSentence = `If current attendance trends continue, the attendance rate may drop to approximately ${forecastRate14d.toFixed(1)}% within 2 weeks. Immediate attention is recommended.`;
  } else if (slope > 0.5) {
    forecastDirection = 'up';
    forecastSentence = `Attendance is trending upward. If this continues, the rate could reach ${forecastRate14d.toFixed(1)}% within 2 weeks — above current ${currentRate.toFixed(1)}%.`;
  } else {
    forecastDirection = 'stable';
    forecastSentence = `Attendance is stable around ${currentRate.toFixed(1)}%. No major change is predicted in the next 2 weeks based on current patterns.`;
  }

  return {
    currentRate,
    forecastRate14d: Math.round(forecastRate14d * 10) / 10,
    forecastDirection,
    forecastSentence,
    chronicRiskCount: 0,
    classDecliningCount: 0,
  };
}
