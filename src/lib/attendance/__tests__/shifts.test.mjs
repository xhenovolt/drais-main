import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toMinutes, crossesMidnight, weekdayBit, resolveShift, classifyPunch, SHIFT_PRECEDENCE,
  shiftToAttendanceRule,
} from '../shifts.ts';

const shift = (o) => ({
  id: 1, name: 'S', startTime: '07:00', endTime: '13:00',
  arrivalWindowMinutes: 30, lateThresholdMinutes: 15,
  earlyLeaveThresholdMinutes: 30, overtimeAfterMinutes: 60, weekdayMask: 31, ...o,
});

// ── helpers ──────────────────────────────────────────────────────────────────
test('toMinutes parses HH:MM and HH:MM:SS', () => {
  assert.equal(toMinutes('07:00'), 420);
  assert.equal(toMinutes('13:30:00'), 810);
  assert.equal(toMinutes('00:00'), 0);
});
test('crossesMidnight true only when end <= start', () => {
  assert.equal(crossesMidnight(shift({ startTime: '18:00', endTime: '06:00' })), true);
  assert.equal(crossesMidnight(shift({ startTime: '07:00', endTime: '13:00' })), false);
});
test('weekdayBit: Mon=0 … Sun=6', () => {
  assert.equal(weekdayBit('2026-07-06'), 0); // Monday
  assert.equal(weekdayBit('2026-07-12'), 6); // Sunday
});

// ── resolveShift precedence ──────────────────────────────────────────────────
const shifts = { 10: shift({ id: 10, name: 'School' }), 20: shift({ id: 20, name: 'Dept' }), 30: shift({ id: 30, name: 'Staff' }) };
test('resolveShift: staff beats department beats role beats school', () => {
  const assignments = [
    { shiftId: 10, targetType: 'school', targetId: null },
    { shiftId: 20, targetType: 'department', targetId: 5 },
    { shiftId: 30, targetType: 'staff', targetId: 99 },
  ];
  const r = resolveShift({ assignments, shiftsById: shifts, staffId: 99, departmentId: 5, roleId: 7, onDate: '2026-07-06' });
  assert.equal(r.id, 30);
});
test('resolveShift: falls back to department when no staff assignment', () => {
  const assignments = [
    { shiftId: 10, targetType: 'school', targetId: null },
    { shiftId: 20, targetType: 'department', targetId: 5 },
  ];
  const r = resolveShift({ assignments, shiftsById: shifts, staffId: 99, departmentId: 5, roleId: 7, onDate: '2026-07-06' });
  assert.equal(r.id, 20);
});
test('resolveShift: school default when nothing else matches', () => {
  const assignments = [{ shiftId: 10, targetType: 'school', targetId: null }];
  const r = resolveShift({ assignments, shiftsById: shifts, staffId: 1, departmentId: 2, roleId: 3, onDate: '2026-07-06' });
  assert.equal(r.id, 10);
});
test('resolveShift: null when no assignment matches', () => {
  const r = resolveShift({ assignments: [{ shiftId: 20, targetType: 'department', targetId: 5 }], shiftsById: shifts, staffId: 1, departmentId: 999, roleId: 3, onDate: '2026-07-06' });
  assert.equal(r, null);
});
test('resolveShift: ignores inactive + out-of-range assignments', () => {
  const assignments = [
    { shiftId: 30, targetType: 'staff', targetId: 99, status: 'archived' },
    { shiftId: 20, targetType: 'staff', targetId: 99, effectiveFrom: '2026-08-01' }, // future
    { shiftId: 10, targetType: 'school', targetId: null },
  ];
  const r = resolveShift({ assignments, shiftsById: shifts, staffId: 99, departmentId: 5, roleId: 7, onDate: '2026-07-06' });
  assert.equal(r.id, 10); // both staff ones excluded → school default
});
test('SHIFT_PRECEDENCE ordering', () => {
  assert.ok(SHIFT_PRECEDENCE.staff > SHIFT_PRECEDENCE.department);
  assert.ok(SHIFT_PRECEDENCE.department > SHIFT_PRECEDENCE.role);
  assert.ok(SHIFT_PRECEDENCE.role > SHIFT_PRECEDENCE.school);
});

// ── classifyPunch: day shift 07:00–13:00 ─────────────────────────────────────
const day = shift({ startTime: '07:00', endTime: '13:00' });
test('on time: arrive 06:55, leave 13:00', () => {
  const c = classifyPunch(day, toMinutes('06:55'), toMinutes('13:00'));
  assert.equal(c.onTime, true); assert.equal(c.late, false); assert.equal(c.earlyLeave, false); assert.equal(c.overtimeMinutes, 0);
});
test('late: arrive 07:20 (>15m threshold)', () => {
  const c = classifyPunch(day, toMinutes('07:20'), toMinutes('13:00'));
  assert.equal(c.late, true); assert.equal(c.lateMinutes, 20); assert.equal(c.onTime, false);
});
test('not late: arrive 07:10 (within 15m)', () => {
  const c = classifyPunch(day, toMinutes('07:10'), toMinutes('13:00'));
  assert.equal(c.late, false); assert.equal(c.lateMinutes, 10);
});
test('early leave: depart 12:00 (>30m before end)', () => {
  const c = classifyPunch(day, toMinutes('07:00'), toMinutes('12:00'));
  assert.equal(c.earlyLeave, true); assert.equal(c.earlyLeaveMinutes, 60);
});
test('not early: depart 12:45 (within 30m)', () => {
  const c = classifyPunch(day, toMinutes('07:00'), toMinutes('12:45'));
  assert.equal(c.earlyLeave, false);
});
test('overtime: depart 14:30 (90m past end, >=60m threshold)', () => {
  const c = classifyPunch(day, toMinutes('07:00'), toMinutes('14:30'));
  assert.equal(c.overtimeMinutes, 90);
});
test('no overtime below threshold: depart 13:30 (30m < 60m)', () => {
  const c = classifyPunch(day, toMinutes('07:00'), toMinutes('13:30'));
  assert.equal(c.overtimeMinutes, 0);
});

// ── classifyPunch: night security 18:00 → 06:00 (crosses midnight) ───────────
const night = shift({ startTime: '18:00', endTime: '06:00', overtimeAfterMinutes: 30 });
test('night shift: on-time arrive 17:55, leave 06:00 → full, no early leave', () => {
  const c = classifyPunch(night, toMinutes('17:55'), toMinutes('06:00'));
  assert.equal(c.crossesMidnight, true);
  assert.equal(c.late, false);
  assert.equal(c.earlyLeave, false);
  assert.equal(c.earlyLeaveMinutes, 0);
});
test('night shift: early leave at 04:00 (2h before 06:00)', () => {
  const c = classifyPunch(night, toMinutes('18:00'), toMinutes('04:00'));
  assert.equal(c.earlyLeave, true);
  assert.equal(c.earlyLeaveMinutes, 120);
});
test('night shift: late arrival 18:40 (>15m)', () => {
  const c = classifyPunch(night, toMinutes('18:40'), toMinutes('06:00'));
  assert.equal(c.late, true); assert.equal(c.lateMinutes, 40);
});
test('night shift: overtime past 06:00 → 07:00 (60m, >=30m threshold)', () => {
  const c = classifyPunch(night, toMinutes('18:00'), toMinutes('07:00'));
  assert.equal(c.overtimeMinutes, 60);
});

// ── missing punches ──────────────────────────────────────────────────────────
test('missing arrival → not onTime, not late', () => {
  const c = classifyPunch(day, null, toMinutes('13:00'));
  assert.equal(c.onTime, false); assert.equal(c.late, false);
});
test('missing departure → no early/overtime', () => {
  const c = classifyPunch(day, toMinutes('07:00'), null);
  assert.equal(c.earlyLeave, false); assert.equal(c.overtimeMinutes, 0);
});

// ── shiftToAttendanceRule (bridge into the existing evaluator) ────────────────
test('shiftToAttendanceRule maps shift → rule fields', () => {
  const r = shiftToAttendanceRule(shift({ startTime: '07:00:00', endTime: '13:00:00', lateThresholdMinutes: 15, earlyLeaveThresholdMinutes: 30, weekdayMask: 31 }));
  assert.equal(r.arrival_start_time, '07:00');
  assert.equal(r.arrival_end_time, '07:00');
  assert.equal(r.late_threshold_minutes, 15);
  assert.equal(r.departure_start_time, '13:00');
  assert.equal(r.departure_end_time, '13:00');
  assert.equal(r.early_leave_threshold_minutes, 30);
  assert.equal(r.weekday_mask, 31);
});
