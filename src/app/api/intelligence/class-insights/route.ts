import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Class Insights Engine
// Per-class analysis: performance trend, hardest subjects, term-over-term delta
// ─────────────────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  return Number(v) || 0;
}

type ClassTrend = 'improving' | 'declining' | 'stable' | 'no_history';

interface ClassInsight {
  class_id: number;
  class_name: string;
  current_avg: number;
  previous_avg: number | null;
  delta: number | null;
  trend: ClassTrend;
  student_count: number;
  at_risk_count: number;
  hardest_subjects: Array<{ subject_id: number; subject_name: string; avg_score: number }>;
  pass_rate: number; // % students with avg ≥ 50
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  let connection;
  try {
    connection = await getConnection();

    const [termRows] = await connection.execute(
      `SELECT id, name FROM terms
       WHERE school_id = ? AND status IN ('active','completed')
       ORDER BY id DESC LIMIT 2`,
      [schoolId]
    ) as any[];

    const currentTerm  = (termRows as any[])[0] ?? null;
    const previousTerm = (termRows as any[])[1] ?? null;

    if (!currentTerm) {
      return NextResponse.json({ ok: true, classes: [], meta: { currentTerm: null } });
    }

    // ── Per-class stats current term ─────────────────────────────────────────
    const [classCurrentRows] = await connection.execute(
      `SELECT
         s.class_id,
         c.name AS class_name,
         COUNT(DISTINCT cr.student_id) AS student_count,
         AVG(cr.score) AS avg_score,
         SUM(CASE WHEN cr.score < 40 THEN 1 ELSE 0 END) AS at_risk_count,
         COUNT(DISTINCT CASE WHEN cr.score >= 50 THEN cr.student_id END) AS passing_students
       FROM class_results cr
       JOIN students s ON s.id = cr.student_id
       JOIN classes c ON c.id = s.class_id
       WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL AND s.class_id IS NOT NULL
       GROUP BY s.class_id, c.name`,
      [schoolId, currentTerm.id]
    ) as any[];

    // ── Per-class stats previous term ────────────────────────────────────────
    const prevClassMap = new Map<number, number>();
    if (previousTerm) {
      const [classPrevRows] = await connection.execute(
        `SELECT s.class_id, AVG(cr.score) AS avg_score
         FROM class_results cr
         JOIN students s ON s.id = cr.student_id
         WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL AND s.class_id IS NOT NULL
         GROUP BY s.class_id`,
        [schoolId, previousTerm.id]
      ) as any[];
      for (const r of classPrevRows as any[]) {
        prevClassMap.set(Number(r.class_id), n(r.avg_score));
      }
    }

    // ── Hardest subjects per class ───────────────────────────────────────────
    const [subjectRows] = await connection.execute(
      `SELECT
         s.class_id,
         cr.subject_id,
         sub.name AS subject_name,
         AVG(cr.score) AS avg_score
       FROM class_results cr
       JOIN students s ON s.id = cr.student_id
       JOIN subjects sub ON sub.id = cr.subject_id
       WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL AND s.class_id IS NOT NULL
       GROUP BY s.class_id, cr.subject_id, sub.name
       ORDER BY s.class_id, avg_score ASC`,
      [schoolId, currentTerm.id]
    ) as any[];

    // Group: class_id → top 3 hardest subjects (lowest avg)
    const hardestByClass = new Map<number, Array<{ subject_id: number; subject_name: string; avg_score: number }>>();
    for (const r of subjectRows as any[]) {
      const cid = Number(r.class_id);
      if (!hardestByClass.has(cid)) hardestByClass.set(cid, []);
      const arr = hardestByClass.get(cid)!;
      if (arr.length < 3) {
        arr.push({
          subject_id: Number(r.subject_id),
          subject_name: r.subject_name,
          avg_score: Math.round(n(r.avg_score) * 10) / 10,
        });
      }
    }

    // ── Build class insights ──────────────────────────────────────────────────
    const classes: ClassInsight[] = [];
    for (const row of classCurrentRows as any[]) {
      const classId = Number(row.class_id);
      const currentAvg = n(row.avg_score);
      const prevAvg = prevClassMap.get(classId) ?? null;
      const delta = prevAvg !== null ? Math.round((currentAvg - prevAvg) * 10) / 10 : null;
      const studentCount = n(row.student_count);
      const passingStudents = n(row.passing_students);

      let trend: ClassTrend;
      if (delta === null) trend = 'no_history';
      else if (delta >= 5) trend = 'improving';
      else if (delta <= -5) trend = 'declining';
      else trend = 'stable';

      classes.push({
        class_id: classId,
        class_name: row.class_name,
        current_avg: Math.round(currentAvg * 10) / 10,
        previous_avg: prevAvg !== null ? Math.round(prevAvg * 10) / 10 : null,
        delta,
        trend,
        student_count: studentCount,
        at_risk_count: n(row.at_risk_count),
        pass_rate: studentCount > 0 ? Math.round((passingStudents / studentCount) * 100) : 0,
        hardest_subjects: hardestByClass.get(classId) ?? [],
      });
    }

    // Sort declining first
    classes.sort((a, b) => {
      const tOrd: Record<ClassTrend, number> = { declining: 0, stable: 1, no_history: 2, improving: 3 };
      return tOrd[a.trend] - tOrd[b.trend];
    });

    // School-wide hardest subjects (current term)
    const [schoolSubjectRows] = await connection.execute(
      `SELECT
         cr.subject_id, sub.name AS subject_name,
         AVG(cr.score) AS avg_score,
         COUNT(DISTINCT cr.student_id) AS student_count
       FROM class_results cr
       JOIN subjects sub ON sub.id = cr.subject_id
       JOIN students s ON s.id = cr.student_id
       WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL
       GROUP BY cr.subject_id, sub.name
       ORDER BY avg_score ASC
       LIMIT 10`,
      [schoolId, currentTerm.id]
    ) as any[];

    return NextResponse.json({
      ok: true,
      classes,
      school_subjects: (schoolSubjectRows as any[]).map((r: any) => ({
        subject_id: Number(r.subject_id),
        subject_name: r.subject_name,
        avg_score: Math.round(n(r.avg_score) * 10) / 10,
        student_count: n(r.student_count),
      })),
      meta: {
        currentTerm: { id: currentTerm.id, name: currentTerm.name },
        previousTerm: previousTerm ? { id: previousTerm.id, name: previousTerm.name } : null,
        total_classes: classes.length,
        declining_classes: classes.filter(c => c.trend === 'declining').length,
        improving_classes: classes.filter(c => c.trend === 'improving').length,
      },
    });
  } catch (err: any) {
    console.error('[intelligence/class-insights]', err);
    return NextResponse.json({ error: 'Failed to compute class insights' }, { status: 500 });
  } finally {
    if (connection) {
      try { await (connection as any).end(); } catch { /* ignore */ }
    }
  }
}
