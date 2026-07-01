import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePassout } from '../engine.ts';
import { decideVisit } from '../visitation.ts';

const NOW = new Date('2026-07-01T10:00:00Z').getTime();
const future = new Date('2026-07-01T18:00:00Z').toISOString();
const past = new Date('2026-07-01T08:00:00Z').toISOString();

test('pass-out: no active pass → NOT ALLOWED', () => {
  const r = decidePassout(null, NOW);
  assert.equal(r.outcome, 'no_active_pass');
  assert.equal(r.decision, 'denied');
  assert.equal(r.title, 'NOT ALLOWED');
});

test('pass-out: approved & in-window → ALLOWED TO GO OUT', () => {
  const r = decidePassout({ id: 1, status: 'approved', approved_until: future, reason: 'Clinic' }, NOW);
  assert.equal(r.outcome, 'exit_allowed');
  assert.equal(r.decision, 'allowed');
  assert.equal(r.title, 'ALLOWED TO GO OUT');
});

test('pass-out: approved but expired → PASS EXPIRED / denied', () => {
  const r = decidePassout({ id: 1, status: 'approved', approved_until: past }, NOW);
  assert.equal(r.outcome, 'pass_expired');
  assert.equal(r.decision, 'denied');
});

test('pass-out: already used → RETURN RECORDED', () => {
  const r = decidePassout({ id: 1, status: 'used', approved_until: future }, NOW);
  assert.equal(r.outcome, 'return_recorded');
  assert.equal(r.decision, 'allowed');
});

test('pass-out: already returned → NOT ALLOWED', () => {
  const r = decidePassout({ id: 1, status: 'returned' }, NOW);
  assert.equal(r.outcome, 'already_returned');
  assert.equal(r.decision, 'denied');
});

test('visitation: unknown card → UNKNOWN VISITATION CARD', () => {
  const r = decideVisit(null, NOW);
  assert.equal(r.title, 'UNKNOWN VISITATION CARD');
  assert.equal(r.unknown, true);
});

test('visitation: active card → VISIT ALLOWED', () => {
  const r = decideVisit({ id: 1, card_uid: 'X', status: 'active', student_name: 'Ali' }, NOW);
  assert.equal(r.decision, 'allowed');
  assert.equal(r.title, 'VISIT ALLOWED');
});

test('visitation: suspended → VISIT DENIED', () => {
  assert.equal(decideVisit({ id: 1, card_uid: 'X', status: 'suspended' }, NOW).decision, 'denied');
});

test('visitation: expired → VISIT DENIED', () => {
  const r = decideVisit({ id: 1, card_uid: 'X', status: 'active', expires_at: past }, NOW);
  assert.equal(r.decision, 'denied');
  assert.equal(r.reason, 'Card expired');
});
