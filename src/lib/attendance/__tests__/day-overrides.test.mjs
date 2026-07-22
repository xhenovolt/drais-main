// Per-weekday arrival overrides — pure merge semantics.
// "Saturday arrival ends at 10:00" must replace ONLY the fields the
// override sets; blank (null) fields inherit the base rule, and a date
// with no override row leaves the rule untouched.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeOverride, weekdayOf } from '@/lib/attendance/day-overrides';

const baseRule = {
  id: 300002,
  arrival_start_time: '07:00:00',
  arrival_end_time: '08:30:00',
  late_threshold_minutes: 15,
  closing_time: '17:00:00',
};

describe('weekdayOf', () => {
  it('maps dates to JS getDay() (0=Sunday … 6=Saturday)', () => {
    assert.equal(weekdayOf('2026-07-25'), 6); // Saturday
    assert.equal(weekdayOf('2026-07-26'), 0); // Sunday
    assert.equal(weekdayOf('2026-07-27'), 1); // Monday
  });

  it('accepts Date objects', () => {
    assert.equal(weekdayOf(new Date('2026-07-25T00:00:00')), 6);
  });
});

describe('mergeOverride', () => {
  it('returns the rule unchanged when there is no override', () => {
    assert.deepEqual(mergeOverride(baseRule, null), baseRule);
    assert.deepEqual(mergeOverride(baseRule, undefined), baseRule);
  });

  it('Saturday 10:00 override replaces arrival_end_time only', () => {
    const merged = mergeOverride(baseRule, {
      rule_id: 300002, weekday: 6,
      arrival_start_time: null,
      arrival_end_time: '10:00:00',
      late_threshold_minutes: null,
      closing_time: null,
    });
    assert.equal(merged.arrival_end_time, '10:00:00');
    // Everything the override left null inherits the base rule.
    assert.equal(merged.arrival_start_time, '07:00:00');
    assert.equal(merged.late_threshold_minutes, 15);
    assert.equal(merged.closing_time, '17:00:00');
    assert.equal(merged.id, 300002);
  });

  it('override grace of 0 minutes is respected (0 is not "inherit")', () => {
    const merged = mergeOverride(baseRule, {
      rule_id: 300002, weekday: 6,
      arrival_start_time: null,
      arrival_end_time: '10:00:00',
      late_threshold_minutes: 0,
      closing_time: null,
    });
    assert.equal(merged.late_threshold_minutes, 0);
  });

  it('full override replaces every field', () => {
    const merged = mergeOverride(baseRule, {
      rule_id: 300002, weekday: 0,
      arrival_start_time: '08:00:00',
      arrival_end_time: '11:00:00',
      late_threshold_minutes: 30,
      closing_time: '13:00:00',
    });
    assert.equal(merged.arrival_start_time, '08:00:00');
    assert.equal(merged.arrival_end_time, '11:00:00');
    assert.equal(merged.late_threshold_minutes, 30);
    assert.equal(merged.closing_time, '13:00:00');
  });

  it('does not mutate the input rule', () => {
    const copy = { ...baseRule };
    mergeOverride(baseRule, {
      rule_id: 300002, weekday: 6,
      arrival_start_time: null, arrival_end_time: '10:00:00',
      late_threshold_minutes: null, closing_time: null,
    });
    assert.deepEqual(baseRule, copy);
  });
});
