/**
 * Control Center — subscription plan engine (Roadmap P5).
 *
 * Turns free-text plan strings into a real catalog: named tiers with
 * configurable resource limits (learners / staff / devices / SMS / storage).
 * A school references a plan by code via the existing `schools.subscription_plan`
 * column, so no tenant-schema change is needed.
 *
 * Enforcement is intentionally split: this module owns the catalog + the PURE
 * limit maths (`usageAgainst`, `checkCanAdd`) so quotas can be surfaced now and
 * hard-enforced at each create path later without re-deriving the rules.
 */
import { query } from '@/lib/db';
import { controlAudit } from '@/lib/control/auth';
import { getSetting, setSetting } from '@/lib/control/platform-settings';
import { getUsage } from '@/lib/entitlements/limits';

export interface PlanLimits {
  learners?: number | null; staff?: number | null; devices?: number | null;
  sms_monthly?: number | null; storage_mb?: number | null;
}
export const BILLING_CYCLES = ['monthly', 'termly', 'annual', 'one_time'] as const;
export type BillingCycle = typeof BILLING_CYCLES[number];

export interface PlanBilling {
  installation_fee: number;      // ONE-TIME setup fee, billed on the school's first invoice only
  price: number;                 // recurring subscription price for one billing cycle, in `currency`
  currency: string;              // e.g. 'UGX'
  billing_cycle: BillingCycle;   // how often the subscription is due
  installments: number;          // how many payments the cycle price may be split into (1 = pay in full)
  deliverables: string[];        // what the school gets for this plan (commitments)
}

/** PURE: split an invoice into installation (first time only) + subscription. */
export function invoiceAmounts(installationFee: number, subscriptionPrice: number, isFirstInvoice: boolean): { installation: number; subscription: number; total: number } {
  const installation = isFirstInvoice ? Math.max(0, Math.round(Number(installationFee) || 0)) : 0;
  const subscription = Math.max(0, Math.round(Number(subscriptionPrice) || 0));
  return { installation, subscription, total: installation + subscription };
}

export interface SubscriptionPlan extends PlanBilling {
  code: string; name: string; tier: number; limits: PlanLimits; features: string[]; is_active: boolean;
}

export const LIMIT_KEYS = ['learners', 'staff', 'devices', 'sms_monthly', 'storage_mb'] as const;
export type LimitKey = typeof LIMIT_KEYS[number];

/** PURE: days in a billing cycle (termly ≈ 122d/3 terms; annual = 365). */
export function billingCycleDays(cycle: BillingCycle): number {
  return cycle === 'monthly' ? 30 : cycle === 'termly' ? 122 : cycle === 'annual' ? 365 : 0;
}

/** PURE: the subscription end date for a cycle starting at `from` (one_time → null). */
export function nextEndDate(cycle: BillingCycle, from: Date = new Date()): string | null {
  const days = billingCycleDays(cycle);
  if (days === 0) return null; // one_time: no expiry
  const d = new Date(from.getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** PURE: the per-installment amount (rounded up to the currency's unit). */
export function installmentAmount(price: number, installments: number): number {
  const n = Math.max(1, Math.floor(installments || 1));
  return Math.ceil((Number(price) || 0) / n);
}

/** Seed presets — null limit = unlimited. Custom is created ad-hoc by operators. */
const b = (installation: number, price: number, cycle: BillingCycle, installments: number, deliverables: string[]): PlanBilling =>
  ({ installation_fee: installation, price, currency: 'UGX', billing_cycle: cycle, installments, deliverables });

const PRESETS: SubscriptionPlan[] = [
  { code: 'starter', name: 'Starter', tier: 1, is_active: true,
    limits: { learners: 300, staff: 30, devices: 1, sms_monthly: 500, storage_mb: 2000 },
    features: ['attendance'],
    ...b(800_000, 1_200_000, 'annual', 3, ['1 biometric device', 'Attendance module', 'Email support']) },
  { code: 'standard', name: 'Standard', tier: 2, is_active: true,
    limits: { learners: 800, staff: 80, devices: 2, sms_monthly: 2000, storage_mb: 5000 },
    features: ['attendance', 'finance', 'parent_portal'],
    ...b(1_500_000, 2_400_000, 'annual', 3, ['2 biometric devices', 'Attendance + Finance', 'Parent portal', 'Priority email support']) },
  { code: 'professional', name: 'Professional', tier: 3, is_active: true,
    limits: { learners: 2000, staff: 200, devices: 5, sms_monthly: 10000, storage_mb: 20000 },
    features: ['attendance', 'finance', 'parent_portal', 'tahfiz', 'analytics'],
    ...b(2_500_000, 4_800_000, 'annual', 3, ['5 devices', 'All standard + Tahfiz + Analytics', 'On-site setup', 'Phone support']) },
  { code: 'enterprise', name: 'Enterprise', tier: 4, is_active: true,
    limits: { learners: null, staff: null, devices: 20, sms_monthly: 50000, storage_mb: 100000 },
    features: ['attendance', 'finance', 'parent_portal', 'tahfiz', 'analytics', 'hr'],
    ...b(5_000_000, 9_600_000, 'annual', 4, ['Up to 20 devices', 'All modules incl. HR', 'Dedicated account manager', 'SLA support']) },
  { code: 'government', name: 'Government', tier: 5, is_active: true,
    limits: { learners: null, staff: null, devices: null, sms_monthly: null, storage_mb: null },
    features: ['attendance', 'finance', 'parent_portal', 'tahfiz', 'analytics', 'hr'],
    ...b(0, 0, 'annual', 1, ['Unlimited everything', 'Custom contract & pricing', 'Dedicated support']) },
];

/**
 * PLAN TOMBSTONES — the definitive "stay deleted" mechanism.
 *
 * A preset an operator deletes goes into a persistent tombstone set. The seeder
 * NEVER recreates a tombstoned code — no matter how many times it runs, on which
 * cold start, from which code version. This is what finally kills the "Starter
 * keeps coming back" bug for good. Manually (re)creating a plan clears its
 * tombstone, so operator intent always wins over the guard.
 */
async function getDeletedPlanCodes(): Promise<string[]> {
  try {
    const raw = await getSetting('deleted_plan_codes');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch { return []; }
}
async function tombstonePlanCode(code: string): Promise<void> {
  const cur = await getDeletedPlanCodes();
  if (!cur.includes(code)) await setSetting('deleted_plan_codes', JSON.stringify([...cur, code])).catch(() => {});
}
async function untombstonePlanCode(code: string): Promise<void> {
  const cur = await getDeletedPlanCodes();
  if (cur.includes(code)) await setSetting('deleted_plan_codes', JSON.stringify(cur.filter(c => c !== code))).catch(() => {});
}

let ensured: Promise<void> | null = null;
export function ensureSubscriptionPlansSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS subscription_plans (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         code VARCHAR(40) NOT NULL,
         name VARCHAR(80) NOT NULL,
         tier INT NOT NULL DEFAULT 0,
         limits JSON,
         features JSON,
         is_active TINYINT NOT NULL DEFAULT 1,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uk_plan_code (code)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, [],
    );
    // Billing columns (additive — plans predate them).
    for (const ddl of [
      `ADD COLUMN price DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ADD COLUMN installation_fee DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ADD COLUMN currency VARCHAR(8) NOT NULL DEFAULT 'UGX'`,
      `ADD COLUMN billing_cycle VARCHAR(16) NOT NULL DEFAULT 'annual'`,
      `ADD COLUMN installments INT NOT NULL DEFAULT 1`,
      `ADD COLUMN deliverables JSON`,
    ]) {
      await query(`ALTER TABLE subscription_plans ${ddl}`, []).catch(() => {});
    }
    // Seed presets ONLY on first-ever bootstrap. Serverless re-runs this ensure
    // on every cold start; an unconditional INSERT IGNORE would resurrect any
    // preset an operator deleted (the "Starter keeps coming back" bug). Once the
    // catalog exists, the operator owns it — deletions must stick.
    const seeded = await getSetting('plans_seeded').catch(() => null);
    if (!seeded) {
      const existing = (await query(`SELECT COUNT(*) AS n FROM subscription_plans`, []).catch(() => [{ n: 0 }])) as any[];
      // Only seed when the table is genuinely empty. A non-empty table means the
      // platform is already bootstrapped (existing installs) — just mark it.
      if (Number(existing[0]?.n || 0) === 0) {
        // NEVER resurrect a tombstoned (operator-deleted) preset, even on a
        // fresh bootstrap — the last line of defence against "it came back".
        const tomb = await getDeletedPlanCodes();
        for (const p of PRESETS) {
          if (tomb.includes(p.code)) continue;
          await query(
            `INSERT IGNORE INTO subscription_plans
               (code, name, tier, limits, features, is_active, price, installation_fee, currency, billing_cycle, installments, deliverables)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
            [p.code, p.name, p.tier, JSON.stringify(p.limits), JSON.stringify(p.features),
             p.price, p.installation_fee, p.currency, p.billing_cycle, p.installments, JSON.stringify(p.deliverables)],
          ).catch(() => {});
        }
      }
      await setSetting('plans_seeded', '1').catch(() => {});
    }
  })();
  return ensured;
}

const parse = (v: any, fallback: any) => {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};
const rowToPlan = (r: any): SubscriptionPlan => ({
  code: r.code, name: r.name, tier: Number(r.tier || 0),
  limits: parse(r.limits, {}), features: parse(r.features, []), is_active: !!Number(r.is_active),
  price: Number(r.price || 0), installation_fee: Number(r.installation_fee || 0), currency: r.currency || 'UGX',
  billing_cycle: (BILLING_CYCLES as readonly string[]).includes(r.billing_cycle) ? r.billing_cycle : 'annual',
  installments: Math.max(1, Number(r.installments || 1)), deliverables: parse(r.deliverables, []),
});

export async function listPlans(): Promise<SubscriptionPlan[]> {
  await ensureSubscriptionPlansSchema();
  const rows = (await query(`SELECT * FROM subscription_plans ORDER BY tier ASC, name ASC`, []).catch(() => [])) as any[];
  return rows.map(rowToPlan);
}

export async function getPlanByCode(code: string): Promise<SubscriptionPlan | null> {
  await ensureSubscriptionPlansSchema();
  const rows = (await query(`SELECT * FROM subscription_plans WHERE code = ? LIMIT 1`, [code]).catch(() => [])) as any[];
  return rows[0] ? rowToPlan(rows[0]) : null;
}

/** Create or update a plan (operator-authored). Returns the saved plan. */
export async function upsertPlan(input: {
  code: string; name: string; tier?: number; limits?: PlanLimits; features?: string[]; is_active?: boolean;
  price?: number; installation_fee?: number; currency?: string; billing_cycle?: BillingCycle; installments?: number; deliverables?: string[];
}): Promise<SubscriptionPlan> {
  await ensureSubscriptionPlansSchema();
  const code = input.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const cycle = (BILLING_CYCLES as readonly string[]).includes(input.billing_cycle as string) ? input.billing_cycle! : 'annual';
  await query(
    `INSERT INTO subscription_plans
       (code, name, tier, limits, features, is_active, price, installation_fee, currency, billing_cycle, installments, deliverables)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), tier = VALUES(tier),
       limits = VALUES(limits), features = VALUES(features), is_active = VALUES(is_active),
       price = VALUES(price), installation_fee = VALUES(installation_fee), currency = VALUES(currency),
       billing_cycle = VALUES(billing_cycle), installments = VALUES(installments), deliverables = VALUES(deliverables)`,
    [code, input.name.trim(), input.tier ?? 0, JSON.stringify(input.limits ?? {}),
     JSON.stringify(input.features ?? []), input.is_active === false ? 0 : 1,
     Number(input.price) || 0, Number(input.installation_fee) || 0, (input.currency || 'UGX').slice(0, 8), cycle,
     Math.max(1, Number(input.installments) || 1), JSON.stringify(input.deliverables ?? [])],
  );
  await untombstonePlanCode(code); // operator explicitly (re)created it — lift any tombstone
  return (await getPlanByCode(code))!;
}

/** How many (non-deleted) schools are currently on a plan code. */
export async function schoolsOnPlan(code: string): Promise<number> {
  const r = (await query(
    `SELECT COUNT(*) n FROM schools WHERE subscription_plan = ? AND deleted_at IS NULL`, [code],
  ).catch(() => [{ n: 0 }])) as any[];
  return Number(r[0]?.n || 0);
}

/** Delete a plan. Refuses while any school is still assigned to it. */
export async function deletePlan(code: string, operatorId: number | null, ip?: string | null): Promise<{ ok: boolean; reason?: string }> {
  const inUse = await schoolsOnPlan(code);
  if (inUse > 0) return { ok: false, reason: `${inUse} school(s) still on this plan — reassign them first` };
  await query(`DELETE FROM subscription_plans WHERE code = ?`, [code]);
  await tombstonePlanCode(code); // stays dead: the seeder can never bring it back
  await controlAudit(operatorId, 'plan_deleted', `plans:${code}`, null, ip ?? null);
  return { ok: true };
}

/**
 * Assign a plan to a school. Also starts the billing clock: the subscription
 * end date is set from the plan's billing cycle (annual → +365d, etc.), which
 * is exactly what the session gate uses to AUTO-SUSPEND a school when it lapses.
 * A one_time plan sets no expiry.
 */
export async function assignPlanToSchool(schoolId: number, code: string, operatorId: number | null, ip?: string | null) {
  const plan = await getPlanByCode(code);
  if (!plan) return { ok: false as const, reason: 'Unknown plan' };
  const end = nextEndDate(plan.billing_cycle);
  await query(
    `UPDATE schools SET subscription_plan = ?, subscription_status = 'active',
            subscription_end_date = ?, updated_at = NOW() WHERE id = ?`,
    [code, end, schoolId],
  );
  await controlAudit(operatorId, 'plan_assigned', `schools:${schoolId}`,
    { plan: code, name: plan.name, price: plan.price, currency: plan.currency, cycle: plan.billing_cycle, ends: end }, ip ?? null);
  return { ok: true as const, plan, ends: end };
}

/**
 * Renew a school's current plan for another billing cycle. Extends from the
 * later of "today" or the current end date (so early renewals stack), and
 * clears any expired/suspended state. This is the counterpart to auto-suspend.
 */
export async function renewSchool(schoolId: number, operatorId: number | null, ip?: string | null) {
  const rows = (await query(
    `SELECT subscription_plan, subscription_end_date FROM schools WHERE id = ? LIMIT 1`, [schoolId],
  ).catch(() => [])) as any[];
  const code = rows[0]?.subscription_plan;
  if (!code) return { ok: false as const, reason: 'School has no plan assigned' };
  const plan = await getPlanByCode(code);
  if (!plan) return { ok: false as const, reason: 'Assigned plan no longer exists' };
  const cur = rows[0]?.subscription_end_date ? new Date(rows[0].subscription_end_date) : null;
  const from = cur && cur.getTime() > Date.now() ? cur : new Date(); // stack early renewals
  const end = nextEndDate(plan.billing_cycle, from);
  await query(
    `UPDATE schools SET subscription_status = 'active', subscription_end_date = ?, updated_at = NOW() WHERE id = ?`,
    [end, schoolId],
  );
  await controlAudit(operatorId, 'subscription_renewed', `schools:${schoolId}`,
    { plan: code, cycle: plan.billing_cycle, new_end: end, price: plan.price, currency: plan.currency }, ip ?? null);
  return { ok: true as const, ends: end, plan };
}

/** Current resource usage for a school (learners / staff / devices). */
/**
 * Live usage per resource.
 *
 * Delegates to the entitlement engine's meters so the number an operator READS
 * here and the number that REFUSES a creation are produced by the same query.
 * They were briefly two implementations, and they disagreed: ALBAYAN measured
 * 741 here while enforcement counted 785, because one predicate omitted
 * `status = 'active'`. An operator seeing "741 / 1000" while a bursar is
 * refused has no way to explain the refusal.
 *
 * sms_monthly and storage_mb stay 0 in this shape because the Control Centre
 * display expects numbers; the engine reports them as unmetered (null) for
 * callers that can represent that.
 */
export async function schoolUsage(schoolId: number): Promise<Record<LimitKey, number>> {
  const [learners, staff, devices] = await Promise.all([
    getUsage(schoolId, 'learners'),
    getUsage(schoolId, 'staff'),
    getUsage(schoolId, 'devices'),
  ]);
  return {
    learners: learners ?? 0,
    staff:    staff ?? 0,
    devices:  devices ?? 0,
    sms_monthly: 0,
    storage_mb:  0,
  };
}

/* ── PURE limit maths (unit-tested) ─────────────────────────────────────── */

export interface UsageLine { key: LimitKey; used: number; limit: number | null; unlimited: boolean; over: boolean; pct: number }

/** PURE: usage vs a plan's limits, per resource. null/0 limit = unlimited. */
export function usageAgainst(limits: PlanLimits, usage: Partial<Record<LimitKey, number>>): UsageLine[] {
  return LIMIT_KEYS.map((key) => {
    const raw = limits?.[key];
    const unlimited = raw == null || raw === 0;
    const limit = unlimited ? null : Number(raw);
    const used = Number(usage?.[key] ?? 0);
    const pct = unlimited || !limit ? 0 : Math.min(100, Math.round((used / limit) * 100));
    return { key, used, limit, unlimited, over: !unlimited && !!limit && used > limit, pct };
  });
}

/** PURE: may `count` more of `key` be added under these limits? */
export function checkCanAdd(limits: PlanLimits, key: LimitKey, current: number, adding = 1): { allowed: boolean; reason?: string } {
  const raw = limits?.[key];
  if (raw == null || raw === 0) return { allowed: true };            // unlimited
  if (current + adding > Number(raw)) {
    return { allowed: false, reason: `Plan limit reached for ${key} (${current}/${raw})` };
  }
  return { allowed: true };
}
