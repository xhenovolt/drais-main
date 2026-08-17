/**
 * GET /api/finance/dashboard — one trusted, school-scoped finance overview.
 *
 * Top-line is reconciled at school level: expected = net charges
 * (student_fee_items.amount − discount − waived); collected = SUM(canonical
 * finance_payments.amount); outstanding = expected − collected. Money-by-
 * location, budgets, pocket money, unreconciled, imports, recent receipts and
 * reversals come from their canonical tables/services.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { listLocations } from '@/lib/finance/locations';
import { listBudgets, budgetWarnings } from '@/lib/finance/budgets';
import { listAccounts as listPocket } from '@/lib/finance/pocketMoney';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';
const num = (v: any) => Number(v) || 0;

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const schoolId = session.schoolId;

  // ── Fees: expected (net charges) ──
  const [feeAgg] = (await query(
    `SELECT COALESCE(SUM(amount - discount - waived), 0) AS expected,
            COUNT(DISTINCT student_id) AS billed_learners
       FROM student_fee_items WHERE student_id IN (SELECT id FROM students WHERE school_id = ? AND deleted_at IS NULL)`,
    [schoolId],
  )) as any[];
  const expected = num(feeAgg?.expected);

  // ── Collections (canonical payments) ──
  const [payAgg] = (await query(
    `SELECT COALESCE(SUM(amount), 0) AS collected, COUNT(*) AS payments_count,
            COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN amount ELSE 0 END), 0) AS today,
            COALESCE(SUM(CASE WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN amount ELSE 0 END), 0) AS this_month
       FROM finance_payments WHERE school_id = ?`,
    [schoolId],
  )) as any[];
  const collected = num(payAgg?.collected);
  const outstanding = Math.max(expected - collected, 0);

  // ── Learners with an outstanding balance (ledger-derived) ──
  const [unpaidAgg] = (await query(
    `SELECT COUNT(*) AS unpaid FROM (
        SELECT student_id, SUM(CASE WHEN type='debit' THEN amount ELSE -amount END) AS bal
          FROM student_ledger WHERE school_id = ? GROUP BY student_id HAVING bal > 0
     ) x`,
    [schoolId],
  )) as any[];

  // ── Outstanding by class (charges − payments) ──
  const balancesByClass = (await query(
    `SELECT c.name AS class_name,
            COALESCE(SUM(sfi.amount - sfi.discount - sfi.waived), 0) AS expected,
            COALESCE(SUM(sfi.paid), 0) AS paid
       FROM student_fee_items sfi
       JOIN students s ON s.id = sfi.student_id AND s.school_id = ?
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN classes c ON c.id = e.class_id
      GROUP BY c.name ORDER BY (COALESCE(SUM(sfi.amount - sfi.discount - sfi.waived),0) - COALESCE(SUM(sfi.paid),0)) DESC
      LIMIT 12`,
    [schoolId],
  )) as any[];

  // ── Money locations ──
  const locations = await listLocations(schoolId);
  const moneyByLocation = locations.map((l) => ({ name: l.name, type: l.location_type, balance: l.balance }));
  const totalsByType: Record<string, number> = {};
  let cashTotal = 0;
  for (const l of locations) { totalsByType[l.location_type] = (totalsByType[l.location_type] || 0) + l.balance; cashTotal += l.balance; }

  // ── Budgets ──
  const budgets = await listBudgets(schoolId);
  const budgetHealth = {
    count: budgets.length,
    approved: budgets.reduce((s, b) => s + b.approved_amount, 0),
    spent: budgets.reduce((s, b) => s + b.spent, 0),
    over: budgets.filter((b) => b.deficit).length,
  };

  // ── Pocket money liability ──
  const pocket = await listPocket(schoolId);
  const pocketLiability = pocket.reduce((s, a) => s + a.balance, 0);

  // ── Operational counts ──
  const [reconAgg] = (await query(
    `SELECT COUNT(*) AS unreconciled FROM payment_reconciliations WHERE school_id = ? AND status = 'pending'`,
    [schoolId],
  )) as any[];
  const [importAgg] = (await query(
    `SELECT COUNT(*) AS batches,
            COALESCE(SUM(CASE WHEN status='preview' THEN 1 ELSE 0 END),0) AS pending
       FROM finance_import_batches WHERE school_id = ?`,
    [schoolId],
  )) as any[];

  const recentReceipts = (await query(
    `SELECT r.receipt_no, r.amount, r.created_at,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS student_name
       FROM receipts r
       LEFT JOIN students s ON s.id = r.student_id
       LEFT JOIN people p ON p.id = s.person_id
      WHERE r.school_id = ? ORDER BY r.id DESC LIMIT 6`,
    [schoolId],
  )) as any[];

  // ── Warnings ──
  const warnings = await budgetWarnings(schoolId);
  const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
  if (expected > 0 && collectionRate < 50) {
    warnings.unshift({ level: 'warning', budget_id: 0, name: 'collection', message: `Collection at ${collectionRate}% of expected` });
  }
  if (num(unpaidAgg?.unpaid) > 0 && num(feeAgg?.billed_learners) > 0) {
    const unpaidPct = Math.round((num(unpaidAgg.unpaid) / num(feeAgg.billed_learners)) * 100);
    if (unpaidPct >= 50) warnings.unshift({ level: 'warning', budget_id: 0, name: 'unpaid', message: `${unpaidPct}% of billed learners still owe` });
  }

  return NextResponse.json({
    success: true,
    fees: { expected, collected, outstanding, collectionRate, today: num(payAgg?.today), thisMonth: num(payAgg?.this_month), paymentsCount: num(payAgg?.payments_count), unpaidLearners: num(unpaidAgg?.unpaid) },
    balancesByClass: balancesByClass.map((c) => ({ class_name: c.class_name || 'Unassigned', expected: num(c.expected), paid: num(c.paid), outstanding: num(c.expected) - num(c.paid) })),
    money: { total: cashTotal, byType: totalsByType, locations: moneyByLocation },
    budgets: budgetHealth,
    pocketLiability,
    ops: { unreconciled: num(reconAgg?.unreconciled), importBatches: num(importAgg?.batches), importPending: num(importAgg?.pending) },
    recentReceipts,
    warnings,
  });
}
