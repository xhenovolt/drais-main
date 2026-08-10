/**
 * The entitlement resolver — one answer to "what is this school entitled to?"
 * (Phase 5).
 *
 * Before this, three unrelated sources answered parts of that question and no
 * caller could see them together:
 *
 *   schools.subscription_*          is the school paid up?
 *   school_modules                  which features has an operator switched off?
 *   subscription_plans.limits       how many learners/staff/devices?
 *   subscription_plans.features     which features does the PLAN include?
 *
 * This composes all four. It deliberately does not invent a new store: each
 * source stays authoritative for its own question, and the value here is that
 * they are finally readable in one call — which is what the Control Center
 * needs to answer "what does this school have, and what are they near?".
 *
 * ── THE ONE THING THIS DOES NOT DO, ON PURPOSE ───────────────────────────
 * It does not enforce `subscription_plans.features` as a ceiling.
 *
 * Measured before writing this: doing so would immediately remove payroll,
 * inventory, intelligence, analytics and work_plans from three real schools —
 * ALBAYAN (785 learners), CITY PARENTS (851) and Hillside (768) — because
 * their plan's feature list is narrower than what they have been using.
 *
 * Whether those schools should keep that access is a COMMERCIAL decision, not
 * a technical one, and silently enforcing it during a hardening pass would be
 * making that decision on someone's behalf. So the gap is computed and
 * reported as `featureGap`, and the Control Center shows it. Enforcement, if
 * wanted, is a deliberate follow-up.
 *
 * Two feature codes have no module at all — `parent_portal` and `hr` appear in
 * plan feature lists but are not in MODULE_CODES. They are reported as
 * `unmappedPlanFeatures` rather than silently dropped, because a plan
 * promising something the system cannot gate is worth someone seeing.
 */
import { query } from '@/lib/db';
import { MODULE_CATALOG, getSchoolModuleStatus, type ModuleCode, type SchoolModuleRow } from '@/lib/school-modules';
import { MODULE_CODES } from '@/lib/school-modules-codes';
import { getUsageSummary, severityFor, type LimitState, type LimitSeverity } from './limits';

export interface SubscriptionSnapshot {
  plan:       string | null;   // the raw schools.subscription_plan value
  planName:   string | null;   // resolved plan display name, null if unmatched
  resolved:   boolean;         // did it match an active plan row?
  status:     string | null;
  type:       string | null;
  startDate:  string | null;
  endDate:    string | null;
  daysLeft:   number | null;
  expired:    boolean;
}

export interface ModuleSnapshot {
  code:        ModuleCode;
  label:       string;
  description: string;
  enabled:     boolean;
  enabledAt:   string | null;
  /** Does the school's PLAN include this feature? null when no plan resolved. */
  inPlan:      boolean | null;
}

export interface SchoolEntitlements {
  schoolId:     number;
  subscription: SubscriptionSnapshot;
  limits:       Array<LimitState & { severity: LimitSeverity }>;
  modules:      ModuleSnapshot[];
  /** Enabled today but NOT included in the plan — surfaced, never enforced. */
  featureGap:   ModuleCode[];
  /** Plan feature codes with no corresponding module in the system. */
  unmappedPlanFeatures: string[];
  /** Anything at or past the warning threshold, worst first. */
  alerts:       Array<{ key: string; severity: LimitSeverity; used: number; limit: number; percent: number }>;
}

const iso = (v: unknown) =>
  v == null ? null : (typeof v === 'string' ? v : new Date(v as any).toISOString());

export async function getSchoolEntitlements(schoolId: number): Promise<SchoolEntitlements> {
  const [schoolRows, moduleRows, limitStates] = await Promise.all([
    query(
      `SELECT s.subscription_plan, s.subscription_status, s.subscription_type,
              s.subscription_start_date, s.subscription_end_date,
              p.name AS plan_name, p.features AS plan_features,
              DATEDIFF(s.subscription_end_date, CURDATE()) AS days_left
         FROM schools s
         LEFT JOIN subscription_plans p
                ON p.code = s.subscription_plan AND p.is_active = TRUE
        WHERE s.id = ?
        LIMIT 1`,
      [schoolId],
    ).catch(() => []) as Promise<any[]>,
    getSchoolModuleStatus(schoolId).catch(() => [] as SchoolModuleRow[]),
    getUsageSummary(schoolId).catch(() => [] as LimitState[]),
  ]);

  const row = schoolRows[0] ?? {};

  let planFeatures: string[] | null = null;
  if (row.plan_features != null) {
    try {
      const parsed = typeof row.plan_features === 'string'
        ? JSON.parse(row.plan_features)
        : row.plan_features;
      if (Array.isArray(parsed)) planFeatures = parsed.map(String);
    } catch { planFeatures = null; }
  }

  const daysLeft = row.days_left == null ? null : Number(row.days_left);
  const subscription: SubscriptionSnapshot = {
    plan:      row.subscription_plan ?? null,
    planName:  row.plan_name ?? null,
    resolved:  !!row.plan_name,
    status:    row.subscription_status ?? null,
    type:      row.subscription_type ?? null,
    startDate: iso(row.subscription_start_date),
    endDate:   iso(row.subscription_end_date),
    daysLeft,
    expired:   daysLeft != null && daysLeft < 0,
  };

  const stateByCode = new Map<string, SchoolModuleRow>(moduleRows.map((m) => [m.code, m]));
  const modules: ModuleSnapshot[] = MODULE_CATALOG.map((d) => {
    const st = stateByCode.get(d.code);
    return {
      code:        d.code,
      label:       d.label,
      description: d.description,
      // Opt-out default: no row means enabled. Mirrors getEnabledModules.
      enabled:     st ? !!st.isEnabled : true,
      enabledAt:   st?.enabledAt ?? null,
      inPlan:      planFeatures === null ? null : planFeatures.includes(d.code),
    };
  });

  const featureGap = modules
    .filter((m) => m.enabled && m.inPlan === false)
    .map((m) => m.code);

  const unmappedPlanFeatures = (planFeatures ?? []).filter(
    (f) => !(MODULE_CODES as readonly string[]).includes(f),
  );

  const limits = limitStates.map((s) => ({ ...s, severity: severityFor(s) }));

  const alerts = limits
    .filter((l) => l.severity !== 'ok' && l.limit != null && l.used != null && l.percent != null)
    .map((l) => ({
      key: String(l.key), severity: l.severity,
      used: l.used as number, limit: l.limit as number, percent: l.percent as number,
    }))
    .sort((a, b) => b.percent - a.percent);

  return { schoolId, subscription, limits, modules, featureGap, unmappedPlanFeatures, alerts };
}
