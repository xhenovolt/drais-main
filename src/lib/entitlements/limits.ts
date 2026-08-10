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

/**
 * Known keys are named for autocomplete and label lookup, but the type stays
 * open: the plan JSON is the source of truth, so a key added there must not
 * need a code change to be *reported*. `(string & {})` keeps the named
 * suggestions while permitting any other key.
 */
export type KnownLimitKey = 'learners' | 'staff' | 'devices' | 'users' | 'sms_monthly' | 'storage_mb';
export type LimitKey = KnownLimitKey | (string & {});

const KNOWN_LABELS: Record<string, string> = {
  learners:    'learners',
  staff:       'staff members',
  devices:     'devices',
  users:       'user accounts',
  sms_monthly: 'SMS messages this month',
  storage_mb:  'MB of storage',
};

/** Human label for a limit key; falls back to the key itself for new keys. */
export function limitLabel(key: LimitKey): string {
  return KNOWN_LABELS[key] ?? String(key).replace(/_/g, ' ');
}

/** Singular forms, for "1 learner remaining" rather than "1 learners remaining". */
const SINGULAR_LABELS: Record<string, string> = {
  learners:    'learner',
  staff:       'staff member',
  devices:     'device',
  users:       'user account',
  sms_monthly: 'SMS message this month',
  storage_mb:  'MB of storage',
};

/**
 * Count-aware label. The banner that uses this is shown to a school at the
 * moment it is nearly out of room, which is exactly when sloppy copy reads as
 * a broken system rather than a real constraint.
 */
export function limitLabelFor(key: LimitKey, count: number): string {
  if (Math.abs(count) === 1) return SINGULAR_LABELS[key] ?? limitLabel(key);
  return limitLabel(key);
}

/** Kept for existing call sites; prefer limitLabel() for plan-driven keys. */
export const LIMIT_LABELS: Record<string, string> = KNOWN_LABELS;

/** null = unlimited, for that key or for the whole school. */
export type PlanLimits = Partial<Record<LimitKey, number | null>>;

/**
 * The state of one limit for one school.
 *
 * `metered: false` means the plan declares a ceiling this engine cannot
 * measure, so `used` is null rather than 0. Two keys are in that state today:
 *   • sms_monthly — already governed by its own mechanism
 *     (`sms_allocations.quota_sms` + /api/sms/quota). A second, plan-based
 *     counter would be a competing source of truth for the same thing.
 *   • storage_mb — not metered anywhere yet.
 *
 * A confident 0 would read as "you have used none of your 2,000 messages" —
 * a stronger and wronger claim than "not measured here".
 */
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
 * METER REGISTRY — the extensibility point (Phase 5).
 *
 * A limit is enforceable when two things line up: the plan JSON carries the
 * key, and a meter here knows how to count it. Adding `users: 25` to a plan
 * row makes it enforceable immediately, because the meter already exists —
 * no route changes, no deployment, which is the whole point of driving limits
 * from data rather than code.
 *
 * A key in the plan with no meter is reported (limit shown, `metered: false`)
 * and never enforced. That is the honest failure mode: it says "there is a
 * ceiling here that we cannot measure", rather than inventing a usage figure.
 */
const COUNT_METERS: Record<string, string> = {
  // ── THESE PREDICATES MUST MATCH THE CONTROL CENTRE DISPLAY EXACTLY ───────
  // `schoolUsage` in src/lib/control/subscriptions.ts delegates here so there
  // is one query per resource. That delegation exists because the first
  // version of this file counted differently — it omitted `status = 'active'`
  // — and ALBAYAN measured 741 in the Control Centre while enforcement used
  // 785. An operator reading "741 / 1000" while a bursar is refused at 785
  // has no way to understand the refusal, and would call the founder.
  //
  // The `status = 'active'` semantics are deliberate and were the pre-existing
  // ones: a learner who has left still occupies a row but should not occupy a
  // paid seat. Same for retired devices.
  learners: `SELECT COUNT(*) n FROM students WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'`,
  staff:    `SELECT COUNT(*) n FROM staff    WHERE school_id = ? AND deleted_at IS NULL AND status = 'active'`,
  devices:  `SELECT COUNT(*) n FROM devices  WHERE school_id = ? AND deleted_at IS NULL AND status NOT IN ('retired')`,
  // Registered ahead of demand: no plan sets `users` yet, so this meters
  // nothing today and costs nothing. The day a plan does, it works.
  users:    `SELECT COUNT(*) n FROM users    WHERE school_id = ? AND deleted_at IS NULL`,
};

/** Keys this engine can actually measure — derived, never hand-maintained. */
export const METERED_KEYS: readonly string[] = Object.keys(COUNT_METERS);

/**
 * Live usage for one key, or null when nothing can measure it.
 * Counts only rows that are not soft-deleted.
 */
export async function getUsage(schoolId: number, key: LimitKey): Promise<number | null> {
  const sql = COUNT_METERS[key];
  if (!sql) return null;
  const r = (await query(sql, [schoolId]).catch(() => null)) as Array<{ n: number }> | null;
  // A failed query must not read as "zero used" — that would silently disable
  // the limit while claiming full headroom.
  if (r === null) return null;
  return Number(r[0]?.n ?? 0);
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
  const exceeded = used! >= limit;
  return {
    key,
    limit,
    used,
    remaining: Math.max(0, limit - used!),
    // FLOOR, not round, and 100% is reserved for actually being full.
    // Rounding showed 999/1000 as "100%" while the school could still admit a
    // learner — a number that says full when it is not is worse than no number,
    // because the next time it says 100% nobody believes it.
    percent:   exceeded ? 100 : Math.min(99, Math.floor((used! / limit) * 100)),
    exceeded,
    metered,
  };
}

/**
 * Every limit the school's plan declares, plus any metered key the plan omits
 * (reported with limit=null so usage is still visible). Driven by the plan row
 * rather than a hardcoded list, so a new plan key appears without a code change.
 */
export async function getUsageSummary(schoolId: number): Promise<LimitState[]> {
  const limits = await getPlanLimits(schoolId);
  const keys = new Set<string>([...Object.keys(limits ?? {}), ...METERED_KEYS]);
  return Promise.all([...keys].map((k) => getLimitState(schoolId, k)));
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

  const label = limitLabel(key);
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
