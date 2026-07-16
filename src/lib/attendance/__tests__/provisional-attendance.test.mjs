import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getProvisionalAttendanceMeta } from '../provisional.ts';

describe('provisional attendance metadata', () => {
  it('marks unresolved punches as provisional for immediate visibility', () => {
    const meta = getProvisionalAttendanceMeta({ matched: false, personId: null, isProvisional: false });

    assert.equal(meta.isProvisional, true);
    assert.equal(meta.provisionalReason, 'identity_unresolved');
    assert.equal(meta.displayStatus, 'Provisional');
    assert.equal(meta.smsBehavior, 'skip');
  });

  it('keeps matched punches non-provisional', () => {
    const meta = getProvisionalAttendanceMeta({ matched: true, personId: 23, isProvisional: false });

    assert.equal(meta.isProvisional, false);
    assert.equal(meta.provisionalReason, null);
    assert.equal(meta.displayStatus, 'Matched');
    assert.equal(meta.smsBehavior, 'normal');
  });
});
