/**
 * GET /api/parent/learners/[learnerAccessId]/fees
 * Gated. Fee balance + payment history. Honors the per-school finance toggle
 * (resolved into access.finance_visible).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLearnerAccess } from '@/lib/parent/context';
import { query } from '@/lib/db';

async function safe<T>(p: Promise<T>, fb: T): Promise<T> { try { return await p; } catch { return fb; } }
const num = (v: any): number | null => (v == null ? null : Number(v));

export async function GET(req: NextRequest, { params }: { params: Promise<{ learnerAccessId: string }> }) {
  const { learnerAccessId } = await params;
  const res = await requireLearnerAccess(req, learnerAccessId);
  if ('error' in res) return res.error;
  const { student_id, finance_visible } = res.access;

  if (!finance_visible) {
    return NextResponse.json({ success: true, visible: false, fees: null, payments: [] });
  }

  const [totals, payments] = await Promise.all([
    safe(query(
      `SELECT
         (SELECT COALESCE(SUM(fs.amount),0) FROM student_fee_items sfi
            JOIN fee_structures fs ON fs.id = sfi.fee_structure_id WHERE sfi.student_id = ?) AS expected,
         (SELECT COALESCE(SUM(amount),0) FROM fee_payments WHERE student_id = ?) AS paid`,
      [student_id, student_id],
    ) as Promise<any[]>, [{ expected: null, paid: null }]),
    safe(query(
      `SELECT amount, method, receipt_no, reference, created_at
         FROM fee_payments WHERE student_id = ? ORDER BY created_at DESC LIMIT 50`,
      [student_id],
    ) as Promise<any[]>, []),
  ]);

  const expected = num(totals[0]?.expected);
  const paid = num(totals[0]?.paid);
  return NextResponse.json({
    success: true,
    visible: true,
    fees: { expected, paid, balance: expected != null && paid != null ? expected - paid : null },
    payments: payments.map((p: any) => ({
      amount: Number(p.amount), method: p.method ?? null,
      receipt_no: p.receipt_no ?? p.reference ?? null, at: p.created_at,
    })),
  });
}
