// Identity Correction — pure planning + guards (Scenario 1 of the brief).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planCorrection } from '@/lib/biometric/identity-correction';

const current = { enrollment_id: 5, person_id: 100, role_type: 'staff', role_ref_id: 660001, pin_value: 25 };

describe('planCorrection', () => {
  it('valid correction (John→Peter) is accepted with from/to/pin', () => {
    const p = planCorrection(current, { role_type: 'staff', role_ref_id: 660002, person_id: 200 });
    assert.equal(p.ok, true);
    assert.equal(p.from.person_id, 100);
    assert.equal(p.to.role_ref_id, 660002);
    assert.equal(p.pin, 25);
  });

  it('no enrollment → cannot correct (nothing mapped yet)', () => {
    const p = planCorrection(null, { role_type: 'staff', role_ref_id: 660002, person_id: 200 });
    assert.equal(p.ok, false);
    assert.match(p.reason, /assign it first/i);
  });

  it('target archived / not found → rejected', () => {
    const p = planCorrection(current, { role_type: 'staff', role_ref_id: 660002, person_id: null });
    assert.equal(p.ok, false);
    assert.match(p.reason, /not found or archived/i);
  });

  it('correcting to the SAME person is a no-op', () => {
    const p = planCorrection(current, { role_type: 'staff', role_ref_id: 660001, person_id: 100 });
    assert.equal(p.ok, false);
    assert.match(p.reason, /already the mapped person/i);
  });

  it('invalid target role rejected', () => {
    const p = planCorrection(current, { role_type: 'parent', role_ref_id: 1, person_id: 5 });
    assert.equal(p.ok, false);
  });

  it('cross-role correction (staff PIN actually a learner) is allowed', () => {
    const p = planCorrection(current, { role_type: 'student', role_ref_id: 900, person_id: 300 });
    assert.equal(p.ok, true);
    assert.equal(p.to.role_type, 'student');
  });
});
