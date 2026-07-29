/**
 * GET /api/portal/learners/[studentId]/fees
 * Gated. Fee position (expected/paid/balance) + recent payment history for a
 * parent's linked learner. Finance columns drift across deployments, so each
 * metric is wrapped in safe() and degrades to null rather than 500ing.
 *
 * Finance Consolidation Plan, Stage B: this route previously (a) computed
 * "expected" via an INNER JOIN through student_fee_items.fee_structure_id —
 * NULL for every bill line the newer fee_eligibility_rules engine creates,
 * so parents at any school using the modern billing path saw an
 * UNDERCOUNTED balance (some/all of their charges silently excluded), and
 * (b) read the retired `fee_payments` table (its own API route returns 410).
 * Both fixed to match the canonical parent route
 * (/api/parent/learners/[id]/fees): sum student_fee_items directly (no
 * fee_structure_id dependency) and read finance_payments.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLinkedLearner } from '@/lib/portal/context';
import { financeVisibleToParents } from '@/lib/portal/visibility';
import { query } from '@/lib/db';

async function safe<T>(p: Promise<T>, fb: T): Promise<T> { try { return await p; } catch { return fb; } }
const num = (v: any): number | null => (v == null ? null : Number(v));

export async function GET(req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const studentId = Number((await params).studentId);
  if (!studentId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const res = await requireLinkedLearner(req, studentId);
  if ('error' in res) return res.error;

  // Per-school privacy control: a school can hide finances from parents.
  if (!(await financeVisibleToParents(res.ctx.schoolId))) {
    return NextResponse.json({ success: true, visible: false, fees: null, payments: [] });
  }

  const schoolId = res.ctx.schoolId;
  const [totals, payments] = await Promise.all([
    safe(query(
      `SELECT
         (SELECT COALESCE(SUM(sfi.amount - sfi.discount - sfi.waived),0)
            FROM student_fee_items sfi WHERE sfi.student_id = ?) AS expected,
         (SELECT COALESCE(SUM(amount),0)
            FROM finance_payments WHERE student_id = ? AND school_id = ?) AS paid`,
      [studentId, studentId, schoolId],
    ) as Promise<any[]>, [{ expected: null, paid: null }]),
    safe(query(
      `SELECT amount, method, receipt_no, reference, created_at
         FROM finance_payments WHERE student_id = ? AND school_id = ?
        ORDER BY created_at DESC LIMIT 25`,
      [studentId, schoolId],
    ) as Promise<any[]>, []),
  ]);

  const expected = num(totals[0]?.expected);
  const paid = num(totals[0]?.paid);

  return NextResponse.json({
    success: true,
    visible: true,
    fees: {
      expected, paid,
      balance: expected != null && paid != null ? expected - paid : null,
    },
    payments: payments.map((p: any) => ({
      amount: Number(p.amount),
      method: p.method ?? null,
      receipt_no: p.receipt_no ?? p.reference ?? null,
      at: p.created_at,
    })),
  });
}
