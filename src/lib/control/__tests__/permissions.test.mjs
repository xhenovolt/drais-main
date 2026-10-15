// Control Center access — pure permission catalog.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  controlCan, permissionsFor, canOpenPath, areaForPath, sanitizePermissions, CONTROL_PRESETS, ALL_PERMISSIONS,
} from '@/lib/control/permissions';

describe('controlCan — roles without their own list (legacy presets)', () => {
  it('super-admin can do everything, including super-admin-only actions', () => {
    for (const p of ALL_PERMISSIONS) assert.equal(controlCan('XHENVOLT_SUPER_ADMIN', p), true, p);
    assert.equal(controlCan('XHENVOLT_SUPER_ADMIN', 'schools.hard_delete'), true);
  });

  it('operator keeps what the old Operator role could do', () => {
    for (const p of ['schools.manage', 'devices.manage', 'impersonate', 'billing.manage', 'sms.test', 'sms.provider.update', 'schools.view', 'audit.view'])
      assert.equal(controlCan('XHENVOLT_OPERATOR', p), true, p);
    for (const p of ['schools.hard_delete', 'plans.catalog', 'operators.manage', 'backup.view', 'database.view', 'sentinel.configure', 'sms.limits'])
      assert.equal(controlCan('XHENVOLT_OPERATOR', p), false, p);
  });

  it('viewer is read-only', () => {
    assert.equal(controlCan('XHENVOLT_VIEWER', 'platform.view'), true);
    assert.equal(controlCan('XHENVOLT_VIEWER', 'schools.manage'), false);
    assert.equal(controlCan('XHENVOLT_VIEWER', 'sms.test'), false);
  });

  it('unknown / null role gets nothing', () => {
    assert.equal(controlCan(null, 'platform.view'), false);
    assert.equal(controlCan('random', 'schools.manage'), false);
    assert.equal(permissionsFor('random').length, 0);
  });
});

describe('controlCan — an operator with their own permission list', () => {
  const omar = { role: 'XHENVOLT_OPERATOR', permissions: ['schools.view', 'devices.edit'] };

  it('holds exactly the listed permissions (plus view of an area they act in)', () => {
    assert.equal(controlCan(omar, 'schools.view'), true);
    assert.equal(controlCan(omar, 'devices.edit'), true);
    assert.equal(controlCan(omar, 'devices.view'), true, 'acting in an area implies seeing it');
    assert.equal(controlCan(omar, 'sms_providers.view'), false);
    assert.equal(controlCan(omar, 'sms.provider.update'), false, 'legacy names resolve too');
    assert.equal(controlCan(omar, 'schools.edit'), false);
  });

  it('an empty list means nothing, not the role preset', () => {
    assert.equal(permissionsFor({ role: 'XHENVOLT_OPERATOR', permissions: [] }).length, 0);
  });

  it('super-admin-only and unknown permissions can never be stored', () => {
    assert.deepEqual(sanitizePermissions(['schools.hard_delete', 'sms.limits', 'nope.view', 'schools.view', 'schools.view']), ['schools.view']);
    assert.equal(controlCan({ role: 'XHENVOLT_OPERATOR', permissions: ['schools.hard_delete'] }, 'schools.hard_delete'), false);
  });

  it('a super admin is never restricted by a stored list', () => {
    assert.equal(controlCan({ role: 'XHENVOLT_SUPER_ADMIN', permissions: [] }, 'operators.edit'), true);
  });

  it('a school-limited operator loses platform-wide areas', () => {
    const scoped = { role: 'XHENVOLT_OPERATOR', permissions: ['schools.view', 'dashboard.view', 'bi.view', 'sms_accounting.view'], schoolScope: [12020] };
    assert.equal(controlCan(scoped, 'schools.view'), true);
    assert.equal(controlCan(scoped, 'dashboard.view'), false);
    assert.equal(controlCan(scoped, 'bi.view'), false);
    assert.equal(controlCan(scoped, 'sms_accounting.view'), false);
  });
});

describe('pages', () => {
  it('maps paths to areas, longest prefix first', () => {
    assert.equal(areaForPath('/control/sms/providers')?.key, 'sms_providers');
    assert.equal(areaForPath('/control/sms')?.key, 'sms');
    assert.equal(areaForPath('/control/schools/12')?.key, 'schools');
    assert.equal(areaForPath('/control/sessions'), null);
  });

  it('opens only areas the operator can view; own sessions are always open', () => {
    const u = { role: 'XHENVOLT_OPERATOR', permissions: ['schools.view'] };
    assert.equal(canOpenPath(u, '/control/schools'), true);
    assert.equal(canOpenPath(u, '/control/sms/providers'), false);
    assert.equal(canOpenPath(u, '/control/sessions'), true);
  });
});

describe('presets', () => {
  it('only contain real, grantable permissions', () => {
    for (const [k, p] of Object.entries(CONTROL_PRESETS)) {
      assert.deepEqual([...p.permissions].sort(), sanitizePermissions(p.permissions), k);
      assert.ok(p.permissions.length > 0, k);
    }
  });
});
