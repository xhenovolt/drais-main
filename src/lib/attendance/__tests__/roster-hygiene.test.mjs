// Roster hygiene — pure action validation (Phase C).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateHygieneAction } from '@/lib/attendance/roster-hygiene';

describe('validateHygieneAction', () => {
  it('deactivate with ids → plan with status inactive', () => {
    const p = validateHygieneAction({ action: 'deactivate', role: 'staff', personIds: [1, 2, 3] });
    assert.equal(p.ok, true);
    assert.equal(p.role, 'staff');
    assert.equal(p.status, 'inactive');
    assert.deepEqual(p.personIds, [1, 2, 3]);
  });

  it('reactivate → status active', () => {
    assert.equal(validateHygieneAction({ action: 'reactivate', role: 'student', personIds: [5] }).status, 'active');
  });

  it('rejects empty selection', () => {
    assert.equal(validateHygieneAction({ action: 'deactivate', role: 'staff', personIds: [] }).ok, false);
  });

  it('filters non-numeric / negative ids', () => {
    const p = validateHygieneAction({ action: 'deactivate', role: 'staff', personIds: [1, -2, 'x', 0, 3] });
    assert.deepEqual(p.personIds, [1, 3]);
  });

  it('caps the batch at 1000', () => {
    const big = Array.from({ length: 1001 }, (_, i) => i + 1);
    assert.equal(validateHygieneAction({ action: 'deactivate', role: 'staff', personIds: big }).ok, false);
  });

  it('rejects bad role', () => {
    assert.equal(validateHygieneAction({ action: 'deactivate', role: 'parent', personIds: [1] }).ok, false);
  });

  it('fix_enrollment_mismatch and count need no ids', () => {
    assert.equal(validateHygieneAction({ action: 'fix_enrollment_mismatch' }).ok, true);
    assert.equal(validateHygieneAction({ action: 'count' }).ok, true);
  });

  it('rejects unknown action', () => {
    assert.equal(validateHygieneAction({ action: 'delete_everything', role: 'staff', personIds: [1] }).ok, false);
  });
});
