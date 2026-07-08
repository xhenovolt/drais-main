/**
 * Shift engine (pure logic) — resolve which shift applies to a staff member and
 * classify a day's punches against it. DB-free and fully unit-tested so the
 * attendance evaluator and a future settings simulator share ONE source of
 * truth. Backed by the `shifts` + `shift_assignments` tables (migration 034).
 */

export type ShiftTargetType = 'staff' | 'department' | 'role' | 'school';

export interface Shift {
  id: number;
  name: string;
  /** "HH:MM" or "HH:MM:SS". */
  startTime: string;
  endTime: string;
  arrivalWindowMinutes: number;
  lateThresholdMinutes: number;
  earlyLeaveThresholdMinutes: number;
  /** Minutes past end_time before overtime counts; null = no overtime. */
  overtimeAfterMinutes: number | null;
  /** Bitmask, bit0=Mon … bit6=Sun. 31 = Mon–Fri. */
  weekdayMask: number;
}

export interface ShiftAssignment {
  shiftId: number;
  targetType: ShiftTargetType;
  targetId: number | null;
  effectiveFrom?: string | null; // 'YYYY-MM-DD'
  effectiveTo?: string | null;
  status?: string | null;
}

/** Assignment specificity: individual staff beats department beats role beats
 *  the school-wide default. */
export const SHIFT_PRECEDENCE: Record<ShiftTargetType, number> = {
  staff: 4, department: 3, role: 2, school: 1,
};

/** Minutes from midnight for an "HH:MM[:SS]" string. */
export function toMinutes(hhmm: string): number {
  const [h = '0', m = '0'] = String(hhmm).split(':');
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/** Whether a shift's end wraps past midnight (e.g. 18:00 → 06:00). */
export function crossesMidnight(shift: Shift): boolean {
  return toMinutes(shift.endTime) <= toMinutes(shift.startTime);
}

/** bit index (0=Mon … 6=Sun) for a 'YYYY-MM-DD' date. */
export function weekdayBit(dateStr: string): number {
  // Parse as UTC so getUTCDay isn't shifted by the host timezone.
  const js = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
  return js === 0 ? 6 : js - 1; // → 0=Mon … 6=Sun
}

function inEffectiveRange(a: ShiftAssignment, onDate: string): boolean {
  if (a.effectiveFrom && onDate < a.effectiveFrom) return false;
  if (a.effectiveTo && onDate > a.effectiveTo) return false;
  return true;
}

/**
 * Resolve the shift that applies to a staff member on a date by precedence
 * (staff > department > role > school). Returns null when nothing matches.
 */
export function resolveShift(opts: {
  assignments: ShiftAssignment[];
  shiftsById: Record<number, Shift> | Map<number, Shift>;
  staffId: number | null;
  departmentId: number | null;
  roleId: number | null;
  onDate: string;
}): Shift | null {
  const { assignments, staffId, departmentId, roleId, onDate } = opts;
  const getShift = (id: number): Shift | undefined =>
    opts.shiftsById instanceof Map ? opts.shiftsById.get(id) : opts.shiftsById[id];

  const matches = (a: ShiftAssignment): boolean => {
    if ((a.status ?? 'active') !== 'active') return false;
    if (!inEffectiveRange(a, onDate)) return false;
    switch (a.targetType) {
      case 'staff':      return staffId != null && a.targetId === staffId;
      case 'department': return departmentId != null && a.targetId === departmentId;
      case 'role':       return roleId != null && a.targetId === roleId;
      case 'school':     return true;
      default:           return false;
    }
  };

  let best: ShiftAssignment | null = null;
  for (const a of assignments) {
    if (!matches(a)) continue;
    if (!best || SHIFT_PRECEDENCE[a.targetType] > SHIFT_PRECEDENCE[best.targetType]) best = a;
  }
  if (!best) return null;
  return getShift(best.shiftId) ?? null;
}

/**
 * Map a resolved Shift onto the field shape the existing attendance rule-evaluator
 * consumes, so a staff member's shift can drive the SAME classifier as
 * attendance_rules (no parallel evaluator). "On time until start; late past
 * start + threshold; early-leave before end - threshold."
 */
export interface ShiftAsRule {
  arrival_start_time: string;
  arrival_end_time: string;
  late_threshold_minutes: number;
  departure_start_time: string;
  departure_end_time: string;
  early_leave_threshold_minutes: number;
  weekday_mask: number;
}
export function shiftToAttendanceRule(shift: Shift): ShiftAsRule {
  const hhmm = (t: string) => t.slice(0, 5);
  return {
    arrival_start_time: hhmm(shift.startTime),
    arrival_end_time:   hhmm(shift.startTime),
    late_threshold_minutes: shift.lateThresholdMinutes,
    departure_start_time: hhmm(shift.endTime),
    departure_end_time:   hhmm(shift.endTime),
    early_leave_threshold_minutes: shift.earlyLeaveThresholdMinutes,
    weekday_mask: shift.weekdayMask,
  };
}

export interface PunchClassification {
  /** Arrival within the on-time window (not late). */
  onTime: boolean;
  late: boolean;
  lateMinutes: number;
  earlyLeave: boolean;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  crossesMidnight: boolean;
}

/**
 * Classify a day's arrival/departure (each = minutes from midnight of the punch's
 * wall clock, 0–1439; null when absent) against a shift. Night shifts that cross
 * midnight are handled by shifting the end — and a post-midnight departure — by a
 * day so the maths is monotonic.
 */
export function classifyPunch(
  shift: Shift,
  arrivalMinutes: number | null,
  departureMinutes: number | null,
): PunchClassification {
  const start = toMinutes(shift.startTime);
  const wraps = crossesMidnight(shift);
  const end = wraps ? toMinutes(shift.endTime) + 1440 : toMinutes(shift.endTime);

  // Late: arrival later than start + threshold.
  let late = false, lateMinutes = 0;
  if (arrivalMinutes != null) {
    const over = arrivalMinutes - start;
    lateMinutes = Math.max(0, over);
    late = over > shift.lateThresholdMinutes;
  }

  // Departure: for a wrap shift, a small departure (past midnight) is next-day.
  let earlyLeave = false, earlyLeaveMinutes = 0, overtimeMinutes = 0;
  if (departureMinutes != null) {
    const dep = wraps && departureMinutes < start ? departureMinutes + 1440 : departureMinutes;
    const before = end - dep;
    earlyLeaveMinutes = Math.max(0, before);
    earlyLeave = before > shift.earlyLeaveThresholdMinutes;
    const after = dep - end;
    if (shift.overtimeAfterMinutes != null && after >= shift.overtimeAfterMinutes) {
      overtimeMinutes = after;
    }
  }

  return {
    onTime: arrivalMinutes != null && !late,
    late, lateMinutes,
    earlyLeave, earlyLeaveMinutes,
    overtimeMinutes,
    crossesMidnight: wraps,
  };
}
