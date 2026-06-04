// Golden tests for the Phase 3 attendance rule evaluator.
// Run with:  npx tsx --test src/lib/attendance/__tests__/rule-evaluator.test.mjs
//
// These tests are the contract for status precedence — half_day >
// early_leave > late > present. Every regression in the engine that
// changes a school's verdict for the same inputs must update this
// suite first; reports inherit determinism from here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, isWorkingDay } from '../rule-evaluator.ts';

// --- helpers ----------------------------------------------------------------

function ruleDefaults(over = {}) {
  return {
    arrival_start_time: '07:00',
    arrival_end_time:   '08:30',
    late_threshold_minutes: 15,
    absence_cutoff_time: '10:00',
    closing_time:        '17:00',
    departure_start_time: '16:00',
    departure_end_time:   '17:30',
    early_leave_threshold_minutes: 30,
    half_day_threshold_minutes:    240,   // 4 hours
    weekday_mask: 31,                     // Mon-Fri
    applies_on_holidays: false,
    boarding_scope: 'all',
    applies_to: 'students',
    ignore_duplicate_scans_within_minutes: 2,
    ...over,
  };
}

/** Build a Date for a Wednesday at the given local HH:MM. 2026-06-03
 *  was a Wednesday — picked once so every test agrees on what
 *  "weekday" means. */
function wed(hh, mm = 0, ss = 0) {
  return new Date(2026, 5, 3, hh, mm, ss, 0);
}
const WED_DATE = wed(0, 0);

function ctx(over = {}) {
  return {
    attendanceDate: WED_DATE,
    isHoliday: false,
    personRole: 'student',
    ...over,
  };
}

// --- weekday mask -----------------------------------------------------------

describe('isWorkingDay (Mon=1 .. Sun=64)', () => {
  // 2026-06-01 = Mon, 02=Tue, 03=Wed, 04=Thu, 05=Fri, 06=Sat, 07=Sun.
  it('Mon-Fri mask (31) excludes weekends', () => {
    assert.equal(isWorkingDay(new Date(2026, 5, 1), 31), true);   // Mon
    assert.equal(isWorkingDay(new Date(2026, 5, 5), 31), true);   // Fri
    assert.equal(isWorkingDay(new Date(2026, 5, 6), 31), false);  // Sat
    assert.equal(isWorkingDay(new Date(2026, 5, 7), 31), false);  // Sun
  });
  it('Mon-Sat mask (63) includes Saturday', () => {
    assert.equal(isWorkingDay(new Date(2026, 5, 6), 63), true);   // Sat
    assert.equal(isWorkingDay(new Date(2026, 5, 7), 63), false);  // Sun
  });
  it('Sunday-only mask (64) includes only Sunday', () => {
    assert.equal(isWorkingDay(new Date(2026, 5, 7), 64), true);
    assert.equal(isWorkingDay(new Date(2026, 5, 1), 64), false);
  });
});

// --- weekend & holiday precedence -------------------------------------------

describe('weekend / holiday precedence overrides everything', () => {
  it('saturday returns weekend even with punches', () => {
    const sat = new Date(2026, 5, 6, 9, 0);
    const v = evaluate(
      ruleDefaults(),
      [{ punch_at: sat, device_sn: 'D1' }],
      { ...ctx(), attendanceDate: sat },
    );
    assert.equal(v.status, 'weekend');
    assert.equal(v.firstInAt, null);
    assert.equal(v.rawEventCount, 1);
  });

  it('holiday returns holiday when applies_on_holidays is false', () => {
    const v = evaluate(
      ruleDefaults(),
      [{ punch_at: wed(9, 0), device_sn: 'D1' }],
      ctx({ isHoliday: true }),
    );
    assert.equal(v.status, 'holiday');
  });

  it('holiday is overridden by applies_on_holidays=true', () => {
    const v = evaluate(
      ruleDefaults({ applies_on_holidays: true }),
      [{ punch_at: wed(7, 30), device_sn: 'D1' }, { punch_at: wed(17, 0), device_sn: 'D1' }],
      ctx({ isHoliday: true }),
    );
    assert.equal(v.status, 'present');
  });
});

// --- absent -----------------------------------------------------------------

describe('absent', () => {
  it('no punches → absent', () => {
    const v = evaluate(ruleDefaults(), [], ctx());
    assert.equal(v.status, 'absent');
    assert.equal(v.firstInAt, null);
    assert.equal(v.rawEventCount, 0);
  });
});

// --- present ----------------------------------------------------------------

describe('present', () => {
  it('on-time arrival + on-time departure → present', () => {
    const v = evaluate(
      ruleDefaults(),
      [{ punch_at: wed(8, 0), device_sn: 'GATE' }, { punch_at: wed(16, 30), device_sn: 'GATE' }],
      ctx(),
    );
    assert.equal(v.status, 'present');
    assert.equal(v.lateMinutes, 0);
    assert.equal(v.earlyMinutes, 0);
    assert.equal(v.totalMinutes, 8 * 60 + 30);
    assert.equal(v.firstInDevice, 'GATE');
    assert.equal(v.lastOutDevice, 'GATE');
    assert.equal(v.rawEventCount, 2);
  });

  it('arrival within grace window is present (not late)', () => {
    const v = evaluate(
      ruleDefaults(),
      // arrival_end=08:30, grace=15 → cutoff = 08:45.
      [{ punch_at: wed(8, 40), device_sn: 'G' }, { punch_at: wed(16, 30), device_sn: 'G' }],
      ctx(),
    );
    assert.equal(v.status, 'present');
    // lateMinutes is reported even when status=present so reports can show it
    assert.equal(v.lateMinutes, 10);
  });
});

// --- late -------------------------------------------------------------------

describe('late', () => {
  it('arrival past grace window → late', () => {
    const v = evaluate(
      ruleDefaults(),
      [{ punch_at: wed(9, 0), device_sn: 'GATE' }, { punch_at: wed(17, 0), device_sn: 'GATE' }],
      ctx(),
    );
    assert.equal(v.status, 'late');
    assert.equal(v.lateMinutes, 30);
  });
});

// --- early_leave ------------------------------------------------------------

describe('early_leave', () => {
  it('last_out before departure_start by more than threshold → early_leave', () => {
    const v = evaluate(
      ruleDefaults(),
      // departure_start=16:00, threshold=30 → leaving before 15:30 is early
      [
        { punch_at: wed(7, 30), device_sn: 'G' },
        { punch_at: wed(15, 0), device_sn: 'G' },
      ],
      ctx(),
    );
    assert.equal(v.status, 'early_leave');
    assert.equal(v.earlyMinutes, 60);
  });

  it('half_day takes precedence over early_leave when total < threshold', () => {
    const v = evaluate(
      // half_day_threshold = 240 min (4h). Working 9->12 = 180 min.
      ruleDefaults(),
      [
        { punch_at: wed(9, 0), device_sn: 'G' },
        { punch_at: wed(12, 0), device_sn: 'G' },
      ],
      ctx(),
    );
    assert.equal(v.status, 'half_day');
    assert.equal(v.totalMinutes, 180);
    // earlyMinutes is still reported for reporting layer
    assert.equal(v.earlyMinutes, 240);   // 16:00 - 12:00 = 4h
  });
});

// --- half_day ---------------------------------------------------------------

describe('half_day', () => {
  it('total < half_day_threshold → half_day', () => {
    const v = evaluate(
      ruleDefaults(),
      [
        { punch_at: wed(8, 0),  device_sn: 'G' },
        { punch_at: wed(10, 0), device_sn: 'G' },
      ],
      ctx(),
    );
    assert.equal(v.status, 'half_day');
    assert.equal(v.totalMinutes, 120);
  });

  it('total exactly equal to threshold is NOT half_day', () => {
    // Threshold=240; total=240 (08:00 → 12:00).
    const v = evaluate(
      ruleDefaults(),
      [
        { punch_at: wed(8, 0),  device_sn: 'G' },
        { punch_at: wed(12, 0), device_sn: 'G' },
      ],
      ctx(),
    );
    // Total === threshold; early_leave next: lastOut=12:00 vs dep=16:00 → 240min early.
    // early_threshold = 30; so we land on early_leave.
    assert.equal(v.status, 'early_leave');
  });
});

// --- deduplication ----------------------------------------------------------

describe('duplicate-scan suppression', () => {
  it('punches within ignore_duplicate window collapse to one', () => {
    const v = evaluate(
      ruleDefaults({ ignore_duplicate_scans_within_minutes: 2 }),
      [
        { punch_at: wed(8, 0),    device_sn: 'GATE' },
        { punch_at: wed(8, 0, 30), device_sn: 'GATE' },  // 30s later — dropped
        { punch_at: wed(8, 1),    device_sn: 'GATE' },   // 1m later — dropped
        { punch_at: wed(8, 3),    device_sn: 'GATE' },   // 3m later — kept
        { punch_at: wed(16, 30),  device_sn: 'GATE' },
      ],
      ctx(),
    );
    // rawEventCount reports the INPUT count (5), not the deduped count.
    assert.equal(v.rawEventCount, 5);
    assert.equal(v.status, 'present');
    // first_in_at = first dedup-kept punch (08:00)
    assert.equal(v.firstInAt.getHours(), 8);
    assert.equal(v.firstInAt.getMinutes(), 0);
  });

  it('multi-device punches in window collapse only when temporal', () => {
    // Real scenario: gate at 08:00, dormitory at 08:00:45. With 2-min
    // ignore window, the dormitory event is dropped from `first_in_at`
    // computation. firstInDevice should be GATE.
    const v = evaluate(
      ruleDefaults({ ignore_duplicate_scans_within_minutes: 2 }),
      [
        { punch_at: wed(8, 0),     device_sn: 'GATE' },
        { punch_at: wed(8, 0, 45), device_sn: 'DORM' },
        { punch_at: wed(16, 30),   device_sn: 'GATE' },
      ],
      ctx(),
    );
    assert.equal(v.firstInDevice, 'GATE');
  });
});

// --- determinism ------------------------------------------------------------

describe('determinism', () => {
  it('repeated calls with same inputs return identical verdict', () => {
    const punches = [
      { punch_at: wed(9, 0), device_sn: 'G' },
      { punch_at: wed(17, 0), device_sn: 'G' },
    ];
    const a = evaluate(ruleDefaults(), punches, ctx());
    const b = evaluate(ruleDefaults(), punches, ctx());
    assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
  });

  it('input punches in shuffled order produce same verdict', () => {
    const sorted = [
      { punch_at: wed(8, 0),  device_sn: 'G' },
      { punch_at: wed(16, 0), device_sn: 'G' },
    ];
    const shuffled = [
      { punch_at: wed(16, 0), device_sn: 'G' },
      { punch_at: wed(8, 0),  device_sn: 'G' },
    ];
    const a = evaluate(ruleDefaults(), sorted, ctx());
    const b = evaluate(ruleDefaults(), shuffled, ctx());
    assert.equal(a.status,        b.status);
    assert.equal(+a.firstInAt,    +b.firstInAt);
    assert.equal(+a.lastOutAt,    +b.lastOutAt);
    assert.equal(a.totalMinutes,  b.totalMinutes);
  });
});

// --- boarding scope ---------------------------------------------------------

describe('boarding_scope filter', () => {
  it('boarding rule + day scholar → skip evaluation', () => {
    const v = evaluate(
      ruleDefaults({ boarding_scope: 'boarding' }),
      [{ punch_at: wed(9, 0), device_sn: 'G' }],
      ctx({ personIsBoarding: false }),
    );
    // Day scholar shouldn't be flagged by a boarding-only rule.
    assert.equal(v.status, 'present');
    assert.equal(v.trace, 'boarding_scope_skip');
  });

  it('day rule + boarder → skip evaluation', () => {
    const v = evaluate(
      ruleDefaults({ boarding_scope: 'day' }),
      [{ punch_at: wed(9, 0), device_sn: 'G' }],
      ctx({ personIsBoarding: true }),
    );
    assert.equal(v.status, 'present');
    assert.equal(v.trace, 'day_scope_skip');
  });
});
