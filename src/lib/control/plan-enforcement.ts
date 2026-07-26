/**
 * Control Center — plan-limit enforcement at create-time (Phase 15 / E-9).
 *
 * Makes plan limits actually gate usage (and trigger upsell). Deliberately
 * SAFE BY DEFAULT so it can't blank a live school:
 *   • enforcement is OFF unless `ENFORCE_PLAN_LIMITS=true` (global), and
 *   • a per-school `school_settings.billing.enforce_limits` ('on'|'off')
 *     overrides the global either way (a safety valve for a growing school), and
 *   • any error → allow (never block on an enforcement failure), and
 *   • unmanaged schools (no plan) and unlimited limits always allow.
 *
 * `resolveEnforcement` is PURE + unit-tested.
 */
import { query } from '@/lib/db';
import { getPlanByCode, checkCanAdd, type LimitKey } from '@/lib/control/subscriptions';

export type LimitedResource = 'learners' | 'staff' | 'devices';

const COUNT_SQL: Record<LimitedResource, string> = {
  learners: `SELECT COUNT(*) n FROM students WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'`,
  staff:    `SELECT COUNT(*) n FROM staff    WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'`,
  devices:  `SELECT COUNT(*) n FROM devices  WHERE school_id = ? AND deleted_at IS NULL AND status NOT IN ('retired')`,
};

/** PURE: per-school override wins ('on'/'off'); otherwise the global env flag. */
export function resolveEnforcement(override: string | null | undefined, globalOn: boolean): boolean {
  if (override === 'on') return true;
  if (override === 'off') return false;
  return globalOn;
}

async function enforcementOn(schoolId: number): Promise<boolean> {
  const rows = (await query(
    `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'billing.enforce_limits' LIMIT 1`,
    [schoolId],
  ).catch(() => [])) as any[];
  return resolveEnforcement(rows[0]?.value_text, process.env.ENFORCE_PLAN_LIMITS === 'true');
}

export interface EnforceResult { allowed: boolean; reason?: string }

/** Gate adding `adding` more of `resource` to a school against its plan limit. */
export async function enforcePlanLimit(schoolId: number | null | undefined, resource: LimitedResource, adding = 1): Promise<EnforceResult> {
  try {
    if (!schoolId) return { allowed: true };
    if (!(await enforcementOn(Number(schoolId)))) return { allowed: true };
    const srow = (await query(`SELECT subscription_plan FROM schools WHERE id = ? LIMIT 1`, [schoolId]).catch(() => [])) as any[];
    const code = srow[0]?.subscription_plan;
    if (!code) return { allowed: true }; // unmanaged school
    const plan = await getPlanByCode(code);
    if (!plan) return { allowed: true };
    const key = resource as LimitKey;
    const raw = plan.limits?.[key];
    if (raw == null || raw === 0) return { allowed: true }; // unlimited
    const cur = Number(((await query(COUNT_SQL[resource], [schoolId]).catch(() => [{ n: 0 }])) as any[])[0]?.n || 0);
    const res = checkCanAdd(plan.limits, key, cur, adding);
    return res.allowed ? { allowed: true }
      : { allowed: false, reason: `Plan limit reached: ${cur}/${raw} ${resource}. Upgrade the plan or contact Xhenvolt.` };
  } catch {
    return { allowed: true }; // fail open — never block on an enforcement error
  }
}
