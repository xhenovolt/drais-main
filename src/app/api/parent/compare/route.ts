/**
 * GET /api/parent/compare
 * Side-by-side metrics for the parent's OWN linked learners only (never any
 * school-wide data). Attendance rate + late days (last ~term), academic
 * average, and fee balance (where the school exposes finances).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireParent } from '@/lib/parent/context';
import { resolveLearnersForParent, type LearnerAccess } from '@/lib/parent/parent-access-resolver';
import { query } from '@/lib/db';

async function safe<T>(p: Promise<T>, fb: T): Promise<T> { try { return await p; } catch { return fb; } }
const num = (v: any): number | null => (v == null ? null : Number(v));
const RELEASED = ['published', 'released', 'completed', 'graded'];
const WINDOW_DAYS = 120;

async function metrics(l: LearnerAccess) {
  const financeVisible = l.data_scopes.includes('fees');
  const [att, perf, fees] = await Promise.all([
    safe(query(
      `SELECT COUNT(*) AS total,
              SUM(ar.status IN ('present','late')) AS present,
              SUM(ar.status = 'late') AS late
         FROM attendance_records ar
         JOIN students s ON s.person_id = ar.person_id AND s.school_id = ar.school_id
        WHERE ar.school_id = ? AND ar.role_type = 'student' AND s.id = ?
          AND ar.status NOT IN ('weekend','holiday')
          AND ar.attendance_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [l.school_id, l.student_id, WINDOW_DAYS],
    ) as Promise<any[]>, [{ total: 0, present: 0, late: 0 }]),
    safe(query(
      `SELECT AVG(r.score) AS avg_score
         FROM results r JOIN exams e ON e.id = r.exam_id AND e.school_id = ?
        WHERE r.student_id = ? AND r.score IS NOT NULL
          AND LOWER(e.status) IN (${RELEASED.map(() => '?').join(',')})`,
      [l.school_id, l.student_id, ...RELEASED],
    ) as Promise<any[]>, [{ avg_score: null }]),
    financeVisible ? safe(query(
      `SELECT
         (SELECT COALESCE(SUM(fs.amount),0) FROM student_fee_items sfi
            JOIN fee_structures fs ON fs.id = sfi.fee_structure_id WHERE sfi.student_id = ?) AS expected,
         (SELECT COALESCE(SUM(amount),0) FROM fee_payments WHERE student_id = ?) AS paid`,
      [l.student_id, l.student_id],
    ) as Promise<any[]>, [{ expected: null, paid: null }]) : Promise.resolve([{ expected: null, paid: null }]),
  ]);

  const total = Number(att[0]?.total ?? 0);
  const present = Number(att[0]?.present ?? 0);
  const expected = num(fees[0]?.expected);
  const paid = num(fees[0]?.paid);
  return {
    learner_access_id: l.learner_access_id,
    learner_name: l.learner_name,
    school_name: l.school_name,
    class_name: l.class_name,
    attendance_rate: total > 0 ? Math.round((present / total) * 1000) / 10 : null,
    late_days: Number(att[0]?.late ?? 0),
    academic_average: perf[0]?.avg_score == null ? null : Math.round(Number(perf[0].avg_score) * 10) / 10,
    fee_balance: financeVisible && expected != null && paid != null ? expected - paid : null,
    fees_visible: financeVisible,
  };
}

export async function GET(req: NextRequest) {
  const res = await requireParent(req);
  if ('error' in res) return res.error;
  const learners = await resolveLearnersForParent(res.session.parentAccountId);
  const rows = await Promise.all(learners.map(metrics));
  return NextResponse.json({ success: true, window_days: WINDOW_DAYS, learners: rows });
}
