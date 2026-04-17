import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Student Pattern Engine
// Classifies each student into one of four behavioral archetypes based on
// real performance data across terms.
//
// Archetypes:
//   high_performer     — consistently above 70%
//   top_improver       — rose ≥15pts from previous term
//   silent_struggler   — below 50%, enrolled but no one flagged them
//   inconsistent       — swings > 20pts between terms
//   at_risk            — avg < 40% this term
//   stable             — within ±10pts, avg 50–70%
// ─────────────────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  return Number(v) || 0;
}

type Archetype = 'high_performer' | 'top_improver' | 'silent_struggler' | 'inconsistent' | 'at_risk' | 'stable';

interface StudentPattern {
  student_id: number;
  name: string;
  class_name: string | null;
  archetype: Archetype;
  current_avg: number;
  previous_avg: number | null;
  delta: number | null;
  subjects_at_risk: string[];
  confidence: number;
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  const { searchParams } = new URL(req.url);
  const limitParam = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500);
  const archetypeFilter = searchParams.get('archetype') ?? null;
  const classId = searchParams.get('class_id') ?? null;

  let connection;
  try {
    connection = await getConnection();

    // ── Get active + completed terms ordered most recent first ──────────────
    const [termRows] = await connection.execute(
      `SELECT id, name FROM terms
       WHERE school_id = ? AND status IN ('active','completed')
       ORDER BY id DESC LIMIT 2`,
      [schoolId]
    ) as any[];

    const currentTerm  = (termRows as any[])[0] ?? null;
    const previousTerm = (termRows as any[])[1] ?? null;

    if (!currentTerm) {
      return NextResponse.json({ ok: true, patterns: [], meta: { currentTerm: null } });
    }

    // ── Per-student averages current + previous term ─────────────────────────
    const classFilter = classId ? 'AND s.class_id = ?' : '';
    const classArgs = classId ? [schoolId, currentTerm.id, Number(classId)] : [schoolId, currentTerm.id];

    const [currentScores] = await connection.execute(
      `SELECT 
         cr.student_id,
         p.first_name, p.last_name,
         c.name AS class_name,
         AVG(cr.score) AS avg_score,
         COUNT(DISTINCT cr.subject_id) AS subject_count
       FROM class_results cr
       JOIN students s ON s.id = cr.student_id
       JOIN people p ON p.id = s.person_id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL ${classFilter}
       GROUP BY cr.student_id, p.first_name, p.last_name, c.name`,
      classArgs
    ) as any[];

    // Previous term averages (if available)
    const prevScoreMap = new Map<number, number>();
    if (previousTerm) {
      const [prevScores] = await connection.execute(
        `SELECT cr.student_id, AVG(cr.score) AS avg_score
         FROM class_results cr
         JOIN students s ON s.id = cr.student_id
         WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL
         GROUP BY cr.student_id`,
        [schoolId, previousTerm.id]
      ) as any[];
      for (const r of prevScores as any[]) {
        prevScoreMap.set(Number(r.student_id), n(r.avg_score));
      }
    }

    // Per-student weak subjects (score < 50) current term
    const [weakSubjectsRows] = await connection.execute(
      `SELECT cr.student_id, sub.name AS subject_name, AVG(cr.score) AS avg_score
       FROM class_results cr
       JOIN subjects sub ON sub.id = cr.subject_id
       JOIN students s ON s.id = cr.student_id
       WHERE s.school_id = ? AND cr.term_id = ? AND cr.deleted_at IS NULL
       GROUP BY cr.student_id, cr.subject_id, sub.name
       HAVING AVG(cr.score) < 50`,
      [schoolId, currentTerm.id]
    ) as any[];

    const weakSubjectMap = new Map<number, string[]>();
    for (const r of weakSubjectsRows as any[]) {
      const sid = Number(r.student_id);
      if (!weakSubjectMap.has(sid)) weakSubjectMap.set(sid, []);
      weakSubjectMap.get(sid)!.push(r.subject_name);
    }

    // ── Classify each student ────────────────────────────────────────────────
    const patterns: StudentPattern[] = [];

    for (const row of currentScores as any[]) {
      const studentId = Number(row.student_id);
      const currentAvg = n(row.avg_score);
      const prevAvg = prevScoreMap.get(studentId) ?? null;
      const delta = prevAvg !== null ? Math.round((currentAvg - prevAvg) * 10) / 10 : null;
      const subjectsAtRisk = weakSubjectMap.get(studentId) ?? [];

      let archetype: Archetype;
      let confidence: number;

      if (currentAvg < 40) {
        archetype = 'at_risk';
        confidence = currentAvg < 30 ? 0.95 : 0.82;
      } else if (delta !== null && delta >= 15) {
        archetype = 'top_improver';
        confidence = Math.min(0.95, 0.6 + delta / 50);
      } else if (delta !== null && Math.abs(delta) > 20) {
        archetype = 'inconsistent';
        confidence = Math.min(0.9, 0.5 + Math.abs(delta) / 60);
      } else if (currentAvg >= 70) {
        archetype = 'high_performer';
        confidence = currentAvg >= 85 ? 0.95 : 0.80;
      } else if (currentAvg < 50 && subjectsAtRisk.length >= 2) {
        archetype = 'silent_struggler';
        confidence = 0.75;
      } else {
        archetype = 'stable';
        confidence = 0.70;
      }

      if (archetypeFilter && archetype !== archetypeFilter) continue;

      patterns.push({
        student_id: studentId,
        name: `${row.first_name} ${row.last_name}`.trim(),
        class_name: row.class_name ?? null,
        archetype,
        current_avg: Math.round(currentAvg * 10) / 10,
        previous_avg: prevAvg !== null ? Math.round(prevAvg * 10) / 10 : null,
        delta,
        subjects_at_risk: subjectsAtRisk,
        confidence: Math.round(confidence * 100) / 100,
      });
    }

    // Sort: at_risk and silent_strugglers first, then by current_avg asc
    const priority: Record<Archetype, number> = {
      at_risk: 0, silent_struggler: 1, inconsistent: 2, stable: 3, top_improver: 4, high_performer: 5,
    };
    patterns.sort((a, b) => {
      const pd = priority[a.archetype] - priority[b.archetype];
      if (pd !== 0) return pd;
      return a.current_avg - b.current_avg;
    });

    // Summary counts
    const summary: Record<Archetype, number> = {
      at_risk: 0, silent_struggler: 0, inconsistent: 0, stable: 0, top_improver: 0, high_performer: 0,
    };
    for (const p of patterns) summary[p.archetype]++;

    return NextResponse.json({
      ok: true,
      patterns: patterns.slice(0, limitParam),
      total: patterns.length,
      summary,
      meta: {
        currentTerm: { id: currentTerm.id, name: currentTerm.name },
        previousTerm: previousTerm ? { id: previousTerm.id, name: previousTerm.name } : null,
      },
    });
  } catch (err: any) {
    console.error('[intelligence/student-patterns]', err);
    return NextResponse.json({ error: 'Failed to compute student patterns' }, { status: 500 });
  } finally {
    if (connection) {
      try { await (connection as any).end(); } catch { /* ignore */ }
    }
  }
}
