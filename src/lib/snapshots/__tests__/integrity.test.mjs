// Regression guard: 2026-07 Albayan division-mismatch postmortem.
// verifySnapshotDivisionCoherence must flag exactly the corruption patterns
// found in production and stay silent on sound or out-of-scope snapshots.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifySnapshotDivisionCoherence } from '@/lib/snapshots/integrity';

const subjects = [
  { id: 1, name: 'SCIENCE', subjectType: 'primary' },
  { id: 2, name: 'SOCIAL STUDIES', subjectType: 'primary' },
  { id: 3, name: 'MATHEMATICS', subjectType: 'primary' },
  { id: 4, name: 'ENGLISH', subjectType: 'primary' },
  { id: 5, name: 'ICT (COMPUTER)', subjectType: 'secondary' },
];

// Real production case: MUSA TARIQ — contributing agg 11 → Division I;
// all-subjects agg 13 → Division II (the historical corruption).
const musaResults = [
  { subjectId: 1, subjectName: 'SCIENCE', score: 84, grade: 'D2' },
  { subjectId: 2, subjectName: 'SOCIAL STUDIES', score: 75, grade: 'C3' },
  { subjectId: 3, subjectName: 'MATHEMATICS', score: 63, grade: 'C4' },
  { subjectId: 4, subjectName: 'ENGLISH', score: 85, grade: 'D2' },
  { subjectId: 5, subjectName: 'ICT (COMPUTER)', score: 88, grade: 'D2' },
];

function makeSnapshot({ auditRec, studentExtra } = {}) {
  return {
    classes: [{
      classId: 10, className: 'PRIMARY SIX', subjects,
      students: [{ studentDbId: 782007, name: 'MUSA TARIQ MUKISA', results: musaResults, ...(studentExtra ?? {}) }],
    }],
    ...(auditRec ? { audit: { 10: { 782007: auditRec } } } : {}),
  };
}

describe('verifySnapshotDivisionCoherence', () => {
  it('passes a sound snapshot (audit matches contributing set)', () => {
    const snap = makeSnapshot({ auditRec: { aggregates: 11, division: 'Division I' } });
    assert.deepEqual(verifySnapshotDivisionCoherence(snap), []);
  });

  it('flags the historical ICT-inflated audit corruption (13/Division II)', () => {
    const snap = makeSnapshot({ auditRec: { aggregates: 13, division: 'Division II' } });
    const v = verifySnapshotDivisionCoherence(snap);
    assert.equal(v.length, 1);
    assert.equal(v[0].source, 'audit');
    assert.equal(v[0].expectedAggregates, 11);
    assert.equal(v[0].expectedDivision, 'Division I');
  });

  it('flags stored student values that disagree with contributing grades', () => {
    const snap = makeSnapshot({ studentExtra: { aggregates: 12, division: 'Division I' } });
    const v = verifySnapshotDivisionCoherence(snap);
    assert.equal(v.length, 1);
    assert.equal(v[0].source, 'student');
  });

  it('ignores students without stored values or audit records', () => {
    assert.deepEqual(verifySnapshotDivisionCoherence(makeSnapshot()), []);
  });

  it('skips nursery classes', () => {
    const snap = makeSnapshot({ auditRec: { aggregates: 13, division: 'Division II' } });
    snap.classes[0].className = 'BABY CLASS';
    assert.deepEqual(verifySnapshotDivisionCoherence(snap), []);
  });

  it('skips unmapped grade schemes (Arabic/legacy letters)', () => {
    const snap = makeSnapshot({ auditRec: { aggregates: 13, division: 'Division II' } });
    snap.classes[0].students[0].results = [
      { subjectId: 1, subjectName: 'SCIENCE', score: null, grade: 'جيد' },
      { subjectId: 3, subjectName: 'MATHEMATICS', score: null, grade: 'C' },
    ];
    assert.deepEqual(verifySnapshotDivisionCoherence(snap), []);
  });
});
