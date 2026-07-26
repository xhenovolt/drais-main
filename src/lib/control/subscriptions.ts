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

export interface PlanLimits {
  learners?: number | null; staff?: number | null; devices?: number | null;
  sms_monthly?: number | null; storage_mb?: number | null;
}
export interface SubscriptionPlan {
  code: string; name: string; tier: number; limits: PlanLimits; features: string[]; is_active: boolean;
}

export const LIMIT_KEYS = ['learners', 'staff', 'devices', 'sms_monthly', 'storage_mb'] as const;
export type LimitKey = typeof LIMIT_KEYS[number];

/** Seed presets — null limit = unlimited. Custom is created ad-hoc by operators. */
const PRESETS: SubscriptionPlan[] = [
  { code: 'starter', name: 'Starter', tier: 1, is_active: true,
    limits: { learners: 300, staff: 30, devices: 1, sms_monthly: 500, storage_mb: 2000 },
    features: ['attendance'] },
  { code: 'standard', name: 'Standard', tier: 2, is_active: true,
    limits: { learners: 800, staff: 80, devices: 2, sms_monthly: 2000, storage_mb: 5000 },
    features: ['attendance', 'finance', 'parent_portal'] },
  { code: 'professional', name: 'Professional', tier: 3, is_active: true,
    limits: { learners: 2000, staff: 200, devices: 5, sms_monthly: 10000, storage_mb: 20000 },
    features: ['attendance', 'finance', 'parent_portal', 'tahfiz', 'analytics'] },
  { code: 'enterprise', name: 'Enterprise', tier: 4, is_active: true,
    limits: { learners: null, staff: null, devices: 20, sms_monthly: 50000, storage_mb: 100000 },
    features: ['attendance', 'finance', 'parent_portal', 'tahfiz', 'analytics', 'hr'] },
  { code: 'government', name: 'Government', tier: 5, is_active: true,
    limits: { learners: null, staff: null, devices: null, sms_monthly: null, storage_mb: null },
    features: ['attendance', 'finance', 'parent_portal', 'tahfiz', 'analytics', 'hr'] },
];

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
    // Seed presets once (INSERT IGNORE keeps operator edits on re-run).
    for (const p of PRESETS) {
      await query(
        `INSERT IGNORE INTO subscription_plans (code, name, tier, limits, features, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [p.code, p.name, p.tier, JSON.stringify(p.limits), JSON.stringify(p.features)],
      ).catch(() => {});
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
}): Promise<SubscriptionPlan> {
  await ensureSubscriptionPlansSchema();
  const code = input.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  await query(
    `INSERT INTO subscription_plans (code, name, tier, limits, features, is_active)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), tier = VALUES(tier),
       limits = VALUES(limits), features = VALUES(features), is_active = VALUES(is_active)`,
    [code, input.name.trim(), input.tier ?? 0, JSON.stringify(input.limits ?? {}),
     JSON.stringify(input.features ?? []), input.is_active === false ? 0 : 1],
  );
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
  await controlAudit(operatorId, 'plan_deleted', `plans:${code}`, null, ip ?? null);
  return { ok: true };
}

/** Assign a plan to a school (writes the plan code to schools.subscription_plan). */
export async function assignPlanToSchool(schoolId: number, code: string, operatorId: number | null, ip?: string | null) {
  const plan = await getPlanByCode(code);
  if (!plan) return { ok: false as const, reason: 'Unknown plan' };
  await query(`UPDATE schools SET subscription_plan = ?, updated_at = NOW() WHERE id = ?`, [code, schoolId]);
  await controlAudit(operatorId, 'plan_assigned', `schools:${schoolId}`, { plan: code, name: plan.name }, ip ?? null);
  return { ok: true as const, plan };
}

/** Current resource usage for a school (learners / staff / devices). */
export async function schoolUsage(schoolId: number): Promise<Record<LimitKey, number>> {
  const one = async (sql: string) => Number(((await query(sql, [schoolId]).catch(() => [{}])) as any[])[0]?.n || 0);
  const [learners, staff, devices] = await Promise.all([
    one(`SELECT COUNT(*) n FROM students WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'`),
    one(`SELECT COUNT(*) n FROM staff WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'`),
    one(`SELECT COUNT(*) n FROM devices WHERE school_id = ? AND deleted_at IS NULL AND status NOT IN ('retired')`),
  ]);
  return { learners, staff, devices, sms_monthly: 0, storage_mb: 0 };
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
