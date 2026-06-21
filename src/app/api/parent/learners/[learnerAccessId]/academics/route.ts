/**
 * GET /api/parent/learners/[learnerAccessId]/academics
 * Gated. RELEASED exam results only (never scheduled/ongoing), grouped by subject.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLearnerAccess } from '@/lib/parent/context';
import { query } from '@/lib/db';

const RELEASED = ['published', 'released', 'completed', 'graded'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ learnerAccessId: string }> }) {
  const { learnerAccessId } = await params;
  const res = await requireLearnerAccess(req, learnerAccessId);
  if ('error' in res) return res.error;
  const { student_id, school_id } = res.access;

  const ph = RELEASED.map(() => '?').join(',');
  const rows = (await query(
    `SELECT r.score, r.grade, r.remarks,
            e.name AS exam_name, e.date AS exam_date,
            sub.name AS subject_name
       FROM results r
       JOIN exams e ON e.id = r.exam_id AND e.school_id = ?
       LEFT JOIN subjects sub ON sub.id = e.subject_id
      WHERE r.student_id = ? AND r.score IS NOT NULL
        AND LOWER(e.status) IN (${ph})
      ORDER BY e.date DESC LIMIT 200`,
    [school_id, student_id, ...RELEASED],
  )) as any[];

  const bySubject = new Map<string, any[]>();
  for (const r of rows) {
    const key = r.subject_name || 'Other';
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key)!.push({ exam: r.exam_name, score: Number(r.score), grade: r.grade, remarks: r.remarks, at: r.exam_date });
  }

  return NextResponse.json({
    success: true,
    released_only: true,
    subjects: [...bySubject.entries()].map(([subject, results]) => ({ subject, results })),
    total_results: rows.length,
  });
}
