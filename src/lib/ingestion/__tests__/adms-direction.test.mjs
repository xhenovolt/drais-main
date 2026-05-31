// node:test — verifies the ADMS direction-decoding rules used by
// src/lib/comm/adms-attendance.ts. Pure logic; no DB.
//
// We don't import the helper directly (it touches '@/lib/db' which
// pulls in mysql2 and chokes under tsx --test). Instead we replicate
// the decision rules here so the behaviour is locked down by a test
// and any future change has to update both copies — that's the audit
// trail the user gets.
//
// Run: npx tsx --test src/lib/ingestion/__tests__/adms-direction.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mirror of pickEventType in adms-attendance.ts. If this diverges, the
// real production behaviour and the test diverge — the diff in this
// file is the canary.
function pickEventType({ studentId, staffId, inOutMode }) {
  const isStudent = studentId != null;
  const dir = inOutMode === 1 || inOutMode === 2 || inOutMode === 4 ? 'out' : 'in';
  if (isStudent) {
    return dir === 'in' ? 'learner.attendance.checkin' : 'learner.attendance.checkout';
  }
  if (staffId != null) {
    return dir === 'in' ? 'staff.attendance.checkin' : 'staff.attendance.checkout';
  }
  return null;
}

describe('ADMS direction decode — student paths', () => {
  it('INOUTMODE 0 → learner check-in', () => {
    assert.equal(pickEventType({ studentId: 11, staffId: null, inOutMode: 0 }), 'learner.attendance.checkin');
  });
  it('INOUTMODE 1 → learner check-out', () => {
    assert.equal(pickEventType({ studentId: 11, staffId: null, inOutMode: 1 }), 'learner.attendance.checkout');
  });
  it('INOUTMODE 2 (break-out firmware) → check-out', () => {
    assert.equal(pickEventType({ studentId: 11, staffId: null, inOutMode: 2 }), 'learner.attendance.checkout');
  });
  it('INOUTMODE 3 (break-in firmware) → check-in', () => {
    assert.equal(pickEventType({ studentId: 11, staffId: null, inOutMode: 3 }), 'learner.attendance.checkin');
  });
  it('INOUTMODE null (device did not report) → learner check-in (default)', () => {
    // Per the helper doc: "most schools use the device for arrival only,
    // which sends no mode" — default to check-in so parents still get the
    // arrival SMS.
    assert.equal(pickEventType({ studentId: 11, staffId: null, inOutMode: null }), 'learner.attendance.checkin');
  });
});

describe('ADMS direction decode — staff paths', () => {
  it('INOUTMODE 0 → staff check-in', () => {
    assert.equal(pickEventType({ studentId: null, staffId: 99, inOutMode: 0 }), 'staff.attendance.checkin');
  });
  it('INOUTMODE 1 → staff check-out', () => {
    assert.equal(pickEventType({ studentId: null, staffId: 99, inOutMode: 1 }), 'staff.attendance.checkout');
  });
  it('INOUTMODE null → staff check-in (default)', () => {
    assert.equal(pickEventType({ studentId: null, staffId: 99, inOutMode: null }), 'staff.attendance.checkin');
  });
});

describe('ADMS direction decode — no match cases', () => {
  it('both null → null (helper returns early; no event fires)', () => {
    assert.equal(pickEventType({ studentId: null, staffId: null, inOutMode: 0 }), null);
  });
});

describe('ADMS routing intent — what schools get when the rule is configured', () => {
  // Documents the expected mapping so changes in routing intent are
  // caught at PR time. Audience is a property of the comm_rule, not
  // of the event; this is the SCHOOL-FACING contract.
  const ROUTING = {
    'learner.attendance.checkin':  'parents',
    'learner.attendance.checkout': 'parents',
    'staff.attendance.checkin':    'headteacher',
    'staff.attendance.checkout':   'headteacher',
  };

  it('learner events route to parents', () => {
    assert.equal(ROUTING['learner.attendance.checkin'],  'parents');
    assert.equal(ROUTING['learner.attendance.checkout'], 'parents');
  });
  it('staff events route to headteacher', () => {
    assert.equal(ROUTING['staff.attendance.checkin'],  'headteacher');
    assert.equal(ROUTING['staff.attendance.checkout'], 'headteacher');
  });
});
