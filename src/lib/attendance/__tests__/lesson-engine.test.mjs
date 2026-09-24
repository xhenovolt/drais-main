// Lesson attendance (phase 6/7) — pure decision logic.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LESSON_POLICY, sanitizePolicy, deviceAllowsLesson, checkinWindow, assignPunchesToLessons,
  deriveLessonStatus, summarizeRoster, localToUtcMs, isoWeekday, localDateOf, resolveDevice,
} from '@/lib/attendance/lessons/engine.ts';

const OFF = 180; // EAT
const DAY = '2026-09-24'; // Thursday
const at = (hhmm) => localToUtcMs(DAY, hhmm, OFF);
const lesson = (id, start, end, over = {}) => ({ id, startMs: at(start), endMs: at(end), classId: 1, streamId: null, room: null, ...over });
const punch = (id, hhmm, sn = 'SHARED') => ({ id, atMs: at(hhmm), deviceSn: sn });
const P = { ...DEFAULT_LESSON_POLICY, enabled: true };
const shared = () => ({ scope: 'shared' });

const math = lesson(1, '10:00', '10:40');
const eng = lesson(2, '10:40', '11:20');

describe('time helpers', () => {
  it('converts school-local wall time to UTC and back', () => {
    assert.equal(new Date(at('10:00')).toISOString(), '2026-09-24T07:00:00.000Z');
    assert.equal(localDateOf(Date.parse('2026-09-23T22:00:00Z'), OFF), '2026-09-24');
    assert.equal(isoWeekday('2026-09-24'), 4);
    assert.equal(isoWeekday('2026-09-27'), 7);
  });
});

describe('policy sanitising', () => {
  it('clamps garbage and keeps "late" reachable', () => {
    const p = sanitizePolicy({ checkinBeforeMinutes: 999, graceMinutes: 30, lateUntilMinutes: 10, unmappedDeviceScope: 'evil', enabled: 1 });
    assert.equal(p.checkinBeforeMinutes, 60);
    assert.equal(p.lateUntilMinutes, 30);
    assert.equal(p.unmappedDeviceScope, 'shared');
    assert.equal(p.enabled, true);
  });
  it('is disabled by default so existing schools see no change', () => {
    assert.equal(DEFAULT_LESSON_POLICY.enabled, false);
  });
});

describe('matching a punch to the correct lesson', () => {
  it('a punch inside the window matches its lesson', () => {
    const a = assignPunchesToLessons([math, eng], [punch(1, '09:55')], P, shared);
    assert.deepEqual([...a.byLesson.keys()], [1]);
  });

  it('a school-entry punch hours earlier does NOT mark a later lesson (shared device, outside window)', () => {
    const a = assignPunchesToLessons([math], [punch(1, '07:50')], P, shared);
    assert.equal(a.byLesson.size, 0);
    assert.equal(a.unassigned[0].reason, 'no_lesson_window');
  });

  it('a gate-scoped device never feeds lessons, even inside a window', () => {
    const a = assignPunchesToLessons([math], [punch(1, '09:58', 'GATE')], P, () => ({ scope: 'gate' }));
    assert.equal(a.byLesson.size, 0);
    assert.equal(a.unassigned[0].reason, 'device_not_lesson_capable');
  });

  it('overlapping windows: one punch marks only the lesson with the nearest start', () => {
    // back-to-back lessons; 10:38 is inside math late-window? no (closes 10:20) but inside eng open (10:30)
    const a = assignPunchesToLessons([math, eng], [punch(1, '10:38')], P, shared);
    assert.deepEqual([...a.byLesson.keys()], [2]);
    // widen windows so both contain the punch
    const wide = { ...P, lateUntilMinutes: 40, checkinBeforeMinutes: 20 };
    const b = assignPunchesToLessons([math, eng], [punch(1, '10:35')], wide, shared);
    assert.equal(b.byLesson.size, 1);
    assert.deepEqual([...b.byLesson.keys()], [2], 'nearest start (10:40) beats 10:00');
  });

  it('a punch is never assigned to two lessons', () => {
    const wide = { ...P, lateUntilMinutes: 40, checkinBeforeMinutes: 30 };
    const a = assignPunchesToLessons([math, eng], [punch(1, '10:20'), punch(2, '10:39')], wide, shared);
    const all = [...a.byLesson.values()].flat().map((p) => p.id);
    assert.equal(new Set(all).size, all.length);
  });

  it('duplicate punches for the same lesson stay on that lesson (no duplicate lesson record)', () => {
    const a = assignPunchesToLessons([math], [punch(1, '09:58'), punch(2, '09:58'), punch(3, '10:01')], P, shared);
    assert.equal(a.byLesson.size, 1);
    assert.equal(a.byLesson.get(1).length, 3);
  });
});

describe('dedicated devices respect their scope', () => {
  const dedicated = (over) => ({ scope: 'lesson', ...over });
  it('pinned to a class: other classes\' lessons are excluded', () => {
    assert.equal(deviceAllowsLesson(dedicated({ classId: 1 }), lesson(1, '10:00', '10:40')), true);
    assert.equal(deviceAllowsLesson(dedicated({ classId: 2 }), lesson(1, '10:00', '10:40')), false);
  });
  it('pinned to a room: only lessons in that room (case-insensitive); unknown lesson room is not blocked', () => {
    assert.equal(deviceAllowsLesson(dedicated({ room: 'Lab 1' }), lesson(1, '10:00', '10:40', { room: 'lab 1' })), true);
    assert.equal(deviceAllowsLesson(dedicated({ room: 'Lab 1' }), lesson(1, '10:00', '10:40', { room: 'Hall' })), false);
    assert.equal(deviceAllowsLesson(dedicated({ room: 'Lab 1' }), lesson(1, '10:00', '10:40')), true);
  });
  it('unmapped devices fall back to the school policy default', () => {
    assert.equal(resolveDevice(null, { ...P, unmappedDeviceScope: 'gate' }).scope, 'gate');
    assert.equal(resolveDevice({ scope: 'lesson' }, { ...P, unmappedDeviceScope: 'gate' }).scope, 'lesson');
  });
});

describe('grace periods and statuses', () => {
  const derive = (punches, nowHHMM, over = {}, canPunch = true) =>
    deriveLessonStatus({ lesson: math, punches, policy: { ...P, ...over }, nowMs: at(nowHHMM), canPunch });

  it('early or on-time punch = present, no lateness', () => {
    const d = derive([punch(1, '09:57')], '10:05');
    assert.equal(d.status, 'present'); assert.equal(d.minutesLate, 0);
  });
  it('punch inside the grace period is present, not late (not marked absent for missing the exact start)', () => {
    assert.equal(derive([punch(1, '10:05')], '10:10').status, 'present');
  });
  it('after grace but inside the late window = late with minutes', () => {
    const d = derive([punch(1, '10:12')], '10:15');
    assert.equal(d.status, 'late'); assert.equal(d.minutesLate, 12);
  });
  it('grace is configurable per school', () => {
    assert.equal(derive([punch(1, '10:12')], '10:15', { graceMinutes: 15 }).status, 'present');
    assert.equal(derive([punch(1, '10:02')], '10:15', { graceMinutes: 0 }).status, 'late');
  });
  it('no punch while the lesson is still open or awaiting finalisation = pending, not absent', () => {
    assert.equal(derive([], '10:20').status, 'pending');
    assert.equal(derive([], '10:50').status, 'pending'); // ended 10:40, finalise delay 15 -> 10:55
  });
  it('no punch after the finalisation delay = absent', () => {
    assert.equal(derive([], '10:56').status, 'absent');
    assert.equal(derive([], '10:41', { absentFinalizeDelayMinutes: 0 }).status, 'absent');
  });
  it('a learner who cannot punch (no biometric enrolment) is never auto-marked absent', () => {
    const d = derive([], '18:00', {}, false);
    assert.equal(d.status, 'pending'); assert.equal(d.exception, 'not_biometrically_enrolled');
  });
  it('minimum-presence rule: a single check-in is ambiguous, kept pending then flagged; two punches far enough apart qualify', () => {
    const p = { minPresenceMinutes: 20 };
    assert.equal(derive([punch(1, '10:01')], '10:10', p).status, 'pending');
    const late = derive([punch(1, '10:01')], '11:00', p);
    assert.equal(late.status, 'pending'); assert.equal(late.exception, 'insufficient_presence_evidence');
    assert.equal(derive([punch(1, '10:01'), punch(2, '10:30')], '10:35', p).status, 'present');
  });
  it('re-deriving with the same inputs is deterministic (idempotent reprocessing)', () => {
    const inp = { lesson: math, punches: [punch(1, '10:12')], policy: P, nowMs: at('12:00'), canPunch: true };
    assert.deepEqual(deriveLessonStatus(inp), deriveLessonStatus(inp));
  });
});

describe('roster summary', () => {
  it('counts expected / present / late / not yet accounted for / exceptions', () => {
    const s = summarizeRoster([
      { status: 'present', exception: null }, { status: 'late', exception: null },
      { status: 'absent', exception: null }, { status: 'excused', exception: null },
      { status: 'pending', exception: null }, { status: 'pending', exception: 'not_biometrically_enrolled' },
    ]);
    assert.deepEqual(s, { expected: 6, present: 1, late: 1, absent: 1, excused: 1, pending: 2, unaccounted: 2, exceptions: 1 });
  });
});

describe('checkin window', () => {
  it('is capped at lesson end', () => {
    const l = lesson(9, '10:00', '10:10');
    const w = checkinWindow(l, { ...P, lateUntilMinutes: 60 });
    assert.equal(w.closeMs, l.endMs);
    assert.equal(w.openMs, l.startMs - 10 * 60000);
  });
});
