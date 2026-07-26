/**
 * Control Center — platform business intelligence (Phase 24 / E-21).
 *
 * Turns the operational data into a business view: MRR / ARR, revenue collected,
 * outstanding receivables, school status mix, plan mix, and simple churn — built
 * on the billing ledger + plan catalog. `monthlyEquivalent` is PURE + tested.
 */
import { query } from '@/lib/db';
import { billingCycleDays } from '@/lib/control/subscriptions';

/** PURE: normalise any billing cycle's price to a monthly-equivalent figure. */
export function monthlyEquivalent(price: number, cycleDays: number): number {
  if (!cycleDays || cycleDays <= 0) return 0; // one-time fees don't recur
  return Math.round(((Number(price) || 0) * 30) / cycleDays);
}

const num = (rows: any[], key = 'n') => Number(rows?.[0]?.[key] || 0);

export async function getPlatformBI() {
  const one = async (sql: string, params: any[] = []) => (await query(sql, params).catch(() => [{}])) as any[];

  // School status mix.
  const statusRows = await one(
    `SELECT SUM(status = 'active' OR status IS NULL) active,
            SUM(status = 'suspended') suspended,
            SUM(status = 'archived') archived
       FROM schools WHERE deleted_at IS NULL`,
  );

  // MRR — sum the monthly-equivalent subscription price of every ACTIVE school.
  const planRows = await one(
    `SELECT p.price, p.billing_cycle, p.currency, COUNT(*) n
       FROM schools s JOIN subscription_plans p ON p.code = s.subscription_plan
      WHERE s.deleted_at IS NULL AND (s.status = 'active' OR s.status IS NULL)
      GROUP BY p.code, p.price, p.billing_cycle, p.currency`,
  );
  let mrr = 0;
  const currency = planRows[0]?.currency || 'UGX';
  for (const r of planRows) mrr += monthlyEquivalent(Number(r.price), billingCycleDays(r.billing_cycle)) * Number(r.n);

  // Plan mix (active schools per plan, with plan name).
  const planMix = await one(
    `SELECT s.subscription_plan code, COALESCE(p.name, s.subscription_plan) name, COUNT(*) n
       FROM schools s LEFT JOIN subscription_plans p ON p.code = s.subscription_plan
      WHERE s.deleted_at IS NULL AND (s.status = 'active' OR s.status IS NULL) AND s.subscription_plan IS NOT NULL
      GROUP BY s.subscription_plan, p.name ORDER BY n DESC`,
  );

  // Revenue collected (payments) + outstanding (unpaid invoices).
  const collected = await one(
    `SELECT COALESCE(SUM(amount),0) all_time,
            COALESCE(SUM(CASE WHEN received_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount ELSE 0 END),0) last_30d
       FROM platform_payments`,
  );
  const receivable = await one(
    `SELECT COALESCE(SUM(i.amount),0) - COALESCE(SUM(pp.paid),0) AS outstanding
       FROM platform_invoices i
       LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM platform_payments GROUP BY invoice_id) pp ON pp.invoice_id = i.id
      WHERE i.voided = 0 AND i.paid_at IS NULL`,
  );

  // Simple churn signal: schools whose subscription lapsed in the last 30 days.
  const churn = await one(
    `SELECT COUNT(*) n FROM schools
      WHERE deleted_at IS NULL AND status = 'suspended' AND updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
  );

  const mrrVal = Math.round(mrr);
  return {
    currency,
    schools: {
      active: num(statusRows, 'active'),
      suspended: num(statusRows, 'suspended'),
      archived: num(statusRows, 'archived'),
    },
    mrr: mrrVal,
    arr: mrrVal * 12,
    revenue: { all_time: num(collected, 'all_time'), last_30d: num(collected, 'last_30d') },
    outstanding: num(receivable, 'outstanding'),
    churn_30d: num(churn),
    plan_mix: planMix.map((r) => ({ code: r.code, name: r.name, count: Number(r.n) })),
  };
}
