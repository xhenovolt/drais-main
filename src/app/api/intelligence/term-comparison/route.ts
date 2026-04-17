import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Term Comparison Engine
//
// Returns multi-term performance data for:
//   - School-wide average per term (line chart data)
//   - Per-class average per term (multi-line chart)
//   - Per-subject average per term (top N subjects)
//   - Student classification distribution per term
//
// Query params:
//   limit_terms=6   (max terms to include, default 6)
//   class_id        (optional — filter per-class view)
// ─────────────────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  return Number(v) || 0;
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  const { searchParams } = new URL(req.url);
  const limitTerms = Math.min(parseInt(searchParams.get('limit_terms') ?? '6'), 10);
  const classId = searchParams.get('class_id') ? parseInt(searchParams.get('class_id')!) : null;

  let connection;
  try {
    connection = await getConnection();

    // ── 1. Get last N completed/active terms ─────────────────────────────────
    const [termRows] = await connection.execute(
      `SELECT id, name, start_date, end_date FROM terms
       WHERE school_id = ? AND status IN ('active','completed') AND deleted_at IS NULL
       ORDER BY id DESC LIMIT ?`,
      [schoolId, limitTerms]
    ) as any[];
    const terms = (termRows as any[]).reverse(); // oldest first for charts

    if (terms.length === 0) {
      return NextResponse.json({
        ok: true,
        terms: [],
        school_trend: [],
        class_trends: [],
        subject_trends: [],
        classification_trend: [],
      });
    }

    const termIds = terms.map((t: any) => t.id);
    const placeholders = termIds.map(() => '?').join(',');

    // ── 2. School-wide avg per term ──────────────────────────────────────────
    const classFilter = classId ? 'AND s.class_id = ?' : '';
    const baseArgs = classId
      ? [schoolId, ...termIds, classId]
      : [schoolId, ...termIds];

    const [schoolWideRows] = await connection.execute(
      `SELECT
         cr.term_id,
         AVG(cr.score)                        AS avg_score,
         COUNT(DISTINCT cr.student_id)         AS student_count,
         SUM(CASE WHEN cr.score < 40 THEN 1 ELSE 0 END) AS at_risk_count,
         SUM(CASE WHEN cr.score >= 70 THEN 1 ELSE 0 END) AS high_performer_count,
         SUM(CASE WHEN cr.score >= 50 THEN 1 ELSE 0 END) AS passing_count
       FROM class_results cr
       JOIN students s ON s.id = cr.student_id
       WHERE s.school_id = ? AND cr.term_id IN (${placeholders})
         AND cr.deleted_at IS NULL ${classFilter}
       GROUP BY cr.term_id`,
      baseArgs
    ) as any[];

    const schoolMap = new Map<number, any>(
      (schoolWideRows as any[]).map((r: any) => [Number(r.term_id), r])
    );

    const school_trend = terms.map((t: any) => {
      const row = schoolMap.get(Number(t.id));
      const avg = row ? Math.round(n(row.avg_score) * 10) / 10 : null;
      const students = row ? n(row.student_count) : 0;
      const passRate = (row && students > 0) ? Math.round((n(row.passing_count) / students) * 1000) / 10 : null;
      return {
        term_id: t.id,
        term_name: t.name,
        avg_score: avg,
        student_count: students,
        at_risk_count: row ? n(row.at_risk_count) : 0,
        high_performer_count: row ? n(row.high_performer_count) : 0,
        pass_rate: passRate,
      };
    });

    // ── 3. Per-class avg per term ────────────────────────────────────────────
    const [classRows] = await connection.execute(
      `SELECT
         cr.term_id,
         s.class_id,
         c.name AS class_name,
         AVG(cr.score) AS avg_score,
         COUNT(DISTINCT cr.student_id) AS student_count
       FROM class_results cr
       JOIN students s ON s.id = cr.student_id
       JOIN classes c ON c.id = s.class_id
       WHERE s.school_id = ? AND cr.term_id IN (${placeholders})
         AND cr.deleted_at IS NULL AND s.class_id IS NOT NULL
       GROUP BY cr.term_id, s.class_id, c.name`,
      [schoolId, ...termIds]
    ) as any[];

    // Build class trend map: class_id → { name, data per term }
    const classTrendMap = new Map<number, { class_id: number; class_name: string; data: Record<number, number | null> }>();
    for (const row of classRows as any[]) {
      const cid = Number(row.class_id);
      if (!classTrendMap.has(cid)) {
        classTrendMap.set(cid, { class_id: cid, class_name: row.class_name, data: {} });
      }
      classTrendMap.get(cid)!.data[Number(row.term_id)] = Math.round(n(row.avg_score) * 10) / 10;
    }

    // Only include classes with data in at least 2 terms (trend is meaningful)
    const class_trends = Array.from(classTrendMap.values())
      .filter(c => Object.values(c.data).filter(v => v !== null).length >= 1)
      .map(c => ({
        class_id: c.class_id,
        class_name: c.class_name,
        trend: terms.map((t: any) => ({
          term_id: t.id,
          term_name: t.name,
          avg_score: c.data[Number(t.id)] ?? null,
        })),
        // Compute delta: last term avg vs first term avg
        delta: (() => {
          const vals = terms.map((t: any) => c.data[Number(t.id)] ?? null).filter((v): v is number => v !== null);
          if (vals.length < 2) return null;
          return Math.round((vals[vals.length - 1] - vals[0]) * 10) / 10;
        })(),
      }))
      .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)); // improving classes first

    // ── 4. Top subjects by variance across terms ─────────────────────────────
    const [subjectRows] = await connection.execute(
      `SELECT
         cr.term_id,
         cr.subject_id,
         sub.name AS subject_name,
         AVG(cr.score) AS avg_score,
         COUNT(DISTINCT cr.student_id) AS student_count
       FROM class_results cr
       JOIN subjects sub ON sub.id = cr.subject_id
       JOIN students s ON s.id = cr.student_id
       WHERE s.school_id = ? AND cr.term_id IN (${placeholders})
         AND cr.deleted_at IS NULL
       GROUP BY cr.term_id, cr.subject_id, sub.name`,
      [schoolId, ...termIds]
    ) as any[];

    const subjectTrendMap = new Map<number, { subject_id: number; subject_name: string; data: Record<number, number | null> }>();
    for (const row of subjectRows as any[]) {
      const sid = Number(row.subject_id);
      if (!subjectTrendMap.has(sid)) {
        subjectTrendMap.set(sid, { subject_id: sid, subject_name: row.subject_name, data: {} });
      }
      subjectTrendMap.get(sid)!.data[Number(row.term_id)] = Math.round(n(row.avg_score) * 10) / 10;
    }

    // Sort subjects by highest absolute variance (most interesting to watch)
    const subject_trends = Array.from(subjectTrendMap.values())
      .filter(s => Object.values(s.data).filter(v => v !== null).length >= 2)
      .map(s => {
        const vals = Object.values(s.data).filter((v): v is number => v !== null);
        const variance = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
        const latestTermId = termIds[termIds.length - 1]; // already oldest first
        return {
          subject_id: s.subject_id,
          subject_name: s.subject_name,
          trend: terms.map((t: any) => ({
            term_id: t.id,
            term_name: t.name,
            avg_score: s.data[Number(t.id)] ?? null,
          })),
          variance: Math.round(variance * 10) / 10,
          latest_avg: s.data[Number(latestTermId)] ?? null,
        };
      })
      .sort((a, b) => (a.latest_avg ?? 100) - (b.latest_avg ?? 100)) // weakest first
      .slice(0, 12);

    // ── 5. Classification distribution per term ───────────────────────────────
    // Count archetypes per term using same thresholds as student-patterns API
    const [distRows] = await connection.execute(
      `SELECT
         cr.term_id,
         cr.student_id,
         AVG(cr.score) AS avg_score
       FROM class_results cr
       JOIN students s ON s.id = cr.student_id
       WHERE s.school_id = ? AND cr.term_id IN (${placeholders}) AND cr.deleted_at IS NULL
       GROUP BY cr.term_id, cr.student_id`,
      [schoolId, ...termIds]
    ) as any[];

    // Build per-term distribution
    const termDistMap = new Map<number, { at_risk: number; struggling: number; stable: number; performing: number; high: number }>();
    for (const t of terms as any[]) {
      termDistMap.set(Number(t.id), { at_risk: 0, struggling: 0, stable: 0, performing: 0, high: 0 });
    }
    for (const row of distRows as any[]) {
      const dist = termDistMap.get(Number(row.term_id));
      if (!dist) continue;
      const avg = n(row.avg_score);
      if (avg < 40)       dist.at_risk++;
      else if (avg < 50)  dist.struggling++;
      else if (avg < 65)  dist.stable++;
      else if (avg < 80)  dist.performing++;
      else                dist.high++;
    }

    const classification_trend = terms.map((t: any) => {
      const dist = termDistMap.get(Number(t.id)) ?? { at_risk: 0, struggling: 0, stable: 0, performing: 0, high: 0 };
      return { term_id: t.id, term_name: t.name, ...dist };
    });

    return NextResponse.json({
      ok: true,
      terms: terms.map((t: any) => ({ id: t.id, name: t.name })),
      school_trend,
      class_trends,
      subject_trends,
      classification_trend,
    });

  } catch (err: any) {
    console.error('[intelligence/term-comparison]', err);
    return NextResponse.json({ error: 'Failed to compute term comparison' }, { status: 500 });
  } finally {
    if (connection) {
      try { await (connection as any).end(); } catch { /* ignore */ }
    }
  }
}
