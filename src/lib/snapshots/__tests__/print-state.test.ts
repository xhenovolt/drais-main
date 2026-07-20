import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReportSnapshot } from '../types';
import { freezeSnapshot, buildSnapshotRenderState } from '../print-state';

test('freezeSnapshot recursively freezes snapshot data', () => {
  const snapshot = {
    meta: { snapshotId: 'snap-1', schoolName: 'Demo School', type: 'secular', language: 'en', numerals: 'western' },
    classes: [{ classId: 1, className: 'P1', stream: 'A', subjects: [], students: [{ studentDbId: 7, results: [{ subjectId: 1, subjectName: 'Math', score: 78, displayScore: '78', grade: 'B', remarks: '', initials: 'AB' }] }] }],
  } as unknown as ReportSnapshot;

  const frozen = freezeSnapshot(snapshot);

  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(Object.isFrozen(frozen.meta), true);
  assert.equal(Object.isFrozen(frozen.classes), true);
  assert.equal(Object.isFrozen(frozen.classes[0]), true);
  assert.equal(Object.isFrozen(frozen.classes[0].students[0]), true);

  assert.throws(() => {
    'use strict';
    (frozen.meta as Record<string, unknown>).schoolName = 'Changed';
  }, /Cannot assign/i);
});

test('buildSnapshotRenderState composes a render-safe state for one student', () => {
  const snapshot = {
    meta: { snapshotId: 'snap-2', schoolName: 'Demo School', type: 'secular', language: 'en', numerals: 'western' },
    config: { nextTermBegins: '', teacherMappings: [] },
    classes: [{ classId: 1, className: 'P1', stream: 'A', subjects: [], students: [{ studentDbId: 9, name: 'Ada', results: [{ subjectId: 1, subjectName: 'Math', score: 90, displayScore: '90', grade: 'A', remarks: '', initials: 'AD' }] }] }],
  } as unknown as ReportSnapshot;

  const state = buildSnapshotRenderState({
    snapshot,
    classIdx: 0,
    studentIdx: 0,
    overrides: [],
    document: { id: 'doc-1', sections: [] } as any,
    renderCtx: { school: { name: 'Demo School' }, language: 'en', isRTL: false },
  });

  assert.equal(state.student.studentDbId, 9);
  assert.equal(state.dataCtx.student.fullName, 'Ada');
  assert.deepEqual(state.hiddenSubjectIds, []);
});
