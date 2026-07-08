import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPolicy } from '../policy-resolver.ts';

const D = new Date('2026-06-22T08:00:00Z');
const base = (over) => ({ id: 1, scope_type: 'school', priority: 100, is_active: 1, ...over });
const ctx = (over) => ({ schoolId: 1, roleType: 'student', date: D, personId: 50, classId: 7, streamId: 3, departmentId: 0, boardingStatus: 'boarding', deviceId: 9, ...over });

test('school default when only school rule', () => {
  const r = selectPolicy([base({ id: 1, scope_type: 'school' })], ctx());
  assert.equal(r.policy_id, 1); assert.equal(r.scope_type, 'school'); assert.equal(r.fallback_used, true);
});

test('staff gets staff role rule, not student rule', () => {
  const rules = [
    base({ id: 1, scope_type: 'role', applies_to: 'students' }),
    base({ id: 2, scope_type: 'role', applies_to: 'teachers' }),
  ];
  const r = selectPolicy(rules, ctx({ roleType: 'staff' }));
  assert.equal(r.policy_id, 2);
});

test('boarder rule overrides role default', () => {
  const rules = [
    base({ id: 1, scope_type: 'role', applies_to: 'students' }),
    base({ id: 2, scope_type: 'boarding', boarding_scope: 'boarding' }),
  ];
  const r = selectPolicy(rules, ctx({ boardingStatus: 'boarding' }));
  assert.equal(r.policy_id, 2); assert.equal(r.scope_type, 'boarding');
});

test('day-scholar rule does NOT apply to a boarder', () => {
  const rules = [
    base({ id: 1, scope_type: 'role', applies_to: 'students' }),
    base({ id: 2, scope_type: 'boarding', boarding_scope: 'day' }),
  ];
  const r = selectPolicy(rules, ctx({ boardingStatus: 'boarding' }));
  assert.equal(r.policy_id, 1); // boarder falls back to role
});

test('class rule overrides role + boarding', () => {
  const rules = [
    base({ id: 1, scope_type: 'role', applies_to: 'students' }),
    base({ id: 2, scope_type: 'boarding', boarding_scope: 'boarding' }),
    base({ id: 3, scope_type: 'class', scope_id: 7 }),
  ];
  const r = selectPolicy(rules, ctx());
  assert.equal(r.policy_id, 3); assert.equal(r.scope_type, 'class');
});

test('individual learner override beats everything', () => {
  const rules = [
    base({ id: 1, scope_type: 'school' }),
    base({ id: 2, scope_type: 'role', applies_to: 'students' }),
    base({ id: 3, scope_type: 'class', scope_id: 7 }),
    base({ id: 4, scope_type: 'device', scope_id: 9 }),
    base({ id: 5, scope_type: 'learner', scope_id: 50 }),
  ];
  const r = selectPolicy(rules, ctx());
  assert.equal(r.policy_id, 5); assert.equal(r.scope_type, 'learner');
});

test('device policy beats class/role but not learner', () => {
  const rules = [
    base({ id: 2, scope_type: 'role', applies_to: 'students' }),
    base({ id: 3, scope_type: 'class', scope_id: 7 }),
    base({ id: 4, scope_type: 'device', scope_id: 9 }),
  ];
  const r = selectPolicy(rules, ctx());
  assert.equal(r.policy_id, 4); assert.equal(r.scope_type, 'device');
});

test('effective dates exclude expired rules', () => {
  const rules = [
    base({ id: 1, scope_type: 'school' }),
    base({ id: 2, scope_type: 'learner', scope_id: 50, end_date: '2020-01-01' }),
  ];
  const r = selectPolicy(rules, ctx());
  assert.equal(r.policy_id, 1); // learner override expired
});

test('tie within same scope -> lower priority number wins', () => {
  const rules = [
    base({ id: 3, scope_type: 'class', scope_id: 7, priority: 100 }),
    base({ id: 4, scope_type: 'class', scope_id: 7, priority: 10 }),
  ];
  const r = selectPolicy(rules, ctx());
  assert.equal(r.policy_id, 4);
});

test('ambiguous same-scope+priority -> fallback to school + warning', () => {
  const rules = [
    base({ id: 1, scope_type: 'school' }),
    base({ id: 3, scope_type: 'class', scope_id: 7, priority: 5, effective_date: '2026-01-01' }),
    base({ id: 4, scope_type: 'class', scope_id: 7, priority: 5, effective_date: '2026-01-01' }),
  ];
  const r = selectPolicy(rules, ctx());
  assert.equal(r.ambiguous, true); assert.equal(r.scope_type, 'school'); assert.equal(r.fallback_used, true);
});

// ── shift scope (staff) — integration of the shift engine ────────────────────
test('shift rule matches staff and beats role + school', () => {
  const rules = [
    base({ id: 1, scope_type: 'school' }),
    base({ id: 2, scope_type: 'role', applies_to: 'teachers' }),
    base({ id: 3, scope_type: 'shift' }),
  ];
  const r = selectPolicy(rules, ctx({ roleType: 'staff' }));
  assert.equal(r.policy_id, 3);
  assert.equal(r.scope_type, 'shift');
});

test('shift rule does NOT apply to a student (falls back to school)', () => {
  const rules = [base({ id: 1, scope_type: 'school' }), base({ id: 3, scope_type: 'shift' })];
  const r = selectPolicy(rules, ctx({ roleType: 'student' }));
  assert.equal(r.scope_type, 'school');
});

test('individual staff override (tier 1) beats shift (tier 3)', () => {
  const rules = [
    base({ id: 3, scope_type: 'shift' }),
    base({ id: 4, scope_type: 'staff', scope_id: 50 }),
  ];
  const r = selectPolicy(rules, ctx({ roleType: 'staff', personId: 50 }));
  assert.equal(r.policy_id, 4);
});
