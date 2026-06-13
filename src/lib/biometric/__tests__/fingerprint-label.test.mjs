/**
 * Phase 2K — fingerprint status label derivation (pure).
 * Every UI surface uses this single mapping; these tests pin the
 * lifecycle → label contract from the Phase 2 spec.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFingerprintLabel } from '../fingerprint-status.ts';

const d = (status, captureStatus, templateCount = 0, legacyTemplate = false) =>
  deriveFingerprintLabel({ status, captureStatus, templateCount, legacyTemplate });

test('no enrollment → Not enrolled', () => {
  assert.equal(d(null, null), 'Not enrolled');
});

test('identity committed, command queued/sent → Enrollment pending', () => {
  assert.equal(d('pending_capture', 'command_queued'), 'Enrollment pending');
  assert.equal(d('pending_capture', 'command_sent'), 'Enrollment pending');
  assert.equal(d('pending_capture', 'not_requested'), 'Enrollment pending');
});

test('device acked STARTENROLL → Awaiting fingerprint capture', () => {
  assert.equal(d('pending_capture', 'awaiting_capture'), 'Awaiting fingerprint capture');
});

test('template arrived → Active (capture proof received)', () => {
  assert.equal(d('pending_capture', 'captured'), 'Active');
  assert.equal(d('active', 'captured', 1), 'Active');
});

test('active identity WITHOUT template proof → honest partial label', () => {
  // The punch resolves, but DRAIS holds no template bytes — the print
  // lives only on the device. Never show a plain "has fingerprint".
  assert.equal(d('active', 'not_requested', 0), 'Captured on device — not yet confirmed by DRAIS');
});

test('legacy student_fingerprints template counts as proof', () => {
  assert.equal(d('active', 'not_requested', 0, true), 'Active');
});

test('failure and lifecycle terminals', () => {
  assert.equal(d('pending_capture', 'failed'), 'Failed');
  assert.equal(d('pending_capture', 'expired'), 'Expired');
  assert.equal(d('revoked', 'captured'), 'Revoked');
  assert.equal(d('suspended', 'captured'), 'Suspended');
  assert.equal(d('transferred', 'captured'), 'Revoked');
});
