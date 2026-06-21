/**
 * GET /api/portal/learners/[studentId]/fees
 * Gated. Fee position (expected/paid/balance) + recent payment history for a
 * parent's linked learner. Finance columns drift across deployments, so each
 * metric is wrapped in safe() and degrades to null rather than 500ing.
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

  const [totals, payments] = await Promise.all([
    safe(query(
      `SELECT
         (SELECT COALESCE(SUM(fs.amount),0) FROM student_fee_items sfi
            JOIN fee_structures fs ON fs.id = sfi.fee_structure_id
           WHERE sfi.student_id = ?) AS expected,
         (SELECT COALESCE(SUM(amount),0) FROM fee_payments WHERE student_id = ?) AS paid`,
      [studentId, studentId],
    ) as Promise<any[]>, [{ expected: null, paid: null }]),
    safe(query(
      `SELECT amount, method, receipt_no, reference, created_at
         FROM fee_payments
        WHERE student_id = ?
        ORDER BY created_at DESC LIMIT 25`,
      [studentId],
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
