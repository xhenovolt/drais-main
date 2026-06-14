/**
 * Attendance state-engine — per-punch lifecycle derivation tests.
 * The core fix: first punch = ARRIVAL (never checkout), windows drive
 * meaning, deterministic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveEvents } from '../rule-evaluator.ts';

const rule = {
  arrival_start_time: '06:00', arrival_end_time: '08:00', late_threshold_minutes: 15,
  absence_cutoff_time: '10:00', closing_time: '17:00',
  departure_start_time: '16:00', departure_end_time: '18:00',
  early_leave_threshold_minutes: 30, half_day_threshold_minutes: 240,
  weekday_mask: 127, applies_on_holidays: false, boarding_scope: 'all',
  applies_to: 'all', ignore_duplicate_scans_within_minutes: 2,
};
const day = new Date('2026-06-15T00:00:00'); // Monday
const at = (h, m) => { const d = new Date(day); d.setHours(h, m, 0, 0); return { punch_at: d, device_sn: 'GATE' }; };
const ctx = { attendanceDate: day, isHoliday: false, personRole: 'student' };
const types = (evs) => evs.map(e => e.type);

test('FIRST punch is ARRIVAL, never checkout (the core bug)', () => {
  assert.deepEqual(types(deriveEvents(rule, [at(7, 30)], ctx)), ['ARRIVED']);
});
test('late first punch → ARRIVED_LATE', () => {
  const e = deriveEvents(rule, [at(8, 42)], ctx);
  assert.equal(e[0].type, 'ARRIVED_LATE');
  assert.match(e[0].detail, /Late by/);
});
test('arrival within grace is on-time', () => {
  assert.equal(deriveEvents(rule, [at(8, 10)], ctx)[0].type, 'ARRIVED'); // 08:00 + 15m grace
});
test('before opening → ARRIVED_EARLY', () => {
  assert.equal(deriveEvents(rule, [at(5, 50)], ctx)[0].type, 'ARRIVED_EARLY');
});
test('arrival then afternoon exit → ARRIVED + CHECKED_OUT', () => {
  assert.deepEqual(types(deriveEvents(rule, [at(7, 30), at(16, 20)], ctx)), ['ARRIVED', 'CHECKED_OUT']);
});
test('lunch out + back + checkout → arrival, temp_exit, returned, checked_out', () => {
  assert.deepEqual(
    types(deriveEvents(rule, [at(7, 30), at(12, 30), at(13, 10), at(16, 30)], ctx)),
    ['ARRIVED', 'TEMP_EXIT', 'RETURNED', 'CHECKED_OUT'],
  );
});
test('exit at/after closing → OVERTIME_EXIT', () => {
  assert.equal(deriveEvents(rule, [at(7, 30), at(17, 30)], ctx)[1].type, 'OVERTIME_EXIT');
});
test('final exit before checkout window → EARLY_DEPARTURE', () => {
  assert.equal(deriveEvents(rule, [at(7, 30), at(11, 0)], ctx)[1].type, 'EARLY_DEPARTURE');
});
test('duplicate within window flagged DUPLICATE, not dropped', () => {
  const e = deriveEvents(rule, [at(7, 30), { punch_at: new Date(day.getTime() + 7.5 * 3600e3 + 30e3), device_sn: 'GATE' }], ctx);
  assert.equal(e.length, 2);
  assert.equal(e[1].type, 'DUPLICATE');
});
test('deterministic regardless of input order', () => {
  const a = types(deriveEvents(rule, [at(16, 30), at(7, 30)], ctx));
  const b = types(deriveEvents(rule, [at(7, 30), at(16, 30)], ctx));
  assert.deepEqual(a, b);
  assert.deepEqual(a, ['ARRIVED', 'CHECKED_OUT']);
});
