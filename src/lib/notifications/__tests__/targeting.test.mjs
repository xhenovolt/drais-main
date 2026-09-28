// "Applies to who" — matchesTargeting (role/boarding/class) and the DEPARTED dedup key.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesTargeting, buildDedupKey } from '@/lib/notifications/fanout.ts';

const student = { roleType: 'student', residence: 'day', classId: 10 };
const boardingStudent = { roleType: 'student', residence: 'boarding', classId: 20 };
const staff = { roleType: 'staff', residence: null, classId: null };

describe('matchesTargeting — role_type', () => {
  it('no role_type condition matches everyone', () => {
    assert.equal(matchesTargeting({}, student), true);
    assert.equal(matchesTargeting({}, staff), true);
  });
  it('role_type: student excludes staff, and vice versa', () => {
    assert.equal(matchesTargeting({ role_type: 'student' }, student), true);
    assert.equal(matchesTargeting({ role_type: 'student' }, staff), false);
    assert.equal(matchesTargeting({ role_type: 'staff' }, staff), true);
    assert.equal(matchesTargeting({ role_type: 'staff' }, student), false);
  });
});

describe('matchesTargeting — boarding_scope', () => {
  it("'all' or omitted applies to every residence", () => {
    assert.equal(matchesTargeting({}, student), true);
    assert.equal(matchesTargeting({ boarding_scope: 'all' }, boardingStudent), true);
  });
  it('boarding-only excludes day scholars, day-only excludes boarders', () => {
    assert.equal(matchesTargeting({ boarding_scope: 'boarding' }, boardingStudent), true);
    assert.equal(matchesTargeting({ boarding_scope: 'boarding' }, student), false);
    assert.equal(matchesTargeting({ boarding_scope: 'day' }, student), true);
    assert.equal(matchesTargeting({ boarding_scope: 'day' }, boardingStudent), false);
  });
  it('a boarding_scope filter on a staff event never matches (residence is always null for staff)', () => {
    assert.equal(matchesTargeting({ boarding_scope: 'boarding' }, staff), false);
    assert.equal(matchesTargeting({ boarding_scope: 'day' }, staff), false);
  });
});

describe('matchesTargeting — class_ids', () => {
  it('empty/absent list applies to every class', () => {
    assert.equal(matchesTargeting({}, student), true);
    assert.equal(matchesTargeting({ class_ids: [] }, student), true);
  });
  it("matches only when the person's class is in the list", () => {
    assert.equal(matchesTargeting({ class_ids: [10, 11] }, student), true);
    assert.equal(matchesTargeting({ class_ids: [11, 12] }, student), false);
  });
  it('a class filter never matches someone with no resolvable class (e.g. staff, or an unenrolled student)', () => {
    assert.equal(matchesTargeting({ class_ids: [10] }, staff), false);
    assert.equal(matchesTargeting({ class_ids: [10] }, { ...student, classId: null }), false);
  });
});

describe('matchesTargeting — combined (ANDed)', () => {
  it('every condition present must hold', () => {
    const conds = { role_type: 'student', boarding_scope: 'boarding', class_ids: [20] };
    assert.equal(matchesTargeting(conds, boardingStudent), true);
    assert.equal(matchesTargeting(conds, student), false); // wrong boarding scope + class
    assert.equal(matchesTargeting(conds, staff), false);   // wrong role
  });
});

describe('buildDedupKey — DEPARTED', () => {
  const ev = { personId: 42, attendanceDate: '2026-09-28' };
  it('is keyed by (policy, person, day) only — no status or time component', () => {
    const a = buildDedupKey(5, ev, 'DEPARTED', 0, '0700111222');
    const b = buildDedupKey(5, ev, 'DEPARTED', 0, '0700111222');
    assert.equal(a, b);
  });
  it('a later re-evaluation of the SAME departure produces the SAME key (idempotent, no double SMS)', () => {
    // Simulates evaluateDay re-running after an unrelated later punch the same day.
    const first = buildDedupKey(5, ev, 'DEPARTED', 0, '0700111222');
    const second = buildDedupKey(5, { ...ev }, 'DEPARTED', 0, '0700111222');
    assert.equal(first, second);
  });
  it('differs by policy, by person and by day', () => {
    const base = buildDedupKey(5, ev, 'DEPARTED', 0, '0700111222');
    assert.notEqual(base, buildDedupKey(6, ev, 'DEPARTED', 0, '0700111222'));
    assert.notEqual(base, buildDedupKey(5, { ...ev, personId: 43 }, 'DEPARTED', 0, '0700111222'));
    assert.notEqual(base, buildDedupKey(5, { ...ev, attendanceDate: '2026-09-29' }, 'DEPARTED', 0, '0700111222'));
  });
  it('a second guardian (recipientIndex > 0) gets a distinct key from the first', () => {
    const first = buildDedupKey(5, ev, 'DEPARTED', 0, '0700111222');
    const second = buildDedupKey(5, ev, 'DEPARTED', 1, '0700333444');
    assert.notEqual(first, second);
  });
  it('never collides with the arrival/day-status dedup key for the same person+day', () => {
    const departed = buildDedupKey(5, ev, 'DEPARTED', 0, '0700111222');
    const arrived = buildDedupKey(5, { ...ev, status: 'present' }, 'ARRIVAL_ON_TIME', 0, '0700111222');
    assert.notEqual(departed, arrived);
  });
});
