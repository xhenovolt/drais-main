// Plan enforcement — pure enforcement resolver (Phase 15).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEnforcement } from '@/lib/control/plan-enforcement';

describe('resolveEnforcement', () => {
  it('per-school override wins over the global flag', () => {
    assert.equal(resolveEnforcement('on', false), true);   // forced on for this school
    assert.equal(resolveEnforcement('off', true), false);  // exempted despite global on
  });
  it('falls back to the global flag when no override', () => {
    assert.equal(resolveEnforcement(null, true), true);
    assert.equal(resolveEnforcement(undefined, false), false);
    assert.equal(resolveEnforcement('', true), true);
  });
  it('safe by default — global off means off', () => {
    assert.equal(resolveEnforcement(null, false), false);
  });
});
