// Subject classification for the grouped results-table layout
// (Reporting Architecture Phase 2). Run with:
//   npx tsx --test src/lib/drce/__tests__/subjectClassification.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isElectiveResultRow, groupResultRowsByCategory } from '../subjectClassification.ts';

describe('isElectiveResultRow', () => {
  it('treats core/primary/theology/islamic/religion subject_type as NOT elective', () => {
    for (const type of ['core', 'primary', 'theology', 'islamic', 'religion']) {
      assert.equal(isElectiveResultRow({ subjectType: type, subjectName: 'Anything' }), false, type);
    }
  });

  it('treats any other subject_type as elective', () => {
    assert.equal(isElectiveResultRow({ subjectType: 'elective', subjectName: 'Art' }), true);
    assert.equal(isElectiveResultRow({ subjectType: 'optional', subjectName: 'Music' }), true);
  });

  it('defaults to non-elective (primary) when subjectType is missing', () => {
    assert.equal(isElectiveResultRow({ subjectName: 'Mathematics' }), false);
  });

  it('Islamic Religious Education is never elective, regardless of subject_type', () => {
    assert.equal(isElectiveResultRow({ subjectType: 'elective', subjectName: 'Islamic Religious Education' }), false);
    assert.equal(isElectiveResultRow({ subjectType: 'elective', subjectName: 'IRE' }), false);
  });
});

describe('groupResultRowsByCategory', () => {
  const rows = [
    { subjectName: 'Mathematics', subjectType: 'core' },
    { subjectName: 'ICT', subjectType: 'elective' },
    { subjectName: 'English', subjectType: 'core' },
    { subjectName: 'Music', subjectType: 'elective' },
  ];

  it('partitions into core/elective, preserving relative order within each band', () => {
    const { core, elective } = groupResultRowsByCategory(rows);
    assert.deepEqual(core.map(r => r.subjectName), ['Mathematics', 'English']);
    assert.deepEqual(elective.map(r => r.subjectName), ['ICT', 'Music']);
  });

  it('never drops or duplicates a row', () => {
    const { core, elective } = groupResultRowsByCategory(rows);
    assert.equal(core.length + elective.length, rows.length);
  });
});
