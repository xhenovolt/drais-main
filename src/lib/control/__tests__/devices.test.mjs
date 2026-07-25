// Control Center platform device management — pure validation (P2).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeviceAction, PLATFORM_DEVICE_ACTIONS } from '@/lib/control/devices';

describe('validateDeviceAction', () => {
  it('accepts every known action', () => {
    for (const a of PLATFORM_DEVICE_ACTIONS) {
      const ctx = a === 'assign' ? { toSchoolId: 5 } : {};
      assert.equal(validateDeviceAction(a, ctx).ok, true, a);
    }
  });

  it('rejects an unknown action', () => {
    const r = validateDeviceAction('nuke', {});
    assert.equal(r.ok, false);
    assert.match(r.reason, /unknown action/i);
  });

  it('assign requires a valid target school', () => {
    assert.equal(validateDeviceAction('assign', { toSchoolId: null }).ok, false);
    assert.equal(validateDeviceAction('assign', { toSchoolId: 0 }).ok, false);
    assert.equal(validateDeviceAction('assign', { toSchoolId: -1 }).ok, false);
    assert.equal(validateDeviceAction('assign', { toSchoolId: 12004 }).ok, true);
  });

  it('non-assign actions do not need a school', () => {
    assert.equal(validateDeviceAction('suspend', {}).ok, true);
    assert.equal(validateDeviceAction('retire', {}).ok, true);
    assert.equal(validateDeviceAction('release', {}).ok, true);
    assert.equal(validateDeviceAction('activate', {}).ok, true);
  });
});
