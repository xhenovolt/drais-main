import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustDivisionForF9,
  computeAggregateFromGrades,
  computeDivision,
  createTeacherInitialsSyncMessage,
  gradeForScore,
  getNurseryOverallGrade,
  resolveTeacherInitials,
  selectContributingSubjects,
  type ContributionPolicy,
} from '../canonical-report-engine';
import { resolveSnapshotTeacherInitials } from '../../snapshots/teacher-initials';

test('resolveTeacherInitials prefers custom allocation initials over fallback values', () => {
  const resolved = resolveTeacherInitials({
    manualInitials: 'ME',
    allocationInitials: 'AB',
    teacherName: 'Amina Bukenya',
    teacherInitials: 'OLD',
  });

  assert.equal(resolved, 'ME');
});

test('resolveTeacherInitials falls back to allocation initials when no manual override exists', () => {
  const resolved = resolveTeacherInitials({
    allocationInitials: 'AB',
    teacherName: 'Amina Bukenya',
    teacherInitials: 'OLD',
  });

  assert.equal(resolved, 'AB');
});

test('resolveTeacherInitials ignores literal null placeholders and falls back to teacher names', () => {
  const resolved = resolveTeacherInitials({
    allocationInitials: 'null',
    teacherName: 'Amina Bukenya',
    teacherInitials: 'OLD',
  });

  assert.equal(resolved, 'AB');
});

test('resolveSnapshotTeacherInitials derives initials from teacher names when placeholders are present', () => {
  const resolved = resolveSnapshotTeacherInitials({
    teacherInitials: 'null',
    teacherName: 'Amina Bukenya',
    teachersAll: 'Amina Bukenya / Sara Kato',
  });

  assert.equal(resolved, 'AB');
});

test('selectContributingSubjects excludes ignored and IRE subjects by default', () => {
  const subjects = [
    { id: 1, name: 'Mathematics', score: 80, contributionPolicy: 'compulsory' as ContributionPolicy },
    { id: 2, name: 'IRE', score: 70, contributionPolicy: 'ignored' as ContributionPolicy },
    { id: 3, name: 'English', score: 60, contributionPolicy: 'elective' as ContributionPolicy },
  ];

  const results = selectContributingSubjects(subjects);
  assert.deepEqual(results.map((s) => s.id), [1]);
});

test('gradeForScore returns nursery grade mapping and standard grades correctly', () => {
  assert.equal(gradeForScore(92, false), 'D1');
  assert.equal(gradeForScore(92, true), 'A');
  assert.equal(gradeForScore(55, true), 'C');
  assert.equal(gradeForScore(30, true), 'E');
});

test('getNurseryOverallGrade chooses the most frequent nursery grade', () => {
  const overall = getNurseryOverallGrade(['A', 'B', 'A', 'C']);
  assert.equal(overall, 'A');
});

test('computeAggregateFromGrades sums grade points correctly', () => {
  const aggregate = computeAggregateFromGrades(['D1', 'D2', 'C3']);
  assert.equal(aggregate, 6);
});

test('computeDivision uses configured boundaries and returns Division I for aggregate 12', () => {
  const division = computeDivision(12, {
    boundaries: [12, 24, 28, 32],
    labels: ['Division I', 'Division II', 'Division III', 'Division IV', 'Division U'],
  });

  assert.equal(division, 'Division I');
});

test('computeDivision supports custom boundary labels and best-of-N policies', () => {
  const division = computeDivision(26, {
    boundaries: [12, 24, 28, 32],
    labels: ['First', 'Second', 'Third', 'Fourth', 'Ungraded'],
  });

  assert.equal(division, 'Third');
});

test('adjustDivisionForF9 downgrades division correctly for a failing subject', () => {
  const division = adjustDivisionForF9('Division I', ['D1', 'F9', 'C3'], false);
  assert.equal(division, 'Division II');
});

test('adjustDivisionForF9 downgrades twice when math fail is present', () => {
  const division = adjustDivisionForF9('Division I', ['D1', 'F9', 'C3'], true);
  assert.equal(division, 'Division III');
});

test('adjustDivisionForF9 normalizes division labels before downgrading', () => {
  const division = adjustDivisionForF9('division 1', ['F9'], false);
  assert.equal(division, 'Division II');
});

test('createTeacherInitialsSyncMessage builds a parent-safe payload for print edits', () => {
  const payload = createTeacherInitialsSyncMessage({ '1-2': 'AB' }, 'drais_teacher_initials');

  assert.deepEqual(payload, {
    type: 'teacher-initials-updated',
    values: { '1-2': 'AB' },
    storageKey: 'drais_teacher_initials',
  });
});
