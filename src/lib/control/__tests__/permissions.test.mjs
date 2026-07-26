// Control RBAC — pure permission catalog (Phase 13).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { controlCan, permissionsFor } from '@/lib/control/permissions';

describe('controlCan', () => {
  it('super-admin can do everything', () => {
    for (const p of ['platform.view', 'schools.manage', 'schools.hard_delete', 'devices.manage', 'plans.catalog', 'billing.manage', 'impersonate', 'operators.manage']) {
      assert.equal(controlCan('XHENVOLT_SUPER_ADMIN', p), true, p);
    }
  });

  it('operator does day-to-day ops but not catalog / operators / hard-delete', () => {
    assert.equal(controlCan('XHENVOLT_OPERATOR', 'schools.manage'), true);
    assert.equal(controlCan('XHENVOLT_OPERATOR', 'devices.manage'), true);
    assert.equal(controlCan('XHENVOLT_OPERATOR', 'impersonate'), true);
    assert.equal(controlCan('XHENVOLT_OPERATOR', 'billing.manage'), true);
    assert.equal(controlCan('XHENVOLT_OPERATOR', 'schools.hard_delete'), false);
    assert.equal(controlCan('XHENVOLT_OPERATOR', 'plans.catalog'), false);
    assert.equal(controlCan('XHENVOLT_OPERATOR', 'operators.manage'), false);
  });

  it('viewer is read-only', () => {
    assert.equal(controlCan('XHENVOLT_VIEWER', 'platform.view'), true);
    assert.equal(controlCan('XHENVOLT_VIEWER', 'schools.manage'), false);
    assert.equal(controlCan('XHENVOLT_VIEWER', 'devices.manage'), false);
  });

  it('unknown / null role gets nothing', () => {
    assert.equal(controlCan(null, 'platform.view'), false);
    assert.equal(controlCan('random', 'schools.manage'), false);
    assert.equal(permissionsFor('random').length, 0);
  });
});
