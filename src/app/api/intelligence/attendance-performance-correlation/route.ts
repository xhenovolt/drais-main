import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

function n(v: unknown): number { return Number(v) || 0; }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/intelligence/attendance-performance-correlation
//
// Correlates attendance (from zk_attendance_logs) with academic scores
// (from class_results) for students who have BOTH data points.
//
// Groups students into 4 attendance tiers:
//   low    0–49%
//   medium 50–74%
//   good   75–89%
//   high   90–100%
//
// Returns:
//   data_available  — false if < 5 students have both attendance + results
//   quartiles       — avg score per attendance tier
//   scatter         — individual data points (up to 200)
//   correlation     — 'positive' | 'negative' | 'weak' | 'no_data'
//   insight         — human-readable interpretation
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  let connection;
  try {
    connection = await getConnection();

    // ── Total tracked days (denominator for attendance %) ─────────────────
    const [[{ tracked_days }]] = await connection.execute(
      `SELECT COUNT(DISTINCT DATE(check_time)) AS tracked_days
       FROM zk_attendance_logs WHERE school_id = ?`,
      [schoolId]
    ) as any[];
    const totalDays = n(tracked_days);

    // ── Per-student: attendance days + avg score ──────────────────────────
    // Only students who appear in BOTH tables
    const [studentRows] = await connection.execute(
      `SELECT
         s.id                                    AS student_id,
         CONCAT(p.first_name, ' ', p.last_name)  AS name,
         COUNT(DISTINCT DATE(z.check_time))      AS days_present,
         AVG(cr.score)                           AS avg_score,
         COUNT(cr.id)                            AS result_count,
         c.name                                  AS class_name
       FROM students s
       JOIN people p ON p.id = s.person_id
       JOIN zk_attendance_logs z
         ON z.student_id = s.id AND z.school_id = ?
       JOIN class_results cr
         ON cr.student_id = s.id AND cr.deleted_at IS NULL
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.school_id = ?
       GROUP BY s.id, p.first_name, p.last_name, c.name
       HAVING result_count >= 2
       LIMIT 500`,
      [schoolId, schoolId]
    ) as any[];

    if ((studentRows as any[]).length < 5) {
      // Check if we have attendance OR results (to give a better explanation)
      const [[{ att_count }]] = await connection.execute(
        `SELECT COUNT(DISTINCT student_id) att_count FROM zk_attendance_logs WHERE school_id = ? AND student_id IS NOT NULL`,
        [schoolId]
      ) as any[];
      const [[{ res_count }]] = await connection.execute(
        `SELECT COUNT(DISTINCT cr.student_id) res_count
         FROM class_results cr
         JOIN students s ON s.id = cr.student_id
         WHERE s.school_id = ? AND cr.deleted_at IS NULL`,
        [schoolId]
      ) as any[];

      const hasAttendance = n(att_count) > 0;
      const hasResults    = n(res_count) > 0;

      let note = 'This school has neither biometric attendance data nor academic results yet.';
      if (hasAttendance && !hasResults) {
        note = `This school has ${n(att_count)} students with biometric attendance data, but no academic results (class_results) recorded yet. Once exam results are entered, correlation analysis will activate.`;
      } else if (!hasAttendance && hasResults) {
        note = `This school has ${n(res_count)} students with academic results, but no biometric attendance data yet. Once a ZK/biometric device is set up and syncing, correlation analysis will activate.`;
      } else if (hasAttendance && hasResults) {
        note = 'Attendance and results exist for different student cohorts. Correlation requires the same students to appear in both datasets.';
      }

      return NextResponse.json({
        ok: true,
        data: {
          data_available: false,
          data_note: note,
          quartiles: [],
          scatter: [],
          correlation: 'no_data',
          insight: note,
        },
      });
    }

    // ── Build scatter points ───────────────────────────────────────────────
    const scatter = (studentRows as any[]).map((r: any) => {
      const attendance_pct = totalDays > 0
        ? Math.round((n(r.days_present) / totalDays) * 100)
        : 0;
      return {
        student_id:     n(r.student_id),
        name:           r.name,
        class_name:     r.class_name ?? null,
        attendance_pct,
        avg_score:      Math.round(n(r.avg_score) * 10) / 10,
        days_present:   n(r.days_present),
      };
    });

    // ── Group into attendance tiers ────────────────────────────────────────
    const tiers: Record<string, { label: string; students: number[]; count: number }> = {
      low:    { label: 'Low (0–49%)',    students: [], count: 0 },
      medium: { label: 'Medium (50–74%)', students: [], count: 0 },
      good:   { label: 'Good (75–89%)',  students: [], count: 0 },
      high:   { label: 'High (90–100%)', students: [], count: 0 },
    };

    for (const s of scatter) {
      const tier =
        s.attendance_pct >= 90 ? 'high'
        : s.attendance_pct >= 75 ? 'good'
        : s.attendance_pct >= 50 ? 'medium'
                                  : 'low';
      tiers[tier].students.push(s.avg_score);
      tiers[tier].count++;
    }

    const quartiles = Object.entries(tiers).map(([key, t]) => ({
      tier:       key,
      label:      t.label,
      count:      t.count,
      avg_score:  t.count > 0 ? Math.round(t.students.reduce((a, b) => a + b, 0) / t.count * 10) / 10 : null,
    }));

    // ── Compute Pearson correlation (attendance_pct vs avg_score) ─────────
    const xs = scatter.map(s => s.attendance_pct);
    const ys = scatter.map(s => s.avg_score);
    const nn = xs.length;
    const xMean = xs.reduce((a, b) => a + b, 0) / nn;
    const yMean = ys.reduce((a, b) => a + b, 0) / nn;
    const cov = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0) / nn;
    const xStd = Math.sqrt(xs.reduce((s, x) => s + (x - xMean) ** 2, 0) / nn);
    const yStd = Math.sqrt(ys.reduce((s, y) => s + (y - yMean) ** 2, 0) / nn);
    const pearsonR = xStd > 0 && yStd > 0 ? cov / (xStd * yStd) : 0;

    const correlation: string =
      pearsonR > 0.3  ? 'positive'
      : pearsonR < -0.3 ? 'negative'
                        : 'weak';

    let insight = '';
    if (correlation === 'positive') {
      insight = `Students who attend more tend to score higher. Pearson r = ${pearsonR.toFixed(2)}. Improving attendance is likely to improve academic results.`;
    } else if (correlation === 'negative') {
      insight = `High attendance is not translating to high scores (r = ${pearsonR.toFixed(2)}). Some students may be present but disengaged — a deeper look at teaching quality or individual support is recommended.`;
    } else {
      insight = `No strong link found between attendance and scores (r = ${pearsonR.toFixed(2)}). Other factors may dominate performance variation.`;
    }

    return NextResponse.json({
      ok: true,
      data: {
        data_available:   true,
        student_count:    scatter.length,
        tracked_days:     totalDays,
        quartiles,
        scatter:          scatter.slice(0, 200), // cap payload
        correlation,
        pearson_r:        Math.round(pearsonR * 100) / 100,
        insight,
      },
    });

  } catch (e: any) {
    console.error('attendance-performance-correlation error:', e);
    return NextResponse.json({ error: 'Failed to fetch correlation' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
