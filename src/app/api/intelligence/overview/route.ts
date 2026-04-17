import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Intelligence Overview  — top-level signals for the dashboard signal bar
// Returns 5-7 actionable signals, nothing decorative.
// ─────────────────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  return Number(v) || 0;
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;
  let connection;

  try {
    connection = await getConnection();

    // ── 1. Active term context ──────────────────────────────────────────────
    const [termRows] = await connection.execute(
      `SELECT id, name, school_id FROM terms
       WHERE school_id = ? AND status IN ('active','completed')
       ORDER BY id DESC LIMIT 2`,
      [schoolId]
    ) as any[];

    const currentTerm  = termRows[0] ?? null;
    const previousTerm = termRows[1] ?? null;

    if (!currentTerm) {
      return NextResponse.json({
        ok: true,
        signals: [],
        meta: { currentTerm: null, previousTerm: null },
      });
    }

    const termIds = [currentTerm.id, previousTerm?.id].filter(Boolean);

    // ── 2. At-risk count (avg score < 40 this term) ─────────────────────────
    const [atRiskRows] = await connection.execute(
      `SELECT COUNT(DISTINCT cr.student_id) AS cnt
       FROM class_results cr
       JOIN students s ON s.id = cr.student_id
       WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL
       GROUP BY cr.student_id
       HAVING AVG(cr.score) < 40`,
      [schoolId, currentTerm.id]
    ) as any[];
    const atRiskCount = (atRiskRows as any[]).length;

    // ── 3. Declining class count (avg this term < avg last term − 8pts) ──────
    let decliningClasses = 0;
    if (previousTerm) {
      const [classAvgCurrent] = await connection.execute(
        `SELECT s.class_id, AVG(cr.score) AS avg_score
         FROM class_results cr
         JOIN students s ON s.id = cr.student_id
         WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL AND s.class_id IS NOT NULL
         GROUP BY s.class_id`,
        [schoolId, currentTerm.id]
      ) as any[];
      const [classAvgPrev] = await connection.execute(
        `SELECT s.class_id, AVG(cr.score) AS avg_score
         FROM class_results cr
         JOIN students s ON s.id = cr.student_id
         WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL AND s.class_id IS NOT NULL
         GROUP BY s.class_id`,
        [schoolId, previousTerm.id]
      ) as any[];

      const prevMap = new Map<number, number>(
        (classAvgPrev as any[]).map((r: any) => [Number(r.class_id), n(r.avg_score)])
      );
      for (const row of classAvgCurrent as any[]) {
        const prevAvg = prevMap.get(Number(row.class_id));
        if (prevAvg !== undefined && n(row.avg_score) < prevAvg - 8) {
          decliningClasses++;
        }
      }
    }

    // ── 4. Subject with biggest term-over-term drop ─────────────────────────
    let worstSubject: { name: string; drop: number } | null = null;
    if (previousTerm) {
      const [subjectCurrent] = await connection.execute(
        `SELECT cr.subject_id, sub.name, AVG(cr.score) AS avg_score
         FROM class_results cr
         JOIN subjects sub ON sub.id = cr.subject_id
         JOIN students s ON s.id = cr.student_id
         WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL
         GROUP BY cr.subject_id, sub.name`,
        [schoolId, currentTerm.id]
      ) as any[];
      const [subjectPrev] = await connection.execute(
        `SELECT cr.subject_id, AVG(cr.score) AS avg_score
         FROM class_results cr
         JOIN students s ON s.id = cr.student_id
         WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL
         GROUP BY cr.subject_id`,
        [schoolId, previousTerm.id]
      ) as any[];

      const prevSubMap = new Map<number, number>(
        (subjectPrev as any[]).map((r: any) => [Number(r.subject_id), n(r.avg_score)])
      );
      let maxDrop = 0;
      for (const row of subjectCurrent as any[]) {
        const prev = prevSubMap.get(Number(row.subject_id));
        if (prev !== undefined) {
          const drop = prev - n(row.avg_score);
          if (drop > maxDrop) {
            maxDrop = drop;
            worstSubject = { name: row.name, drop: Math.round(drop * 10) / 10 };
          }
        }
      }
    }

    // ── 5. Overall current term avg vs previous term avg ────────────────────
    const [overallCurrent] = await connection.execute(
      `SELECT AVG(cr.score) AS avg_score, COUNT(DISTINCT cr.student_id) AS student_count
       FROM class_results cr JOIN students s ON s.id = cr.student_id
       WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL`,
      [schoolId, currentTerm.id]
    ) as any[];
    const currentAvg = n((overallCurrent as any[])[0]?.avg_score);
    const currentStudentCount = n((overallCurrent as any[])[0]?.student_count);

    let previousAvg: number | null = null;
    if (previousTerm) {
      const [overallPrev] = await connection.execute(
        `SELECT AVG(cr.score) AS avg_score
         FROM class_results cr JOIN students s ON s.id = cr.student_id
         WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL`,
        [schoolId, previousTerm.id]
      ) as any[];
      previousAvg = n((overallPrev as any[])[0]?.avg_score) || null;
    }

    // ── 6. Top improvers count (rose > 15pts from last term) ────────────────
    let topImprovers = 0;
    if (previousTerm) {
      const [impRows] = await connection.execute(
        `SELECT cr.student_id,
           AVG(CASE WHEN cr.term_id = ? THEN cr.score END) AS cur,
           AVG(CASE WHEN cr.term_id = ? THEN cr.score END) AS prev
         FROM class_results cr
         JOIN students s ON s.id = cr.student_id
         WHERE s.school_id = ? AND cr.term_id IN (?,?) AND cr.deleted_at IS NULL
         GROUP BY cr.student_id
         HAVING cur IS NOT NULL AND prev IS NOT NULL AND (cur - prev) >= 15`,
        [currentTerm.id, previousTerm.id, schoolId, currentTerm.id, previousTerm.id]
      ) as any[];
      topImprovers = (impRows as any[]).length;
    }

    // ── 7. Total active students ─────────────────────────────────────────────
    const [totalRows] = await connection.execute(
      `SELECT COUNT(*) AS cnt FROM students WHERE school_id = ? AND status = 'active' AND deleted_at IS NULL`,
      [schoolId]
    ) as any[];
    const totalStudents = n((totalRows as any[])[0]?.cnt);

    // ── Build signals array ──────────────────────────────────────────────────
    const signals = [];

    if (atRiskCount > 0) {
      signals.push({
        type: 'warning',
        icon: '⚠️',
        label: `${atRiskCount} student${atRiskCount !== 1 ? 's' : ''} at risk`,
        detail: `Average below 40% in ${currentTerm.name}`,
        value: atRiskCount,
        action: '/intelligence?tab=risk',
      });
    }

    if (decliningClasses > 0) {
      signals.push({
        type: 'decline',
        icon: '📉',
        label: `${decliningClasses} class${decliningClasses !== 1 ? 'es' : ''} declining`,
        detail: `Performance dropped >8pts vs ${previousTerm?.name ?? 'last term'}`,
        value: decliningClasses,
        action: '/intelligence?tab=classes',
      });
    }

    if (worstSubject) {
      signals.push({
        type: 'decline',
        icon: '📚',
        label: `${worstSubject.name} dropped ${worstSubject.drop}%`,
        detail: `Biggest subject performance drop this term`,
        value: worstSubject.drop,
        action: '/intelligence?tab=subjects',
      });
    }

    if (previousAvg !== null && currentAvg > 0) {
      const delta = Math.round((currentAvg - previousAvg) * 10) / 10;
      signals.push({
        type: delta >= 0 ? 'positive' : 'decline',
        icon: delta >= 0 ? '📊' : '📉',
        label: `School avg: ${Math.round(currentAvg * 10) / 10}%`,
        detail: delta >= 0
          ? `+${delta}% vs ${previousTerm?.name ?? 'last term'}`
          : `${delta}% vs ${previousTerm?.name ?? 'last term'}`,
        value: currentAvg,
        action: '/intelligence?tab=overview',
      });
    } else if (currentAvg > 0) {
      signals.push({
        type: 'info',
        icon: '📊',
        label: `School avg: ${Math.round(currentAvg * 10) / 10}%`,
        detail: `${currentStudentCount} students assessed this term`,
        value: currentAvg,
        action: '/intelligence?tab=overview',
      });
    }

    if (topImprovers > 0) {
      signals.push({
        type: 'positive',
        icon: '📈',
        label: `${topImprovers} top improver${topImprovers !== 1 ? 's' : ''}`,
        detail: `Rose 15%+ from ${previousTerm?.name ?? 'last term'}`,
        value: topImprovers,
        action: '/intelligence?tab=patterns',
      });
    }

    return NextResponse.json({
      ok: true,
      signals,
      meta: {
        currentTerm: { id: currentTerm.id, name: currentTerm.name },
        previousTerm: previousTerm ? { id: previousTerm.id, name: previousTerm.name } : null,
        totalStudents,
        currentTermAvg: currentAvg,
        previousTermAvg: previousAvg,
      },
    });
  } catch (err: any) {
    console.error('[intelligence/overview]', err);
    return NextResponse.json({ error: 'Failed to compute intelligence overview' }, { status: 500 });
  } finally {
    if (connection) {
      try { await (connection as any).end(); } catch { /* ignore */ }
    }
  }
}
