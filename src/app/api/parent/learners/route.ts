/**
 * GET /api/parent/learners
 * Linked learners across all schools, each enriched with a summary card:
 * today's attendance, fee balance (if school exposes finances), academic avg.
 * Exposes only learner_access_id — never the internal student_id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireParent } from '@/lib/parent/context';
import { resolveLearnersForParent, type LearnerAccess } from '@/lib/parent/parent-access-resolver';
import { query } from '@/lib/db';

async function safe<T>(p: Promise<T>, fb: T): Promise<T> { try { return await p; } catch { return fb; } }
const num = (v: any): number | null => (v == null ? null : Number(v));
const RELEASED = ['published', 'released', 'completed', 'graded'];

async function cardSummary(l: LearnerAccess) {
  const financeVisible = l.data_scopes.includes('fees');
  const [today, fees, perf] = await Promise.all([
    safe(query(
      `SELECT ar.status, ar.first_in_at, ar.late_minutes
         FROM attendance_records ar
         JOIN students s ON s.person_id = ar.person_id AND s.school_id = ar.school_id AND s.deleted_at IS NULL
        WHERE ar.school_id = ? AND ar.role_type = 'student' AND s.id = ?
          AND ar.attendance_date = CURDATE() LIMIT 1`,
      [l.school_id, l.student_id],
    ) as Promise<any[]>, []),
    financeVisible ? safe(query(
      `SELECT
         (SELECT COALESCE(SUM(fs.amount),0) FROM student_fee_items sfi
            JOIN fee_structures fs ON fs.id = sfi.fee_structure_id WHERE sfi.student_id = ?) AS expected,
         (SELECT COALESCE(SUM(amount),0) FROM fee_payments WHERE student_id = ?) AS paid`,
      [l.student_id, l.student_id],
    ) as Promise<any[]>, [{ expected: null, paid: null }]) : Promise.resolve([{ expected: null, paid: null }]),
    safe(query(
      `SELECT AVG(r.score) AS avg_score
         FROM results r JOIN exams e ON e.id = r.exam_id AND e.school_id = ?
        WHERE r.student_id = ? AND r.score IS NOT NULL
          AND LOWER(e.status) IN (${RELEASED.map(() => '?').join(',')})`,
      [l.school_id, l.student_id, ...RELEASED],
    ) as Promise<any[]>, [{ avg_score: null }]),
  ]);

  const expected = num(fees[0]?.expected);
  const paid = num(fees[0]?.paid);
  return {
    attendance_today: today[0]?.status ?? null,
    fees: {
      visible: financeVisible,
      balance: financeVisible && expected != null && paid != null ? expected - paid : null,
    },
    academic_average: perf[0]?.avg_score == null ? null : Math.round(Number(perf[0].avg_score) * 10) / 10,
  };
}

export async function GET(req: NextRequest) {
  const res = await requireParent(req);
  if ('error' in res) return res.error;

  const learners = await resolveLearnersForParent(res.session.parentAccountId);
  const cards = await Promise.all(learners.map(async (l) => {
    const summary = await cardSummary(l);
    return {
      learner_access_id: l.learner_access_id,
      learner_name:      l.learner_name,
      school_name:       l.school_name,
      class_name:        l.class_name,
      stream_name:       l.stream_name,
      relationship:      l.relationship,
      data_scopes:       l.data_scopes,
      summary,
    };
  }));

  // Cross-school grouped view: { school -> learners[] }
  const bySchool: Record<string, typeof cards> = {};
  for (const c of cards) (bySchool[c.school_name] ??= []).push(c);

  return NextResponse.json({
    success: true,
    learner_count: cards.length,
    learners: cards,
    grouped_by_school: Object.entries(bySchool).map(([school, items]) => ({ school, learners: items })),
  });
}
