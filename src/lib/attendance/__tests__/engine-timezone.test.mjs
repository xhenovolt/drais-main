// Regression test for the timezone bug found 2026-09-29 at Nakifuma High
// School: rule-evaluator.ts's evaluate()/deriveEvents() build rule-boundary
// instants using the JS Date object's *runtime* local timezone, per its own
// documented "caller converts consistently" contract. engine.ts was handing
// it real UTC punch instants unshifted, so on a UTC-runtime production
// server (school configured for UTC+3 Uganda), every boundary landed 3
// hours later than intended — e.g. a 07:20 arrival-end cutoff behaved like
// 10:20 Uganda-local. Real, live, confirmed impact: a punch at 08:33:14 UTC
// (11:33 Uganda-local) was scored 73 minutes late instead of ~253; a punch
// at 05:04:17 UTC (08:04 Uganda-local, 44 real minutes after the cutoff)
// was scored "present" instead of late.
//
// engine.ts's fix shifts punches + the day boundary by computeTzShiftMs()
// before calling evaluate()/deriveEvents(), then shifts the verdict's
// timestamps back. This file tests that shift math in isolation (it does
// not, and cannot cheaply, fake the process's real OS timezone) and proves
// it reproduces the two real Nakifuma outcomes correctly regardless of
// which timezone the machine running this test happens to be in.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../rule-evaluator.ts';
import { computeTzShiftMs } from '../engine.ts';

const UGANDA_OFFSET_MIN = 180; // UTC+3

const NAKIFUMA_DAY_RULE = {
  id: 540002,
  arrival_start_time: '06:30:00',
  arrival_end_time: '07:20:00',
  late_threshold_minutes: 5,
  absence_cutoff_time: '10:00:00', // must NOT influence lateMinutes at all
  closing_time: '17:00:00',
  departure_start_time: null,
  departure_end_time: null,
  early_leave_threshold_minutes: 30,
  half_day_threshold_minutes: 240,
  weekday_mask: 63,
  applies_on_holidays: false,
  boarding_scope: 'all',
  applies_to: 'students',
  ignore_duplicate_scans_within_minutes: 2,
};

/** Mirrors engine.ts's evaluateDay(): shift punches + day boundary into the
 *  runtime's own local frame, evaluate, then unshift the verdict back.
 *
 *  runtimeOffsetMin MUST be the process's real, actual OS offset — rule-
 *  evaluator.ts's setHours()/getDay() always read the real OS timezone, so
 *  there is no way to make a single process behave "as if" it had a
 *  different one. That's not a limitation of this test: it's the same
 *  constraint engine.ts itself works under, which is exactly why it asks
 *  the OS for the real value (`-new Date().getTimezoneOffset()`) instead of
 *  assuming one — this test proves that live-detected approach gives the
 *  right real-world answer on whatever machine actually runs it. */
function evaluateAsIfRuntimeWere(runtimeOffsetMin, rule, realPunchUtc, realDayStartUtc) {
  const shiftMs = computeTzShiftMs(UGANDA_OFFSET_MIN, runtimeOffsetMin);
  const toEval = (d) => new Date(d.getTime() + shiftMs);
  const fromEval = (d) => (d ? new Date(d.getTime() - shiftMs) : d);
  const verdict = evaluate(
    rule,
    [{ punch_at: toEval(realPunchUtc), device_sn: 'X' }],
    { attendanceDate: toEval(realDayStartUtc), isHoliday: false, personRole: 'student' },
  );
  return { ...verdict, firstInAt: fromEval(verdict.firstInAt), lastOutAt: fromEval(verdict.lastOutAt) };
}

// The real, live OS offset of whatever machine runs this test — the same
// value engine.ts itself computes at runtime. Deliberately NOT hardcoded.
const REAL_RUNTIME_OFFSET_MIN = -new Date().getTimezoneOffset();

describe('computeTzShiftMs — pure', () => {
  it('is zero when the runtime already matches the school (Uganda dev box)', () => {
    assert.equal(computeTzShiftMs(180, 180), 0);
  });
  it('is +180min when the school is UTC+3 and the runtime is UTC (production)', () => {
    assert.equal(computeTzShiftMs(180, 0), 180 * 60_000);
  });
  it('can be negative — school behind the runtime', () => {
    assert.equal(computeTzShiftMs(0, 180), -180 * 60_000);
  });
});

describe('engine timezone fix — real Nakifuma cases', () => {
  const REAL_DAY_START_UTC = new Date('2026-09-29T00:00:00.000Z');

  it('Kafuko Apophia: 08:33:14 UTC punch (11:33 Uganda-local) → late by 253min, not 73', () => {
    const realPunchUtc = new Date('2026-09-29T08:33:14.000Z');
    const v = evaluateAsIfRuntimeWere(REAL_RUNTIME_OFFSET_MIN, NAKIFUMA_DAY_RULE, realPunchUtc, REAL_DAY_START_UTC);
    assert.equal(v.status, 'late');
    assert.equal(v.lateMinutes, 253);
    // The verdict's own firstInAt must round-trip to the real UTC punch,
    // not the shifted evaluation-frame instant.
    assert.equal(v.firstInAt.toISOString(), realPunchUtc.toISOString());
  });

  it('Nansamba Azizah: 05:04:17 UTC punch (08:04 Uganda-local) → late by 44min, not "present"', () => {
    const realPunchUtc = new Date('2026-09-29T05:04:17.000Z');
    const v = evaluateAsIfRuntimeWere(REAL_RUNTIME_OFFSET_MIN, NAKIFUMA_DAY_RULE, realPunchUtc, REAL_DAY_START_UTC);
    assert.equal(v.status, 'late');
    assert.equal(v.lateMinutes, 44);
  });

  it('a punch genuinely on time (07:00 Uganda-local) stays present', () => {
    const realPunchUtc = new Date('2026-09-29T04:00:00.000Z'); // 07:00 Uganda-local
    const v = evaluateAsIfRuntimeWere(REAL_RUNTIME_OFFSET_MIN, NAKIFUMA_DAY_RULE, realPunchUtc, REAL_DAY_START_UTC);
    assert.equal(v.status, 'present');
  });
});
