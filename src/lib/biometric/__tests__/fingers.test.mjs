// Multi-finger enrolment: which finger is suggested next, and the color/label a learner's row shows.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { suggestNextFinger, describeFingers, fingerLabel, fingerprintLevel, FINGERS } from '@/lib/biometric/fingers.ts';

describe('fingers', () => {
  it('has ten distinct slots, each with a hand and a name', () => {
    assert.equal(FINGERS.length, 10);
    assert.equal(new Set(FINGERS.map(f => f.label)).size, 10);
    assert.equal(fingerLabel(6), FINGERS[6].label);
    assert.match(fingerLabel(6), /Right/);
  });

  it('suggests the most reliable finger not yet enrolled, and null once all ten are done', () => {
    const first = suggestNextFinger([]);
    assert.notEqual(first, null);
    const second = suggestNextFinger([first]);
    assert.notEqual(second, first);
    assert.equal(suggestNextFinger(Array.from({ length: 10 }, (_, i) => i)), null);
  });

  it('never suggests a finger that is already in the enrolled list', () => {
    const enrolled = [6, 3, 5];
    const next = suggestNextFinger(enrolled);
    assert.ok(!enrolled.includes(next));
  });

  it('describes a set of fingers in a stable, de-duplicated, low-to-high order', () => {
    assert.equal(describeFingers([6, 6, 3]), `${fingerLabel(3)}, ${fingerLabel(6)}`);
    assert.equal(describeFingers([]), 'none');
  });
});

describe('fingerprintLevel — the color a learner/staff row shows', () => {
  it('none: nothing enrolled at all', () => {
    assert.equal(fingerprintLevel({ label: null, fingerCount: 0 }).level, 'none');
    assert.equal(fingerprintLevel({ label: 'Not enrolled', fingerCount: 0 }).level, 'none');
  });
  it('one vs two vs many: colors escalate with how many fingers DRAIS can prove', () => {
    assert.equal(fingerprintLevel({ label: 'Active', fingerCount: 1 }).level, 'one');
    assert.equal(fingerprintLevel({ label: 'Active', fingerCount: 2 }).level, 'two');
    assert.equal(fingerprintLevel({ label: 'Active', fingerCount: 3 }).level, 'many');
    const one = fingerprintLevel({ label: 'Active', fingerCount: 1 }).color;
    const two = fingerprintLevel({ label: 'Active', fingerCount: 2 }).color;
    const many = fingerprintLevel({ label: 'Active', fingerCount: 3 }).color;
    assert.notEqual(one, two);
    assert.notEqual(two, many);
  });
  it('a person the device knows about, but with no template count DRAIS can prove, is "unknown" — never guessed as 1', () => {
    assert.equal(fingerprintLevel({ label: 'Active', fingerCount: 0 }).level, 'unknown');
    assert.equal(fingerprintLevel({ label: 'Captured on device — not yet confirmed by DRAIS', fingerCount: 0 }).level, 'unknown');
  });
  it('failed/expired/revoked/suspended are always "problem", regardless of finger count', () => {
    for (const label of ['Failed', 'Expired', 'Revoked', 'Suspended']) {
      assert.equal(fingerprintLevel({ label, fingerCount: 3 }).level, 'problem');
    }
  });
  it('enrolled by face only (no fingerprint) is "none", not "unknown"', () => {
    assert.equal(fingerprintLevel({ label: 'Active', fingerCount: 0, hasFace: true }).level, 'none');
  });
  it('a pending enrolment with no captured fingers is "pending"', () => {
    assert.equal(fingerprintLevel({ label: 'Enrollment pending', fingerCount: 0 }).level, 'pending');
  });
});
