/**
 * Budgets (Track B, Batch 5).
 *
 * A budget plans spend for a term / department / project / class / activity.
 * Spent is DERIVED from expenses linked to the budget (expenditures.budget_id),
 * never stored. Each budget reports remaining, % used, deficit and a threshold
 * warning so finance can act before overspending.
 */
import { query, withTransaction } from '@/lib/db';

export interface Budget {
  id: number;
  name: string;
  budget_type: string;
  term_id: number | null;
  scope_ref_id: number | null;
  planned_amount: number;
  approved_amount: number;
  status: string;
  warning_threshold_pct: number;
  notes: string | null;
  spent: number;
  remaining: number;
  used_pct: number;
  deficit: boolean;
  near_threshold: boolean;
}

export async function listBudgets(schoolId: number): Promise<Budget[]> {
  const rows = (await query(
    `SELECT b.*,
            COALESCE((SELECT SUM(e.amount) FROM expenditures e
                       WHERE e.budget_id = b.id AND e.school_id = b.school_id
                         AND e.deleted_at IS NULL
                         AND (e.status IS NULL OR e.status NOT IN ('rejected','cancelled'))), 0) AS spent
       FROM budgets b
      WHERE b.school_id = ?
      ORDER BY b.created_at DESC`,
    [schoolId],
  )) as any[];

  return rows.map((b) => {
    const approved = Number(b.approved_amount) || 0;
    const spent = Number(b.spent) || 0;
    const remaining = approved - spent;
    const used_pct = approved > 0 ? Math.round((spent / approved) * 100) : 0;
    const threshold = Number(b.warning_threshold_pct) || 80;
    return {
      ...b,
      planned_amount: Number(b.planned_amount) || 0,
      approved_amount: approved,
      warning_threshold_pct: threshold,
      spent,
      remaining,
      used_pct,
      deficit: spent > approved && approved > 0,
      near_threshold: approved > 0 && used_pct >= threshold && spent <= approved,
    } as Budget;
  });
}

export async function createBudget(params: {
  schoolId: number;
  name: string;
  budgetType: string;
  termId?: number | null;
  scopeRefId?: number | null;
  plannedAmount?: number;
  approvedAmount?: number;
  warningThresholdPct?: number;
  notes?: string | null;
  createdBy?: number | null;
}): Promise<number> {
  const res = (await query(
    `INSERT INTO budgets
       (school_id, name, budget_type, term_id, scope_ref_id, planned_amount,
        approved_amount, status, warning_threshold_pct, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    [params.schoolId, params.name, params.budgetType, params.termId ?? null, params.scopeRefId ?? null,
     params.plannedAmount ?? 0, params.approvedAmount ?? 0, params.warningThresholdPct ?? 80,
     params.notes ?? null, params.createdBy ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}

export async function setBudgetStatus(
  schoolId: number, budgetId: number, status: 'draft' | 'approved' | 'closed', userId?: number | null,
): Promise<void> {
  await withTransaction(async (conn: any) => {
    if (status === 'approved') {
      await conn.execute(
        `UPDATE budgets SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
          WHERE id = ? AND school_id = ?`,
        [userId ?? null, budgetId, schoolId],
      );
    } else {
      await conn.execute(`UPDATE budgets SET status = ? WHERE id = ? AND school_id = ?`, [status, budgetId, schoolId]);
    }
    await conn.execute(
      `INSERT INTO finance_actions (school_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, 'budget', ?, ?)`,
      [schoolId, userId ?? null, `budget_${status}`, budgetId, JSON.stringify({ status })],
    );
  });
}

/** Budget-derived warnings for the finance dashboard. */
export async function budgetWarnings(schoolId: number) {
  const budgets = await listBudgets(schoolId);
  const warnings: Array<{ level: 'danger' | 'warning'; budget_id: number; name: string; message: string }> = [];
  for (const b of budgets) {
    if (b.status === 'closed') continue;
    if (b.deficit) warnings.push({ level: 'danger', budget_id: b.id, name: b.name, message: `${b.name} exceeded budget (${b.used_pct}% used)` });
    else if (b.near_threshold) warnings.push({ level: 'warning', budget_id: b.id, name: b.name, message: `${b.name} at ${b.used_pct}% of budget` });
  }
  return warnings;
}
