import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Risk Analysis Engine
// Returns students who need immediate attention, with actionable detail:
//   - academic risk (score < 40)
//   - multi-term decline (falling two terms in a row)
//   - sudden drop (current term avg fell > 20pts from last term)
//   - silent_struggler (below 50, multiple weak subjects, no flag)
// ─────────────────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  return Number(v) || 0;
}

type RiskLevel = 'critical' | 'high' | 'medium';
type RiskReason = 'low_score' | 'sudden_drop' | 'multi_term_decline' | 'multiple_weak_subjects';

interface RiskStudent {
  student_id: number;
  name: string;
  class_name: string | null;
  admission_no: string | null;
  risk_level: RiskLevel;
  risk_reasons: RiskReason[];
  current_avg: number;
  previous_avg: number | null;
  delta: number | null;
  weak_subjects: Array<{ subject_name: string; avg_score: number }>;
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('class_id') ?? null;
  const riskLevelFilter = searchParams.get('risk_level') as RiskLevel | null;
  const limitParam = Math.min(parseInt(searchParams.get('limit') ?? '100'), 300);

  let connection;
  try {
    connection = await getConnection();

    const [termRows] = await connection.execute(
      `SELECT id, name FROM terms
       WHERE school_id = ? AND status IN ('active','completed')
       ORDER BY id DESC LIMIT 3`,
      [schoolId]
    ) as any[];

    const terms = termRows as any[];
    const currentTerm  = terms[0] ?? null;
    const previousTerm = terms[1] ?? null;
    const twoTermsAgo  = terms[2] ?? null;

    if (!currentTerm) {
      return NextResponse.json({ ok: true, students: [], meta: { currentTerm: null } });
    }

    const classFilter = classId ? 'AND s.class_id = ?' : '';
    const classArgs = classId ? [Number(classId)] : [];

    // ── Current term per-student averages ────────────────────────────────────
    const [currentRows] = await connection.execute(
      `SELECT
         cr.student_id,
         p.first_name, p.last_name,
         s.admission_no,
         c.name AS class_name,
         AVG(cr.score) AS avg_score,
         COUNT(DISTINCT cr.subject_id) AS subject_count
       FROM class_results cr
       JOIN students s ON s.id = cr.student_id
       JOIN people p ON p.id = s.person_id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL ${classFilter}
       GROUP BY cr.student_id, p.first_name, p.last_name, s.admission_no, c.name`,
      [schoolId, currentTerm.id, ...classArgs]
    ) as any[];

    // ── Previous term averages ───────────────────────────────────────────────
    const prevMap = new Map<number, number>();
    if (previousTerm) {
      const [prevRows] = await connection.execute(
        `SELECT cr.student_id, AVG(cr.score) AS avg_score
         FROM class_results cr JOIN students s ON s.id = cr.student_id
         WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL
         GROUP BY cr.student_id`,
        [schoolId, previousTerm.id]
      ) as any[];
      for (const r of prevRows as any[]) prevMap.set(Number(r.student_id), n(r.avg_score));
    }

    // ── Two terms ago averages (for multi-term decline detection) ────────────
    const twoTermsMap = new Map<number, number>();
    if (twoTermsAgo) {
      const [twoRows] = await connection.execute(
        `SELECT cr.student_id, AVG(cr.score) AS avg_score
         FROM class_results cr JOIN students s ON s.id = cr.student_id
         WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL
         GROUP BY cr.student_id`,
        [schoolId, twoTermsAgo.id]
      ) as any[];
      for (const r of twoRows as any[]) twoTermsMap.set(Number(r.student_id), n(r.avg_score));
    }

    // ── Weak subjects per student ────────────────────────────────────────────
    const [weakRows] = await connection.execute(
      `SELECT cr.student_id, sub.name AS subject_name, AVG(cr.score) AS avg_score
       FROM class_results cr
       JOIN subjects sub ON sub.id = cr.subject_id
       JOIN students s ON s.id = cr.student_id
       WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL
       GROUP BY cr.student_id, cr.subject_id, sub.name
       HAVING AVG(cr.score) < 50
       ORDER BY cr.student_id, avg_score ASC`,
      [schoolId, currentTerm.id]
    ) as any[];

    const weakByStudent = new Map<number, Array<{ subject_name: string; avg_score: number }>>();
    for (const r of weakRows as any[]) {
      const sid = Number(r.student_id);
      if (!weakByStudent.has(sid)) weakByStudent.set(sid, []);
      weakByStudent.get(sid)!.push({
        subject_name: r.subject_name,
        avg_score: Math.round(n(r.avg_score) * 10) / 10,
      });
    }

    // ── Classify risk ─────────────────────────────────────────────────────────
    const riskStudents: RiskStudent[] = [];

    for (const row of currentRows as any[]) {
      const studentId = Number(row.student_id);
      const currentAvg = n(row.avg_score);
      const prevAvg = prevMap.get(studentId) ?? null;
      const twoAgo = twoTermsMap.get(studentId) ?? null;
      const delta = prevAvg !== null ? Math.round((currentAvg - prevAvg) * 10) / 10 : null;
      const weakSubjects = weakByStudent.get(studentId) ?? [];

      const reasons: RiskReason[] = [];

      if (currentAvg < 40) reasons.push('low_score');
      if (delta !== null && delta <= -20) reasons.push('sudden_drop');
      if (
        prevAvg !== null && twoAgo !== null &&
        prevAvg < twoAgo - 5 &&
        currentAvg < prevAvg - 5
      ) reasons.push('multi_term_decline');
      if (currentAvg < 50 && weakSubjects.length >= 3) reasons.push('multiple_weak_subjects');

      if (reasons.length === 0) continue;

      let riskLevel: RiskLevel;
      if (
        reasons.includes('multi_term_decline') ||
        (reasons.includes('low_score') && reasons.includes('sudden_drop')) ||
        currentAvg < 30
      ) {
        riskLevel = 'critical';
      } else if (
        reasons.includes('sudden_drop') ||
        (reasons.includes('low_score') && reasons.includes('multiple_weak_subjects'))
      ) {
        riskLevel = 'high';
      } else {
        riskLevel = 'medium';
      }

      if (riskLevelFilter && riskLevel !== riskLevelFilter) continue;

      riskStudents.push({
        student_id: studentId,
        name: `${row.first_name} ${row.last_name}`.trim(),
        class_name: row.class_name ?? null,
        admission_no: row.admission_no ?? null,
        risk_level: riskLevel,
        risk_reasons: reasons,
        current_avg: Math.round(currentAvg * 10) / 10,
        previous_avg: prevAvg !== null ? Math.round(prevAvg * 10) / 10 : null,
        delta,
        weak_subjects: weakSubjects.slice(0, 5),
      });
    }

    // Sort: critical first, then highest risk
    const lvlOrd: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2 };
    riskStudents.sort((a, b) => {
      const ld = lvlOrd[a.risk_level] - lvlOrd[b.risk_level];
      if (ld !== 0) return ld;
      return a.current_avg - b.current_avg;
    });

    const summary = {
      critical: riskStudents.filter(r => r.risk_level === 'critical').length,
      high: riskStudents.filter(r => r.risk_level === 'high').length,
      medium: riskStudents.filter(r => r.risk_level === 'medium').length,
      total: riskStudents.length,
    };

    return NextResponse.json({
      ok: true,
      students: riskStudents.slice(0, limitParam),
      total: riskStudents.length,
      summary,
      meta: {
        currentTerm: { id: currentTerm.id, name: currentTerm.name },
        previousTerm: previousTerm ? { id: previousTerm.id, name: previousTerm.name } : null,
      },
    });
  } catch (err: any) {
    console.error('[intelligence/risk-analysis]', err);
    return NextResponse.json({ error: 'Failed to compute risk analysis' }, { status: 500 });
  } finally {
    if (connection) {
      try { await (connection as any).end(); } catch { /* ignore */ }
    }
  }
}
