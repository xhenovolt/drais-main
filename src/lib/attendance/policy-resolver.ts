/**
 * Scoped attendance-policy resolver.
 *
 * Given a punch context (person, role, class/stream/department, boarding status,
 * device, date) it deterministically chooses ONE classification rule from the
 * school's attendance_rules and EXPLAINS the choice — so DRAIS can answer
 * "why was this learner marked late?".
 *
 * Precedence (most specific wins):
 *   1 individual learner/staff override
 *   2 device-specific
 *   3 class / stream / department
 *   4 boarding / day-scholar
 *   5 role (student/staff)
 *   6 school default
 * Ties: lower `priority` number wins; then newest effective_date; if still tied
 * among non-school scopes → ambiguous, fall back to school default with a warning.
 *
 * Pure `selectPolicy()` (no DB) is unit-tested; `resolveAttendancePolicy()`
 * loads the rules then delegates.
 */
import { query } from '@/lib/db';
import { loadResolvedStaffShift } from './staff-shift';
import { shiftToAttendanceRule } from './shifts';

export type ScopeType =
  | 'school' | 'role' | 'class' | 'stream' | 'department'
  | 'boarding' | 'device' | 'learner' | 'staff' | 'shift' | 'holiday';

export const SCOPE_TIER: Record<ScopeType, number> = {
  learner: 1, staff: 1, device: 2, class: 3, stream: 3, department: 3,
  boarding: 4, role: 5, school: 6, shift: 3, holiday: 3,
};

export interface PolicyRule {
  id: number;
  rule_name?: string | null;
  scope_type: ScopeType;
  scope_id?: number | null;
  applies_to?: 'students' | 'teachers' | 'all' | null;
  boarding_scope?: 'all' | 'boarding' | 'day' | null;
  priority?: number | null;
  effective_date?: string | Date | null;
  end_date?: string | Date | null;
  is_active?: number | boolean | null;
  [k: string]: any;
}

export interface ResolveContext {
  schoolId: number;
  roleType: 'student' | 'staff';
  date: Date;
  personId?: number | null;
  classId?: number | null;
  streamId?: number | null;
  departmentId?: number | null;
  boardingStatus?: 'boarding' | 'day' | null;
  deviceId?: number | null;
}

export interface PolicyResolution {
  policy: PolicyRule | null;
  policy_id: number | null;
  scope_type: ScopeType | null;
  scope_id: number | null;
  reason: string;
  fallback_used: boolean;
  ambiguous: boolean;
}

function activeOn(rule: PolicyRule, date: Date): boolean {
  if (rule.is_active === 0 || rule.is_active === false) return false;
  const t = date.getTime();
  if (rule.effective_date && new Date(rule.effective_date).getTime() > t) return false;
  if (rule.end_date && new Date(rule.end_date).getTime() < t) return false;
  return true;
}

/** Does a rule's scope match the context? (school always matches.) */
function matches(rule: PolicyRule, ctx: ResolveContext): boolean {
  switch (rule.scope_type) {
    case 'school': return true;
    case 'role':
      return rule.applies_to === 'all'
        || (rule.applies_to === 'students' && ctx.roleType === 'student')
        || (rule.applies_to === 'teachers' && ctx.roleType === 'staff');
    case 'boarding':
      return !!ctx.boardingStatus && (rule.boarding_scope === ctx.boardingStatus || rule.boarding_scope === 'all');
    case 'class':      return rule.scope_id != null && rule.scope_id === ctx.classId;
    case 'stream':     return rule.scope_id != null && rule.scope_id === ctx.streamId;
    case 'department': return rule.scope_id != null && rule.scope_id === ctx.departmentId;
    case 'device':     return rule.scope_id != null && rule.scope_id === ctx.deviceId;
    case 'learner':    return ctx.roleType === 'student' && rule.scope_id != null && rule.scope_id === ctx.personId;
    case 'staff':      return ctx.roleType === 'staff'   && rule.scope_id != null && rule.scope_id === ctx.personId;
    // A 'shift' rule is only ever produced by resolveAttendancePolicy for the
    // exact staff+date it applies to (via shift_assignments precedence), so if
    // one is present it applies to this staff context. Previously this case was
    // missing → a shift-scoped rule silently never matched.
    case 'shift':      return ctx.roleType === 'staff';
    default: return false;
  }
}

/** PURE selection — unit-tested. */
export function selectPolicy(rules: PolicyRule[], ctx: ResolveContext): PolicyResolution {
  const candidates = rules
    .filter(r => activeOn(r, ctx.date) && matches(r, ctx))
    .map(r => ({ r, tier: SCOPE_TIER[r.scope_type] ?? 6 }));

  if (!candidates.length) {
    return { policy: null, policy_id: null, scope_type: null, scope_id: null,
      reason: 'No matching policy (no school default configured)', fallback_used: true, ambiguous: false };
  }

  const bestTier = Math.min(...candidates.map(c => c.tier));
  let top = candidates.filter(c => c.tier === bestTier);

  // Tie-breakers: lower priority number, then newest effective_date.
  if (top.length > 1) {
    const minPriority = Math.min(...top.map(c => Number(c.r.priority ?? 100)));
    top = top.filter(c => Number(c.r.priority ?? 100) === minPriority);
  }
  if (top.length > 1) {
    const newest = Math.max(...top.map(c => c.r.effective_date ? new Date(c.r.effective_date).getTime() : 0));
    top = top.filter(c => (c.r.effective_date ? new Date(c.r.effective_date).getTime() : 0) === newest);
  }

  // Still ambiguous AND not the school tier → fall back to school default with a warning.
  if (top.length > 1 && bestTier !== SCOPE_TIER.school) {
    const school = candidates.filter(c => c.r.scope_type === 'school').sort((a, b) => Number(a.r.priority ?? 100) - Number(b.r.priority ?? 100))[0];
    const chosen = school ?? top[0];
    return {
      policy: chosen.r, policy_id: chosen.r.id, scope_type: chosen.r.scope_type, scope_id: chosen.r.scope_id ?? null,
      reason: `Ambiguous ${top[0].r.scope_type} policies (${top.map(c => c.r.id).join(',')}) — fell back to ${chosen.r.scope_type} default`,
      fallback_used: true, ambiguous: true,
    };
  }

  const chosen = top[0];
  const fallbackUsed = chosen.r.scope_type === 'school';
  const reasonByScope: Record<string, string> = {
    learner: `Individual learner override (scope_id=${chosen.r.scope_id})`,
    staff: `Individual staff override (scope_id=${chosen.r.scope_id})`,
    device: `Device-specific policy (device=${chosen.r.scope_id})`,
    class: `Class policy (class=${chosen.r.scope_id})`,
    stream: `Stream policy (stream=${chosen.r.scope_id})`,
    department: `Department policy (department=${chosen.r.scope_id})`,
    boarding: `Boarding-status policy (${chosen.r.boarding_scope})`,
    role: `Role policy (${chosen.r.applies_to})`,
    school: `School default`,
  };
  return {
    policy: chosen.r, policy_id: chosen.r.id, scope_type: chosen.r.scope_type, scope_id: chosen.r.scope_id ?? null,
    reason: `${reasonByScope[chosen.r.scope_type] || chosen.r.scope_type} — "${chosen.r.rule_name ?? 'rule ' + chosen.r.id}"`,
    fallback_used: fallbackUsed, ambiguous: false,
  };
}

/** Load the school's rules and resolve. */
export async function resolveAttendancePolicy(ctx: ResolveContext): Promise<PolicyResolution> {
  const rules = (await query(
    `SELECT id, rule_name, scope_type, scope_id, applies_to, boarding_scope, priority,
            effective_date, end_date, is_active
       FROM attendance_rules
      WHERE school_id = ? AND is_active = 1`,
    [ctx.schoolId],
  )) as PolicyRule[];

  // Additive: a staff member's resolved shift enters as a high-precedence
  // ('shift' tier) synthetic policy carrying its classification fields inline.
  // Wrapped so any shift-lookup failure leaves the pre-shift behaviour intact;
  // schools with no shift assignments are entirely unaffected.
  if (ctx.roleType === 'staff' && ctx.personId != null) {
    try {
      const shift = await loadResolvedStaffShift(ctx.schoolId, ctx.personId, ctx.date);
      if (shift) {
        rules.push({
          id: -shift.id,                 // synthetic negative id — never collides with real rules
          rule_name: `Shift: ${shift.name}`,
          scope_type: 'shift',
          scope_id: ctx.personId,
          priority: 0,
          is_active: 1,
          ...shiftToAttendanceRule(shift), // inline arrival/departure/thresholds for consumers
        } as PolicyRule);
      }
    } catch (err) {
      console.warn('[policy-resolver] staff shift resolution skipped:', (err as Error).message);
    }
  }

  return selectPolicy(rules, ctx);
}
