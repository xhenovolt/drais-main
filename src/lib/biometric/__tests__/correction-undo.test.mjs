// Phase A — correction undo/preview guard semantics (pure planning reused).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planCorrection } from '@/lib/biometric/identity-correction';

// undoLastCorrection reverts to the OLD binding recorded in mapping_history.
// The reversal target is itself a correction back to (old_role, old_ref) — so
// planCorrection must accept it exactly like a forward correction. These
// assert the reversal is a well-formed correction and never a no-op loop.
describe('undo reversal is a valid correction', () => {
  const afterForward = { enrollment_id: 5, person_id: 200, role_type: 'staff', role_ref_id: 660002, pin_value: 25 };

  it('reverting to the prior person is accepted', () => {
    const p = planCorrection(afterForward, { role_type: 'staff', role_ref_id: 660001, person_id: 100 });
    assert.equal(p.ok, true);
    assert.equal(p.to.role_ref_id, 660001);
  });

  it('reverting to the SAME current person is a no-op (double-undo guard analogue)', () => {
    const p = planCorrection(afterForward, { role_type: 'staff', role_ref_id: 660002, person_id: 200 });
    assert.equal(p.ok, false);
    assert.match(p.reason, /already the mapped person/i);
  });

  it('cross-role reversal (was a learner) is allowed', () => {
    const p = planCorrection(afterForward, { role_type: 'student', role_ref_id: 900, person_id: 300 });
    assert.equal(p.ok, true);
    assert.equal(p.to.role_type, 'student');
  });
});
