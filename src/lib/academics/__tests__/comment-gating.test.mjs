import test from 'node:test';
import assert from 'node:assert/strict';
import { canEnterSubject, denyReason, resolveManualComment } from '../comment-gating.ts';

// ── canEnterSubject ──────────────────────────────────────────────────────────
test('canEnterSubject: privileged user passes for any subject', () => {
  assert.equal(canEnterSubject({ isPrivileged: true, allocatedSubjectIds: [], subjectId: 99 }), true);
});
test('canEnterSubject: teacher passes for an allocated subject', () => {
  assert.equal(canEnterSubject({ isPrivileged: false, allocatedSubjectIds: [1, 2, 3], subjectId: 2 }), true);
});
test('canEnterSubject: teacher blocked for an unallocated subject', () => {
  assert.equal(canEnterSubject({ isPrivileged: false, allocatedSubjectIds: [1, 2], subjectId: 9 }), false);
});
test('canEnterSubject: teacher with no allocations is blocked', () => {
  assert.equal(canEnterSubject({ isPrivileged: false, allocatedSubjectIds: [], subjectId: 1 }), false);
});

// ── denyReason ───────────────────────────────────────────────────────────────
test('denyReason: null when allowed', () => {
  assert.equal(denyReason({ isPrivileged: true, allocatedSubjectIds: [], subjectId: 1 }), null);
  assert.equal(denyReason({ isPrivileged: false, allocatedSubjectIds: [1], subjectId: 1 }), null);
});
test('denyReason: message when blocked', () => {
  const r = denyReason({ isPrivileged: false, allocatedSubjectIds: [1], subjectId: 2 });
  assert.match(r, /not allocated/i);
});

// ── resolveManualComment ─────────────────────────────────────────────────────
test('resolveManualComment: manual wins over auto', () => {
  assert.equal(resolveManualComment('Great progress', 'Auto text'), 'Great progress');
});
test('resolveManualComment: blank manual falls back to auto', () => {
  assert.equal(resolveManualComment('   ', 'Auto text'), 'Auto text');
  assert.equal(resolveManualComment(null, 'Auto text'), 'Auto text');
  assert.equal(resolveManualComment(undefined, 'Auto text'), 'Auto text');
});
test('resolveManualComment: null when neither present', () => {
  assert.equal(resolveManualComment('', ''), null);
  assert.equal(resolveManualComment(null, null), null);
});
test('resolveManualComment: trims the winning value', () => {
  assert.equal(resolveManualComment('  Keep it up  ', null), 'Keep it up');
});
