// node:test suite for the CAFE Phase 2 ranker modes.
// Run with:  npx tsx --test src/lib/drce/__tests__/ranker.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankStudents } from '../../snapshots/ranker.ts';

function stu(id, last, scores) {
  return {
    id: String(id), studentDbId: id,
    name: `${last} test`, firstName: 'A', lastName: last,
    gender: '', admissionNumber: '', photoUrl: null,
    results: scores.map((s, i) => ({
      subjectId: i + 1, subjectName: `S${i}`, displaySubject: `S${i}`,
      score: s, displayScore: String(s), grade: '', remarks: '',
      initials: '', teacherName: '',
    })),
    total: 0, average: 0, position: 0, totalInClass: 0,
    displayTotal: '', displayAverage: '', displayPosition: '',
    comments: { classTeacher: '', dos: '', headTeacher: '' },
    remarks: '',
  };
}

describe('ranker — numeric mode (legacy default)', () => {
  it('sorts by total desc, assigns 1..N positions', () => {
    const students = [stu(1, 'A', [60, 70]), stu(2, 'B', [80, 90]), stu(3, 'C', [50, 50])];
    rankStudents(students);  // default mode
    assert.equal(students[0].lastName, 'B');
    assert.equal(students[0].position, 1);
    assert.equal(students[1].position, 2);
    assert.equal(students[2].position, 3);
  });
  it('total=0 for empty results', () => {
    const students = [stu(1, 'A', [])];
    rankStudents(students);
    assert.equal(students[0].total, 0);
    assert.equal(students[0].average, 0);
    assert.equal(students[0].totalInClass, 1);
  });
});

describe('ranker — competency mode', () => {
  it('ties share the same rank', () => {
    const students = [
      stu(1, 'A', [80, 80]),  // total 160
      stu(2, 'B', [80, 80]),  // total 160 — tie with A
      stu(3, 'C', [70, 70]),  // total 140
      stu(4, 'D', [80, 80]),  // total 160 — tie
    ];
    rankStudents(students, 'competency');
    // Sorted by total desc, ties on tie-breaker chain (lastName).
    // A, B, D all share rank 1; C gets rank 4.
    const byName = Object.fromEntries(students.map(s => [s.lastName, s.position]));
    assert.equal(byName.A, 1);
    assert.equal(byName.B, 1);
    assert.equal(byName.D, 1);
    assert.equal(byName.C, 4);
  });
});

describe('ranker — none mode', () => {
  it('skips ranking entirely; positions stay 0', () => {
    const students = [stu(1, 'A', [60]), stu(2, 'B', [80])];
    rankStudents(students, 'none');
    assert.equal(students[0].position, 0);
    assert.equal(students[1].position, 0);
    assert.equal(students[0].totalInClass, 2);
  });
  it('totals + averages still computed (for binding access)', () => {
    const students = [stu(1, 'A', [40, 60])];
    rankStudents(students, 'none');
    assert.equal(students[0].total, 100);
    assert.equal(students[0].average, 50);
  });
  it('alphabetical sort is deterministic for stable dataHash', () => {
    const students = [stu(2, 'B', [80]), stu(1, 'A', [70])];
    rankStudents(students, 'none');
    assert.equal(students[0].lastName, 'A');
    assert.equal(students[1].lastName, 'B');
  });
});
