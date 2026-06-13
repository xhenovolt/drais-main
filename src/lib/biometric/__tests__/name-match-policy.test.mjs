/**
 * Phase 1E acceptance tests — deterministic name-match policy.
 *
 * Covers the trust-refactor acceptance cases:
 *   TEST 4 — two learners share the same name → NO automatic permanent
 *            mapping (ambiguous, operator decides).
 *   TEST 5 — unknown name → no mapping (pending queue, never phantom
 *            creation).
 *   plus the deterministic-mapping happy path and the "close enough
 *   isn't enough" regression (old 0.6 threshold).
 *
 * Run: npm run test:biometric
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideNameMatchAction,
  looksLikeIpAddress,
  DETERMINISTIC_MIN_SCORE,
} from '../name-match-policy.ts';

const student = (id, name, score) => ({ type: 'student', id, name, score });
const staff = (id, name, score) => ({ type: 'staff', id, name, score });

test('no candidates → no_match (never phantom-create)', () => {
  assert.deepEqual(decideNameMatchAction([]), { action: 'no_match' });
  assert.deepEqual(decideNameMatchAction(null), { action: 'no_match' });
});

test('single full-score candidate → deterministic map', () => {
  const top = student(11, 'ABUBAKAR SHEKHA ALI', 1.0);
  const result = decideNameMatchAction([top]);
  assert.equal(result.action, 'map');
  assert.equal(result.candidate.id, 11);
});

test('TEST 4 — two learners share the same name → ambiguous, no auto-map', () => {
  const a = student(11, 'JOHN OKELLO', 1.0);
  const b = student(22, 'JOHN OKELLO', 1.0);
  const result = decideNameMatchAction([a, b]);
  assert.equal(result.action, 'ambiguous');
  assert.equal(result.candidates.length, 2);
});

test('learner and staff share the same name → ambiguous', () => {
  const a = student(11, 'GRACE ACHENG', 1.0);
  const b = staff(7, 'GRACE ACHENG', 1.0);
  const result = decideNameMatchAction([a, b]);
  assert.equal(result.action, 'ambiguous');
});

test('regression: the old 0.6 "close enough" score must NOT map', () => {
  // The pre-refactor auto-linker permanently mapped at score >= 0.6
  // with a 0.2 margin. That permanently attributed scans to the wrong
  // learner when device names were misspelled.
  const result = decideNameMatchAction([student(11, 'JOHN OKELO', 0.67)]);
  assert.equal(result.action, 'no_match');
});

test('full-score top with a plausible runner-up → ambiguous', () => {
  const result = decideNameMatchAction([
    student(11, 'MARY ATIM AKELLO', 1.0),
    student(22, 'MARY ATIM', 0.67),
  ]);
  assert.equal(result.action, 'ambiguous');
});

test('full-score top with only an implausible runner-up → map', () => {
  const result = decideNameMatchAction([
    student(11, 'MARY ATIM AKELLO', 1.0),
    student(22, 'PETER WANYAMA', 0.2),
  ]);
  assert.equal(result.action, 'map');
  assert.equal(result.candidate.id, 11);
});

test('candidates arrive unsorted — policy sorts internally', () => {
  const result = decideNameMatchAction([
    student(22, 'PETER WANYAMA', 0.2),
    student(11, 'MARY ATIM AKELLO', 1.0),
  ]);
  assert.equal(result.action, 'map');
  assert.equal(result.candidate.id, 11);
});

test('threshold sanity: deterministic means full score', () => {
  assert.ok(DETERMINISTIC_MIN_SCORE > 0.99);
});

test('looksLikeIpAddress — guards device_sn columns against IPs (TEST 1)', () => {
  assert.equal(looksLikeIpAddress('192.168.1.201'), true);
  assert.equal(looksLikeIpAddress(' 10.0.0.5 '), true);
  assert.equal(looksLikeIpAddress('OJK8231060228'), false); // real K40 serial
  assert.equal(looksLikeIpAddress(''), false);
  assert.equal(looksLikeIpAddress(null), false);
  assert.equal(looksLikeIpAddress(undefined), false);
});
