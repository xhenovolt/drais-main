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
  const { student_id, school_id, finance_visible } = res.access;

  if (!finance_visible) {
    return NextResponse.json({ success: true, visible: false, fees: null, payments: [] });
  }

  // Canonical sources: expected = net charges (student_fee_items); paid =
  // canonical finance_payments. (Previously read the retired fee_payments table,
  // so parents saw nothing.) school_id enforced for defense-in-depth.
  const [totals, payments] = await Promise.all([
    safe(query(
      `SELECT
         (SELECT COALESCE(SUM(sfi.amount - sfi.discount - sfi.waived),0)
            FROM student_fee_items sfi WHERE sfi.student_id = ?) AS expected,
         (SELECT COALESCE(SUM(amount),0)
            FROM finance_payments WHERE student_id = ? AND school_id = ?) AS paid`,
      [student_id, student_id, school_id],
    ) as Promise<any[]>, [{ expected: null, paid: null }]),
    safe(query(
      `SELECT amount, method, receipt_no, reference, created_at
         FROM finance_payments WHERE student_id = ? AND school_id = ?
        ORDER BY created_at DESC LIMIT 50`,
      [student_id, school_id],
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
