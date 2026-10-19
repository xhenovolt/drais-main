import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inDraisScope, fileInScope, cleanFolder, draisFolder } from '../cloudinary-admin.ts';
import { controlCan, permissionsFor } from '../permissions.ts';

test('only DRAIS folders are in scope', () => {
  for (const f of ['drais', 'drais/students', 'drais-backups', 'drais-trash/drais/logos']) assert.equal(inDraisScope(f), true, f);
  for (const f of ['', 'sirius', 'bookto/x', 'draisx', 'samples', 'xhenvolt']) assert.equal(inDraisScope(f), false, f);
});

test('unfiled files count as DRAIS only when their public id starts with drais/', () => {
  assert.equal(fileInScope({ folder: '', public_id: 'drais/idcards-jobs/1/a.xlsx' }), true);
  assert.equal(fileInScope({ folder: '', public_id: 'sirius/x' }), false);
  assert.equal(fileInScope({ folder: 'sirius/schools', public_id: 'drais/oops' }), false);
});

test('folder paths are cleaned and traversal is refused', () => {
  assert.equal(cleanFolder('/drais//logos/'), 'drais/logos');
  assert.throws(() => cleanFolder('drais/../sirius'));
  assert.throws(() => cleanFolder('drais/"x'));
  assert.throws(() => draisFolder('sirius'), /outside DRAIS storage/);
  assert.equal(draisFolder('drais/logos'), 'drais/logos');
});

test('storage is never granted by the legacy operator/viewer presets and never to school-scoped operators', () => {
  assert.equal(controlCan('XHENVOLT_OPERATOR', 'storage.view'), false);
  assert.equal(controlCan('XHENVOLT_VIEWER', 'storage.view'), false);
  assert.equal(controlCan('XHENVOLT_SUPER_ADMIN', 'storage.purge'), true);
  assert.equal(permissionsFor({ role: 'XHENVOLT_OPERATOR', permissions: ['storage.view'], schoolScope: [5] }).includes('storage.view'), false);
  assert.equal(controlCan({ role: 'XHENVOLT_OPERATOR', permissions: ['storage.delete'] }, 'storage.view'), true);
});
