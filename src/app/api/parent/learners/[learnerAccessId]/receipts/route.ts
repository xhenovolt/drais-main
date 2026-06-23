/**
 * GET /api/parent/learners/[learnerAccessId]/receipts
 * Gated. Payment receipts for the learner (printable list). Honors the
 * per-school finance visibility toggle.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLearnerAccess } from '@/lib/parent/context';
import { query } from '@/lib/db';

async function safe<T>(p: Promise<T>, fb: T): Promise<T> { try { return await p; } catch { return fb; } }

export async function GET(req: NextRequest, { params }: { params: Promise<{ learnerAccessId: string }> }) {
  const { learnerAccessId } = await params;
  const res = await requireLearnerAccess(req, learnerAccessId);
  if ('error' in res) return res.error;
  const { student_id, school_id, finance_visible } = res.access;

  if (!finance_visible) return NextResponse.json({ success: true, visible: false, receipts: [] });

  // Canonical receipts table (written by recordPayment). school_id enforced.
  const rows = await safe(query(
    `SELECT id, amount, payment_method, receipt_no, reference, created_at
       FROM receipts WHERE student_id = ? AND school_id = ? ORDER BY id DESC LIMIT 100`,
    [student_id, school_id],
  ) as Promise<any[]>, []);

  return NextResponse.json({
    success: true,
    visible: true,
    receipts: rows.map((r: any) => ({
      id: r.id,
      receipt_no: r.receipt_no ?? r.reference ?? `PAY-${r.id}`,
      amount: Number(r.amount),
      method: r.payment_method ?? null,
      at: r.created_at,
    })),
  });
}
