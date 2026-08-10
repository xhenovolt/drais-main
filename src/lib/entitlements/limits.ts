/**
 * Plan-based capacity limits — the entitlement engine (Phase 4).
 *
 * WHAT WAS WRONG
 * --------------
 * `subscription_plans.limits` has held real numbers since the plans were
 * created — learners, staff, devices, sms_monthly, storage_mb — and nothing
 * read them. A school on Professional (1,000 learners) could import 5,000.
 * The numbers were a price list, not a rule.
 *
 * WHY A CENTRAL ENGINE RATHER THAN A CHECK PER ROUTE
 * --------------------------------------------------
 * Eight routes can create a learner and two can restore one. Hardcoding a
 * threshold into each is how limits drift: the ninth route ships without one
 * and the limit silently stops meaning anything. Limits are read from the plan
 * row, so a new commercial plan is a database change, not a deployment.
 *
 * THE UNSET-PLAN POLICY, AND WHY IT IS DELIBERATE
 * ----------------------------------------------
 * Measured at the time of writing: 14 of 23 schools have `subscription_plan`
 * NULL and one has the unmatched value 'Trial'. A school whose plan does not
 * resolve is treated as UNLIMITED, never as zero.
 *
 * Failing open is the right default here and the reasoning matters: the
 * alternative turns a missing or misspelled plan string — an administrative
 * gap, not a customer decision — into a school that cannot admit a learner on
 * enrolment day. Restricting a school must be something someone chose, by
 * assigning it a plan. An unresolved plan is surfaced in the Control Center
 * as "no plan", not quietly enforced as zero.
 *
 * WHAT COUNTS AGAINST A LIMIT
 * ---------------------------
 * Only live rows — `deleted_at IS NULL`. Two consequences, both intended:
 * archiving a learner frees capacity, and RESTORING one consumes it again.
 * A school at its ceiling therefore cannot use the trash as an overflow store.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export type LimitKey = 'learners' | 'staff' | 'devices' | 'sms_monthly' | 'storage_mb';

export const LIMIT_LABELS: Record<LimitKey, string> = {
  learners:    'learners',
  staff:       'staff members',
  devices:     'devices',
  sms_monthly: 'SMS messages this month',
  storage_mb:  'MB of storage',
};

/** null = unlimited, for that key or for the whole school. */
export type PlanLimits = Partial<Record<LimitKey, number | null>>;

/**
 * Keys this engine can actually measure.
 *
 * `sms_monthly` and `storage_mb` appear in every plan's JSON but are NOT here:
 *   • SMS is already governed by its own mechanism — `sms_allocations.quota_sms`
 *     set from the Control Center, with sends tracked through the notification
 *     tables and enforced by /api/sms/quota. A second, plan-based counter would
 *     be a competing source of truth for the same thing.
 *   • Storage is not metered anywhere yet.
 *
 * They report `used: null` rather than 0. A confident 0 would read as "you have
 * used none of your 2,000 messages", which is a stronger and wronger claim than
 * "not measured here".
 */
export const METERED_KEYS: readonly LimitKey[] = ['learners', 'staff', 'devices'] as const;

export interface LimitState {
  key:       LimitKey;
  limit:     number | null;
  /** null when the key is not metered by this engine. */
  used:      number | null;
  remaining: number | null;
  /** 0-100, or null when unlimited or unmetered. */
  percent:   number | null;
  exceeded:  boolean;
  metered:   boolean;
}

/**
 * Warning thresholds. Configurable here rather than inline so a change is one
 * edit, and so the Control Center and any school-facing banner agree.
 */
export const LIMIT_WARN_PERCENT     = 90;
export const LIMIT_CRITICAL_PERCENT = 95;

export type LimitSeverity = 'ok' | 'warn' | 'critical' | 'exceeded';

export function severityFor(state: LimitState): LimitSeverity {
  if (state.limit === null || state.percent === null) return 'ok';
  if (state.exceeded) return 'exceeded';
  if (state.percent >= LIMIT_CRITICAL_PERCENT) return 'critical';
  if (state.percent >= LIMIT_WARN_PERCENT) return 'warn';
  return 'ok';
}

/**
 * Resolve a school's plan limits. Returns `null` when the school has no
 * resolvable plan — see the unset-plan policy above. `{}` would be ambiguous
 * with "a plan that happens to set no limits", so the distinction is kept.
 */
export async function getPlanLimits(schoolId: number): Promise<PlanLimits | null> {
  const rows = (await query(
    `SELECT p.limits
       FROM schools s
       JOIN subscription_plans p
         ON p.code = s.subscription_plan
        AND p.is_active = TRUE
      WHERE s.id = ?
      LIMIT 1`,
    [schoolId],
  ).catch(() => [])) as Array<{ limits: unknown }>;

  if (!rows.length) return null;
  const raw = rows[0].limits;
  if (raw == null) return null;
  try {
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as PlanLimits;
  } catch {
    // Malformed JSON must not become an accidental lockout.
    return null;
  }
}

/**
 * Live usage for one key, or null when the key is not metered here.
 * Counts only rows that are not soft-deleted.
 */
export async function getUsage(schoolId: number, key: LimitKey): Promise<number | null> {
  if (!METERED_KEYS.includes(key)) return null;
  const one = async (sql: string) => {
    const r = (await query(sql, [schoolId]).catch(() => [])) as Array<{ n: number }>;
    return Number(r[0]?.n ?? 0);
  };
  switch (key) {
    case 'learners':
      return one(`SELECT COUNT(*) n FROM students WHERE school_id = ? AND deleted_at IS NULL`);
    case 'staff':
      return one(`SELECT COUNT(*) n FROM staff WHERE school_id = ? AND deleted_at IS NULL`);
    case 'devices':
      return one(`SELECT COUNT(*) n FROM devices WHERE school_id = ?`);
    default:
      return null;
  }
}

/** Current state of one limit, for display or for a decision. */
export async function getLimitState(schoolId: number, key: LimitKey): Promise<LimitState> {
  const [limits, used] = await Promise.all([getPlanLimits(schoolId), getUsage(schoolId, key)]);
  const limit   = limits == null ? null : (limits[key] ?? null);
  const metered = used !== null;

  // Unlimited, no resolvable plan, or a nonsensical ceiling — never enforce.
  if (limit == null || !Number.isFinite(limit) || limit <= 0) {
    return { key, limit: null, used, remaining: null, percent: null, exceeded: false, metered };
  }
  // A ceiling exists but we cannot measure against it: report the ceiling,
  // claim nothing about consumption, and never block.
  if (!metered) {
    return { key, limit, used: null, remaining: null, percent: null, exceeded: false, metered };
  }
  return {
    key,
    limit,
    used,
    remaining: Math.max(0, limit - used!),
    percent:   Math.min(100, Math.round((used! / limit) * 100)),
    exceeded:  used! >= limit,
    metered,
  };
}

/** Every limit at once — for the Control Center and usage banners. */
export async function getUsageSummary(schoolId: number): Promise<LimitState[]> {
  const keys: LimitKey[] = ['learners', 'staff', 'devices', 'sms_monthly', 'storage_mb'];
  return Promise.all(keys.map((k) => getLimitState(schoolId, k)));
}

/**
 * Gate a creation. Returns a 403 NextResponse when `requested` new records
 * would exceed the plan, or null to proceed.
 *
 *   const over = await checkCapacity(schoolId, 'learners');
 *   if (over) return over;
 *
 * `requested` is the count of records that will GENUINELY BE CREATED. For an
 * import this must exclude rows that match an existing learner — a spreadsheet
 * of 40 existing plus 30 new consumes 30, not 70. Charging by row count would
 * make routine re-imports of the same roll impossible.
 *
 * The message names the number and the plan ceiling, because an administrator
 * who hits this needs to know whether to archive leavers or to upgrade — and a
 * bare "forbidden" would send them to the founder.
 */
export async function checkCapacity(
  schoolId: number,
  key: LimitKey,
  requested = 1,
): Promise<NextResponse | null> {
  if (requested <= 0) return null;

  const state = await getLimitState(schoolId, key);
  if (state.limit === null) return null;              // unlimited or no plan
  if (state.used === null) return null;               // ceiling exists but unmeasurable — fail open
  if (state.used + requested <= state.limit) return null;

  const label = LIMIT_LABELS[key];
  return NextResponse.json(
    {
      error:
        state.remaining === 0
          ? `Your plan allows ${state.limit} ${label} and you have ${state.used}. Archive records you no longer need, or upgrade the plan.`
          : `This would exceed your plan: ${state.remaining} of ${state.limit} ${label} remaining, ${requested} requested.`,
      code: 'PLAN_LIMIT_REACHED',
      limit: {
        key,
        allowed:   state.limit,
        used:      state.used,
        remaining: state.remaining,
        requested,
      },
    },
    { status: 403 },
  );
}
