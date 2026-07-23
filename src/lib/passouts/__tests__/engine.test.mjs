import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePassout } from '../engine.ts';
import { decideVisit } from '../visitation.ts';
import { smsAllowed, nextApprovalState, DEFAULT_PASSOUT_SETTINGS } from '../settings.ts';

const NOW = new Date('2026-07-01T10:00:00Z').getTime();
const future = new Date('2026-07-01T18:00:00Z').toISOString();
const past = new Date('2026-07-01T08:00:00Z').toISOString();

/* ── Gate decisions (Phase 7) ─────────────────────────────────────────── */

test('gate: no active pass → NOT AUTHORIZED', () => {
  const r = decidePassout(null, NOW);
  assert.equal(r.outcome, 'no_active_pass');
  assert.equal(r.decision, 'denied');
  assert.equal(r.title, 'NOT AUTHORIZED');
});

test('gate: approved & in-window → AUTHORIZED', () => {
  const r = decidePassout({ id: 1, status: 'approved', approved_until: future, reason: 'Clinic' }, NOW);
  assert.equal(r.outcome, 'exit_allowed');
  assert.equal(r.decision, 'allowed');
  assert.equal(r.title, 'AUTHORIZED');
});

test('gate: pending (approval incomplete) → NOT AUTHORIZED', () => {
  const r = decidePassout({ id: 1, status: 'pending', approved_until: future }, NOW);
  assert.equal(r.outcome, 'not_approved');
  assert.equal(r.decision, 'denied');
  assert.equal(r.title, 'NOT AUTHORIZED');
});

test('gate: expired authorization → denied', () => {
  const r = decidePassout({ id: 1, status: 'approved', approved_until: past }, NOW);
  assert.equal(r.outcome, 'pass_expired');
  assert.equal(r.decision, 'denied');
  assert.equal(r.title, 'NOT AUTHORIZED');
});

test('gate: learner already out → this scan is the RETURN', () => {
  const r = decidePassout({ id: 1, status: 'used', approved_until: future }, NOW);
  assert.equal(r.outcome, 'return_recorded');
  assert.equal(r.decision, 'allowed');
  assert.equal(r.title, 'RETURN RECORDED');
});

test('gate: overdue learner returning → RETURN RECORDED', () => {
  const r = decidePassout({ id: 1, status: 'overdue', expected_return_at: past }, NOW);
  assert.equal(r.outcome, 'return_recorded');
  assert.equal(r.decision, 'allowed');
});

test('gate: duplicate exit attempt after return → NOT AUTHORIZED', () => {
  const r = decidePassout({ id: 1, status: 'returned' }, NOW);
  assert.equal(r.outcome, 'already_returned');
  assert.equal(r.decision, 'denied');
  assert.equal(r.title, 'NOT AUTHORIZED');
});

test('gate: emergency/medical flags survive into the verdict payload', () => {
  const r = decidePassout({ id: 1, status: 'approved', approved_until: future, is_emergency: 1, is_medical: 0, passout_no: 'PO-260701-1' }, NOW);
  assert.equal(r.passout.is_emergency, true);
  assert.equal(r.passout.is_medical, false);
  assert.equal(r.passout.passout_no, 'PO-260701-1');
});

/* ── Approval workflow (Phase 6) ──────────────────────────────────────── */

test('workflow single: approve finalizes immediately', () => {
  const r = nextApprovalState({ status: 'pending', first_approved_by: null }, 'single', 7);
  assert.deepEqual({ ok: r.ok, final: r.final }, { ok: true, final: true });
});

test('workflow two-step: first approval is not final', () => {
  const r = nextApprovalState({ status: 'pending', first_approved_by: null }, 'two_step', 7);
  assert.deepEqual({ ok: r.ok, final: r.final }, { ok: true, final: false });
});

test('workflow two-step: same user cannot complete both steps', () => {
  const r = nextApprovalState({ status: 'pending', first_approved_by: 7 }, 'two_step', 7);
  assert.equal(r.ok, false);
});

test('workflow two-step: a different user finalizes', () => {
  const r = nextApprovalState({ status: 'pending', first_approved_by: 7 }, 'two_step', 9);
  assert.deepEqual({ ok: r.ok, final: r.final }, { ok: true, final: true });
});

test('workflow: cannot approve a non-pending pass', () => {
  for (const status of ['approved', 'used', 'returned', 'cancelled', 'rejected', 'expired']) {
    assert.equal(nextApprovalState({ status, first_approved_by: null }, 'single', 7).ok, false, status);
  }
});

/* ── SMS policy (Phase 9) — settings-governed, never hardcoded ────────── */

test('sms: defaults → exit yes, return no', () => {
  assert.equal(smsAllowed(DEFAULT_PASSOUT_SETTINGS, {}, 'exit'), true);
  assert.equal(smsAllowed(DEFAULT_PASSOUT_SETTINGS, {}, 'return'), false);
});

test('sms: disabled kills everything', () => {
  const s = { ...DEFAULT_PASSOUT_SETTINGS, notifications_disabled: true, notify_return: true };
  assert.equal(smsAllowed(s, { is_emergency: 1 }, 'exit'), false);
  assert.equal(smsAllowed(s, { is_emergency: 1 }, 'return'), false);
});

test('sms: emergency-only blocks ordinary passes, allows emergency/medical', () => {
  const s = { ...DEFAULT_PASSOUT_SETTINGS, emergency_only: true, notify_return: true };
  assert.equal(smsAllowed(s, {}, 'exit'), false);
  assert.equal(smsAllowed(s, { is_emergency: 1 }, 'exit'), true);
  assert.equal(smsAllowed(s, { is_medical: 1 }, 'return'), true);
});

test('sms: return toggle honored', () => {
  const s = { ...DEFAULT_PASSOUT_SETTINGS, notify_return: true };
  assert.equal(smsAllowed(s, {}, 'return'), true);
});

/* ── Visitation cards (unchanged behaviour) ───────────────────────────── */

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
