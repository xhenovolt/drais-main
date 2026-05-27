/**
 * GET /api/portal/learners/[studentId]/overview
 * Gated learner snapshot for parents: performance, attendance, fee balance,
 * subjects. Mirrors the staff command-center overview but behind the parent
 * isolation gate. Metrics wrapped in safe() to degrade on schema drift.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLinkedLearner } from '@/lib/portal/context';
import { query } from '@/lib/db';

async function safe<T>(p: Promise<T>, fb: T): Promise<T> { try { return await p; } catch { return fb; } }
const num = (v: any): number | null => (v == null ? null : Number(v));

export async function GET(req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const studentId = Number((await params).studentId);
  if (!studentId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const res = await requireLinkedLearner(req, studentId);
  if ('error' in res) return res.error;
  const { schoolId } = res.ctx;

  const [perf, attendance, fees, subjects] = await Promise.all([
    safe(query(
      `SELECT AVG(r.score) AS avg_score, COUNT(*) AS graded
         FROM results r JOIN exams e ON e.id = r.exam_id AND e.school_id = ?
        WHERE r.student_id = ? AND r.score IS NOT NULL`,
      [schoolId, studentId],
    ) as Promise<any[]>, [{ avg_score: null, graded: 0 }]),
    safe(query(
      `SELECT COUNT(*) AS total, SUM(status IN ('present','late')) AS present
         FROM daily_attendance
        WHERE school_id = ? AND person_type = 'student' AND person_id = ?
          AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 120 DAY)`,
      [schoolId, studentId],
    ) as Promise<any[]>, [{ total: 0, present: 0 }]),
    safe(query(
      `SELECT
         (SELECT COALESCE(SUM(fs.amount),0) FROM student_fee_items sfi
            JOIN fee_structures fs ON fs.id = sfi.fee_structure_id
           WHERE sfi.student_id = ?) AS expected,
         (SELECT COALESCE(SUM(amount),0) FROM fee_payments WHERE student_id = ?) AS paid`,
      [studentId, studentId],
    ) as Promise<any[]>, [{ expected: null, paid: null }]),
    safe(query(
      `SELECT COUNT(DISTINCT cs.subject_id) AS subject_count
         FROM enrollments en JOIN class_subjects cs ON cs.class_id = en.class_id
        WHERE en.student_id = ? AND en.school_id = ? AND en.status = 'active'`,
      [studentId, schoolId],
    ) as Promise<any[]>, [{ subject_count: 0 }]),
  ]);

  const total = Number(attendance[0]?.total ?? 0);
  const present = Number(attendance[0]?.present ?? 0);
  const expected = num(fees[0]?.expected);
  const paid = num(fees[0]?.paid);

  return NextResponse.json({
    success: true,
    overview: {
      performance: {
        average: perf[0]?.avg_score == null ? null : Math.round(Number(perf[0].avg_score) * 10) / 10,
        graded_count: Number(perf[0]?.graded ?? 0),
      },
      attendance: { rate: total > 0 ? Math.round((present / total) * 1000) / 10 : null, total_days: total, present },
      fees: { expected, paid, balance: expected != null && paid != null ? expected - paid : null },
      subjects: { active: Number(subjects[0]?.subject_count ?? 0) },
    },
  });
}
