/**
 * Phase 3 — pure attendance rule evaluator.
 *
 * Given an attendance_rule, the day's raw punches, and a day-context
 * (holiday/weekend/role/boarding status), produce a deterministic
 * verdict for the (person, date) attendance_records row.
 *
 * PURE function. NO database access. NO clock dependency beyond what
 * is passed in. This is the heart of correctness — tested in
 * src/lib/attendance/__tests__/rule-evaluator.test.mjs. Reports query
 * attendance_records; attendance_records is upserted from this
 * function; everything downstream inherits its determinism.
 *
 * Why pure
 * --------
 * Every regression risk in attendance reporting (six INSERT sinks,
 * independent status computation per route, late_threshold defined in
 * two tables) was rooted in spreading "what counts as late?" across
 * application code. Centralising the decision here makes the
 * computation auditable byte-for-byte: same inputs, same verdict,
 * always. Engine code in engine.ts loads inputs, calls this, writes
 * the verdict. Nothing else evaluates rules anywhere in DRAIS.
 *
 * Verdict precedence (highest first)
 * ----------------------------------
 *   1. weekend     (date weekday not in rule.weekday_mask)
 *   2. holiday     (date in holidays AND NOT applies_on_holidays)
 *   3. absent      (no punches by absence_cutoff_time)
 *   4. half_day    (total time < half_day_threshold_minutes)
 *   5. early_leave (last_out < departure_start AND lost > early_leave_threshold)
 *   6. late        (first_in > arrival_end_time + late_threshold)
 *   7. present     (everything else)
 *
 * Half-day and early-leave can both apply; precedence keeps half_day
 * because half_day is the larger correctness signal (the person was
 * not effectively present for the full day). late_minutes /
 * early_minutes are reported regardless of headline status so
 * reports can still surface them.
 */

export interface AttendanceRule {
  id?: number;
  arrival_start_time: string | null;        // 'HH:MM[:SS]'
  arrival_end_time: string | null;
  late_threshold_minutes: number;
  absence_cutoff_time: string | null;
  closing_time: string | null;
  departure_start_time: string | null;
  departure_end_time: string | null;
  early_leave_threshold_minutes: number;
  half_day_threshold_minutes: number;
  weekday_mask: number;                     // Mon=1, Tue=2, ..., Sun=64
  applies_on_holidays: boolean;
  boarding_scope: 'all' | 'boarding' | 'day';
  applies_to: 'students' | 'teachers' | 'all';
  ignore_duplicate_scans_within_minutes: number;
}

export interface RawPunch {
  punch_at: Date;
  device_sn: string | null;
  io_mode?: number | null;                   // 0=in, 1=out, 2=break_out, 3=break_in, 4=ot_in, 5=ot_out
}

export interface DayContext {
  /** The calendar date this evaluation is for, in the school's local
   *  timezone. The evaluator does no timezone math — the caller is
   *  responsible for converting `punch_at` and date boundaries
   *  consistently. */
  attendanceDate: Date;
  isHoliday: boolean;
  /** Person attributes that may gate which rule applies. The engine
   *  layer chooses the rule; the evaluator just trusts what it gets.
   *  These fields are reported back in the verdict for debugging. */
  personRole: 'student' | 'staff';
  personIsBoarding?: boolean;
}

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'absent'
  | 'half_day'
  | 'early_leave'
  | 'holiday'
  | 'weekend';

export interface AttendanceVerdict {
  status: AttendanceStatus;
  firstInAt: Date | null;
  lastOutAt: Date | null;
  firstInDevice: string | null;
  lastOutDevice: string | null;
  lateMinutes: number;
  earlyMinutes: number;
  totalMinutes: number;
  rawEventCount: number;
  /** Diagnostic — which precedence branch fired. Surfaced in logs so
   *  operators can debug a surprising status without re-running the
   *  evaluator. */
  trace: string;
}

const MS_PER_MIN = 60_000;

/**
 * The core function. Pure, deterministic, side-effect free.
 */
export function evaluate(
  rule: AttendanceRule,
  rawPunches: RawPunch[],
  ctx: DayContext,
): AttendanceVerdict {
  // 1. Weekend — first because it overrides everything.
  if (!isWorkingDay(ctx.attendanceDate, rule.weekday_mask)) {
    return emptyVerdict('weekend', rawPunches, 'weekday_mask_excludes_day');
  }

  // 2. Holiday — second precedence.
  if (ctx.isHoliday && !rule.applies_on_holidays) {
    return emptyVerdict('holiday', rawPunches, 'date_is_holiday');
  }

  // 3. Boarding/day scope filter — if the rule is scoped to a
  //    population the person doesn't belong to, evaluation should not
  //    fire. The engine wraps this — defensive double-check here so
  //    misuse of the pure function still produces sane output.
  if (rule.boarding_scope === 'boarding' && ctx.personIsBoarding === false) {
    return emptyVerdict('present', rawPunches, 'boarding_scope_skip');
  }
  if (rule.boarding_scope === 'day' && ctx.personIsBoarding === true) {
    return emptyVerdict('present', rawPunches, 'day_scope_skip');
  }

  // 4. Collapse duplicate scans within the ignore window. We process
  //    punches in chronological order; a punch within `ignore` minutes
  //    of the previously KEPT punch is dropped.
  const sorted = [...rawPunches].sort(
    (a, b) => a.punch_at.getTime() - b.punch_at.getTime(),
  );
  const dedupWindowMs = rule.ignore_duplicate_scans_within_minutes * MS_PER_MIN;
  const punches: RawPunch[] = [];
  for (const p of sorted) {
    const prev = punches[punches.length - 1];
    if (!prev || p.punch_at.getTime() - prev.punch_at.getTime() >= dedupWindowMs) {
      punches.push(p);
    }
  }

  // 5. No punches → absent. The absence_cutoff_time gate is implicit:
  //    if the day has no events at all, the person didn't show.
  //    (Caller is responsible for only evaluating AT OR AFTER the
  //    cutoff time; an in-flight day still evaluates as `present`
  //    once a punch arrives, never `absent`.)
  if (punches.length === 0) {
    return emptyVerdict('absent', rawPunches, 'no_punches');
  }

  const firstIn = punches[0];
  const lastOut = punches[punches.length - 1];
  const firstInAt = firstIn.punch_at;
  const lastOutAt = lastOut.punch_at;

  const totalMinutes = Math.max(
    0,
    Math.round((lastOutAt.getTime() - firstInAt.getTime()) / MS_PER_MIN),
  );

  let lateMinutes = 0;
  let earlyMinutes = 0;

  // 6. Late check — only when arrival_end_time is configured.
  if (rule.arrival_end_time) {
    const arrivalEnd = timeOn(ctx.attendanceDate, rule.arrival_end_time);
    if (firstInAt.getTime() > arrivalEnd.getTime()) {
      lateMinutes = Math.round(
        (firstInAt.getTime() - arrivalEnd.getTime()) / MS_PER_MIN,
      );
    }
  }

  // 7. Early-leave check — when departure_start_time is configured.
  if (rule.departure_start_time) {
    const departureStart = timeOn(ctx.attendanceDate, rule.departure_start_time);
    if (lastOutAt.getTime() < departureStart.getTime()) {
      earlyMinutes = Math.round(
        (departureStart.getTime() - lastOutAt.getTime()) / MS_PER_MIN,
      );
    }
  }

  // 8. Status precedence: half_day > early_leave > late > present.
  let status: AttendanceStatus = 'present';
  let trace = 'present';

  if (totalMinutes < rule.half_day_threshold_minutes) {
    status = 'half_day';
    trace = `half_day (total ${totalMinutes}min < threshold ${rule.half_day_threshold_minutes}min)`;
  } else if (earlyMinutes > rule.early_leave_threshold_minutes) {
    status = 'early_leave';
    trace = `early_leave (${earlyMinutes}min before ${rule.departure_start_time})`;
  } else if (lateMinutes > rule.late_threshold_minutes) {
    status = 'late';
    trace = `late (${lateMinutes}min after ${rule.arrival_end_time} + ${rule.late_threshold_minutes}min grace)`;
  }

  return {
    status,
    firstInAt,
    lastOutAt,
    firstInDevice: firstIn.device_sn ?? null,
    lastOutDevice: lastOut.device_sn ?? null,
    lateMinutes,
    earlyMinutes,
    totalMinutes,
    rawEventCount: rawPunches.length,
    trace,
  };
}

function emptyVerdict(
  status: AttendanceStatus,
  rawPunches: RawPunch[],
  trace: string,
): AttendanceVerdict {
  return {
    status,
    firstInAt: null,
    lastOutAt: null,
    firstInDevice: null,
    lastOutDevice: null,
    lateMinutes: 0,
    earlyMinutes: 0,
    totalMinutes: 0,
    rawEventCount: rawPunches.length,
    trace,
  };
}

/**
 * Returns true if the calendar weekday for `date` is included in the
 * bitmask. Bits: Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64.
 *
 * JavaScript's getDay() returns Sun=0..Sat=6 in the date's local
 * timezone. The mask uses Mon-first ordering so a school configured
 * "Mon-Fri" sets 31 and "Mon-Sat" sets 63.
 */
export function isWorkingDay(date: Date, mask: number): boolean {
  const jsDay = date.getDay();                    // 0=Sun..6=Sat
  const monFirstIdx = (jsDay + 6) % 7;            // 0=Mon..6=Sun
  return (mask & (1 << monFirstIdx)) !== 0;
}

/**
 * Build a Date with the time-of-day from `hhmmss` (HH:MM or HH:MM:SS)
 * applied to the calendar date of `dateRef`. The result's timezone is
 * whatever `dateRef`'s is — caller controls that.
 */
function timeOn(dateRef: Date, hhmmss: string): Date {
  const parts = hhmmss.split(':').map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  const seconds = parts[2] ?? 0;
  const d = new Date(dateRef);
  d.setHours(hours, minutes, seconds, 0);
  return d;
}
