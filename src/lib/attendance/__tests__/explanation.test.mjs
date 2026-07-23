// Attendance Explanation Engine — every verdict explains itself (pure).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { explainVerdict } from '@/lib/attendance/explanation';

const base = {
  status: 'present', arrivalMinute: 8 * 60, departureMinute: 17 * 60,
  arrivalEndMinute: 8 * 60 + 30, graceMinutes: 15, lateMinutes: 0,
  ruleLabel: "Staff rule", ruleId: 300002, isShift: false, hadWeekdayOverride: false, isHoliday: false,
};
const e = (over = {}) => explainVerdict({ ...base, ...over });

describe('late verdict', () => {
  it('explains the arrival vs threshold chain', () => {
    const x = e({ status: 'late', arrivalMinute: 9 * 60, lateMinutes: 15 });
    assert.match(x.headline, /Late by 15 min/);
    assert.match(x.reason, /9:00 AM.*after.*8:45 AM/);
    const diff = x.factors.find(f => f.label === 'Difference');
    assert.match(diff.value, /after cutoff/);
  });
  it('names the deciding policy', () => {
    const x = e({ status: 'late', arrivalMinute: 9 * 60, lateMinutes: 15 });
    assert.match(x.policy, /Staff rule/);
  });
});

describe('present verdict', () => {
  it('on time when before the threshold', () => {
    const x = e();
    assert.equal(x.headline, 'On time');
    assert.match(x.reason, /at or before/);
  });
});

describe('shift + override + fallback policy naming', () => {
  it('shift-decided verdict says so', () => {
    const x = e({ isShift: true, ruleLabel: "Staff shift 'Night'", ruleId: -5 });
    assert.match(x.policy, /shift/i);
  });
  it('weekday override is surfaced', () => {
    const x = e({ hadWeekdayOverride: true });
    assert.match(x.policy, /day-specific override/);
  });
  it('no rule → raw presence', () => {
    const x = e({ ruleId: null, ruleLabel: null });
    assert.match(x.policy, /raw presence/);
  });
});

describe('absent + holiday', () => {
  it('absent explains missing check-in', () => {
    const x = e({ status: 'absent', arrivalMinute: null, departureMinute: null });
    assert.equal(x.headline, 'Absent');
    assert.match(x.reason, /No check-in/);
  });
  it('absent on a holiday notes the holiday', () => {
    const x = e({ status: 'absent', arrivalMinute: null, isHoliday: true });
    assert.match(x.reason, /holiday/);
  });
  it('present on a holiday appends a holiday note', () => {
    const x = e({ isHoliday: true });
    assert.match(x.reason, /holiday/i);
  });
});

describe('half day', () => {
  it('explains short departure', () => {
    const x = e({ status: 'half_day', departureMinute: 11 * 60 });
    assert.equal(x.headline, 'Half day');
    assert.match(x.reason, /11:00 AM/);
  });
});

describe('factors', () => {
  it('includes arrival, cutoff, grace, difference, departure', () => {
    const labels = e({ status: 'late', arrivalMinute: 9 * 60, lateMinutes: 15 }).factors.map(f => f.label);
    for (const l of ['Arrival', 'On-time cutoff', 'Grace', 'Difference', 'Departure']) assert.ok(labels.includes(l), l);
  });
});
