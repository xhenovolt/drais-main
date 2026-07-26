// Platform settings — pure maintenance flag (Phase 23).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isReadOnly, MAINTENANCE_MODES } from '@/lib/control/platform-settings';

describe('isReadOnly', () => {
  it('only read_only blocks writes', () => {
    assert.equal(isReadOnly('read_only'), true);
    assert.equal(isReadOnly('banner'), false);
    assert.equal(isReadOnly('off'), false);
    assert.equal(isReadOnly(null), false);
    assert.equal(isReadOnly(undefined), false);
  });
  it('exposes the three modes', () => {
    assert.deepEqual([...MAINTENANCE_MODES], ['off', 'banner', 'read_only']);
  });
});
