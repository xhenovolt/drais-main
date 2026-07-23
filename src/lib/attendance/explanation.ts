/**
 * Attendance Explanation Engine (Phase 9 of the Intelligence Program).
 *
 * Every attendance decision must explain itself. Instead of a bare "Late",
 * DRAIS shows the whole reasoning chain: arrival vs the expected cutoff, the
 * grace applied, the exact difference, which policy/rule/shift decided it,
 * and a plain-language reason.
 *
 * explainVerdict() is PURE and unit-tested — it takes the already-computed
 * verdict + the rule that produced it (in minute-of-day terms) and renders
 * the explanation. No DB, no clock; the loader supplies the local-time
 * numbers.
 */

const fmt = (m: number | null | undefined): string => {
  if (m == null || !Number.isFinite(m)) return '—';
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60), min = mm % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
};
const mins = (n: number) => `${Math.abs(n)} min${Math.abs(n) === 1 ? '' : 's'}`;

export interface ExplainInput {
  status: string;                    // present | late | absent | half_day | …
  arrivalMinute: number | null;      // local minute-of-day of first check-in
  departureMinute: number | null;    // local minute-of-day of last check-out
  arrivalEndMinute: number | null;   // rule arrival_end_time (on-time cutoff)
  graceMinutes: number;              // late_threshold_minutes
  lateMinutes: number;               // engine-computed late minutes
  ruleLabel: string | null;          // e.g. "Staff shift 'Night'" or "Learners rule"
  ruleId: number | null;             // real rule id, negative = shift, null = fallback
  isShift: boolean;
  hadWeekdayOverride: boolean;
  isHoliday: boolean;
}

export interface Explanation {
  headline: string;
  factors: Array<{ label: string; value: string }>;
  reason: string;
  policy: string;
}

export function explainVerdict(i: ExplainInput): Explanation {
  const factors: Array<{ label: string; value: string }> = [];
  const lateCutoff = i.arrivalEndMinute != null ? i.arrivalEndMinute + (i.graceMinutes || 0) : null;

  if (i.arrivalMinute != null) factors.push({ label: 'Arrival', value: fmt(i.arrivalMinute) });
  if (i.arrivalEndMinute != null) factors.push({ label: 'On-time cutoff', value: fmt(i.arrivalEndMinute) });
  if (i.graceMinutes) factors.push({ label: 'Grace', value: `+${mins(i.graceMinutes)} → late after ${fmt(lateCutoff)}` });
  if (i.arrivalMinute != null && lateCutoff != null) {
    const diff = i.arrivalMinute - lateCutoff;
    factors.push({ label: 'Difference', value: diff > 0 ? `${mins(diff)} after cutoff` : `${mins(diff)} before cutoff` });
  }
  if (i.departureMinute != null) factors.push({ label: 'Departure', value: fmt(i.departureMinute) });

  // Which policy decided this.
  const policy = i.isShift ? (i.ruleLabel || 'assigned staff shift')
    : i.ruleId == null ? 'raw presence (no matching rule)'
      : `${i.ruleLabel || `rule #${i.ruleId}`}${i.hadWeekdayOverride ? ' (with a day-specific override)' : ''}`;

  let headline: string;
  let reason: string;
  switch (i.status) {
    case 'late': {
      headline = `Late by ${mins(i.lateMinutes || 0)}`;
      reason = i.arrivalMinute != null && lateCutoff != null
        ? `First check-in at ${fmt(i.arrivalMinute)} is after the ${fmt(lateCutoff)} late threshold (on-time cutoff ${fmt(i.arrivalEndMinute)} + ${mins(i.graceMinutes || 0)} grace).`
        : `Marked late by ${policy}.`;
      break;
    }
    case 'present': {
      headline = 'On time';
      reason = i.arrivalMinute != null && lateCutoff != null
        ? `First check-in at ${fmt(i.arrivalMinute)} is at or before the ${fmt(lateCutoff)} threshold.`
        : `Present per ${policy}.`;
      break;
    }
    case 'absent': {
      headline = 'Absent';
      reason = i.isHoliday ? 'No check-in recorded (and the day is a holiday).' : 'No check-in was recorded for this day.';
      break;
    }
    case 'half_day': {
      headline = 'Half day';
      reason = i.departureMinute != null
        ? `Departure at ${fmt(i.departureMinute)} left less than the required hours after arriving ${fmt(i.arrivalMinute)}.`
        : `Recorded time fell short of a full day under ${policy}.`;
      break;
    }
    default: {
      headline = i.status ? i.status.replace(/_/g, ' ') : 'Recorded';
      reason = `Decided by ${policy}.`;
    }
  }

  if (i.isHoliday && i.status !== 'absent') reason += ' Note: this date is marked as a holiday.';

  return { headline, factors, reason, policy };
}
