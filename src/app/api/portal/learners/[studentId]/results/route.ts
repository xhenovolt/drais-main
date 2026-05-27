/**
 * GET /api/portal/learners/[studentId]/results
 * Gated. Shows only RELEASED exam results to parents (exam status in a
 * published set) — never scheduled/in-progress marks. Grouped by subject.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLinkedLearner } from '@/lib/portal/context';
import { query } from '@/lib/db';

// Only these exam statuses are parent-visible. Scheduled/ongoing stay hidden.
const RELEASED = ['published', 'released', 'completed', 'graded'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const studentId = Number((await params).studentId);
  if (!studentId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const res = await requireLinkedLearner(req, studentId);
  if ('error' in res) return res.error;
  const { schoolId } = res.ctx;

  const placeholders = RELEASED.map(() => '?').join(',');
  const rows = (await query(
    `SELECT r.score, r.grade, r.remarks,
            e.name AS exam_name, e.term_id, e.created_at,
            sub.name AS subject_name
       FROM results r
       JOIN exams e   ON e.id = r.exam_id AND e.school_id = ?
       LEFT JOIN subjects sub ON sub.id = e.subject_id
      WHERE r.student_id = ?
        AND r.score IS NOT NULL
        AND LOWER(e.status) IN (${placeholders})
      ORDER BY e.created_at DESC
      LIMIT 200`,
    [schoolId, studentId, ...RELEASED],
  )) as any[];

  // Group by subject for a clean parent view.
  const bySubject = new Map<string, any[]>();
  for (const r of rows) {
    const key = r.subject_name || 'Other';
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key)!.push({
      exam: r.exam_name, score: Number(r.score), grade: r.grade, remarks: r.remarks, at: r.created_at,
    });
  }

  return NextResponse.json({
    success: true,
    released_only: true,
    subjects: [...bySubject.entries()].map(([subject, results]) => ({ subject, results })),
    total_results: rows.length,
  });
}
