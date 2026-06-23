/**
 * GET /api/parent/learners/[learnerAccessId]/pocket-money
 * Gated (honors the per-school finance visibility toggle). Read-only pocket
 * money balance + recent transactions for the parent's linked learner.
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

  if (!finance_visible) return NextResponse.json({ success: true, visible: false, enabled: false, balance: 0, transactions: [] });

  const acct = await safe(query(
    `SELECT id FROM pocket_money_accounts WHERE student_id = ? AND school_id = ? LIMIT 1`,
    [student_id, school_id],
  ) as Promise<any[]>, []);
  if (!acct[0]) return NextResponse.json({ success: true, visible: true, enabled: false, balance: 0, transactions: [] });

  const [bal] = await safe(query(
    `SELECT COALESCE(SUM(CASE WHEN type='deposit' THEN amount ELSE -amount END),0) AS balance
       FROM pocket_money_transactions WHERE account_id = ? AND school_id = ?`,
    [acct[0].id, school_id],
  ) as Promise<any[]>, [{ balance: 0 }]);

  const txns = await safe(query(
    `SELECT type, amount, reason, depositor_name, slip_no, created_at
       FROM pocket_money_transactions WHERE account_id = ? AND school_id = ?
      ORDER BY id DESC LIMIT 50`,
    [acct[0].id, school_id],
  ) as Promise<any[]>, []);

  return NextResponse.json({
    success: true,
    visible: true,
    enabled: true,
    balance: Number(bal?.balance) || 0,
    transactions: txns.map((t: any) => ({
      type: t.type, amount: Number(t.amount),
      note: t.reason || t.depositor_name || t.slip_no || null, at: t.created_at,
    })),
  });
}
