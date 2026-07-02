import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRole,
  orderTeachers,
  initialsFor,
  composeReportInitials,
  primariesToDemote,
  classifyWarnings,
  ALLOCATION_ROLES,
} from '../allocation-logic.ts';

const row = (o) => ({
  id: 1, class_id: 10, subject_id: 20, teacher_id: 100,
  allocation_role: 'assistant_teacher', custom_initials: null,
  auto_initials: null, teacher_name: null, display_on_report: 1, ...o,
});

// ── normalizeRole ────────────────────────────────────────────────────────────
test('normalizeRole: known role passes through', () => {
  for (const r of ALLOCATION_ROLES) assert.equal(normalizeRole(r), r);
});
test('normalizeRole: unknown/blank/undefined → assistant_teacher', () => {
  assert.equal(normalizeRole('captain'), 'assistant_teacher');
  assert.equal(normalizeRole(''), 'assistant_teacher');
  assert.equal(normalizeRole(undefined), 'assistant_teacher');
  assert.equal(normalizeRole(null), 'assistant_teacher');
});

// ── orderTeachers ────────────────────────────────────────────────────────────
test('orderTeachers: primary first, then id ascending', () => {
  const rows = [
    { id: 5, allocation_role: 'assistant_teacher' },
    { id: 2, allocation_role: 'primary_teacher' },
    { id: 8, allocation_role: 'examiner' },
    { id: 1, allocation_role: 'assistant_teacher' },
  ];
  assert.deepEqual(orderTeachers(rows).map((r) => r.id), [2, 1, 5, 8]);
});
test('orderTeachers: does not mutate input', () => {
  const rows = [{ id: 2, allocation_role: 'assistant_teacher' }, { id: 1, allocation_role: 'primary_teacher' }];
  orderTeachers(rows);
  assert.equal(rows[0].id, 2);
});

// ── initialsFor ──────────────────────────────────────────────────────────────
test('initialsFor: custom override wins over auto', () => {
  assert.equal(initialsFor(row({ custom_initials: 'Z.Z', auto_initials: 'A.N' })), 'Z.Z');
});
test('initialsFor: falls back to auto when no custom', () => {
  assert.equal(initialsFor(row({ custom_initials: '  ', auto_initials: 'A.N' })), 'A.N');
});
test('initialsFor: empty when neither present', () => {
  assert.equal(initialsFor(row({ custom_initials: null, auto_initials: null })), '');
});

// ── composeReportInitials ────────────────────────────────────────────────────
test('composeReportInitials: primary first, joined with " / "', () => {
  const rows = [
    row({ id: 2, allocation_role: 'assistant_teacher', auto_initials: 'S.K' }),
    row({ id: 1, allocation_role: 'primary_teacher', auto_initials: 'A.N' }),
  ];
  assert.equal(composeReportInitials(rows), 'A.N / S.K');
});
test('composeReportInitials: hidden teachers excluded', () => {
  const rows = [
    row({ id: 1, allocation_role: 'primary_teacher', auto_initials: 'A.N' }),
    row({ id: 2, allocation_role: 'assistant_teacher', auto_initials: 'S.K' }),
    row({ id: 3, allocation_role: 'substitute', auto_initials: 'X.Z', display_on_report: 0 }),
  ];
  assert.equal(composeReportInitials(rows), 'A.N / S.K');
});
test('composeReportInitials: rows with no initials are skipped', () => {
  const rows = [
    row({ id: 1, allocation_role: 'primary_teacher', auto_initials: 'A.N' }),
    row({ id: 2, allocation_role: 'assistant_teacher', auto_initials: null, custom_initials: null }),
  ];
  assert.equal(composeReportInitials(rows), 'A.N');
});
test('composeReportInitials: custom separator honoured', () => {
  const rows = [
    row({ id: 1, allocation_role: 'primary_teacher', auto_initials: 'A.N' }),
    row({ id: 2, allocation_role: 'assistant_teacher', auto_initials: 'S.K' }),
  ];
  assert.equal(composeReportInitials(rows, ', '), 'A.N, S.K');
});
test('composeReportInitials: empty when nothing renderable', () => {
  assert.equal(composeReportInitials([]), '');
  assert.equal(composeReportInitials([row({ auto_initials: null, display_on_report: 0 })]), '');
});
test('composeReportInitials: missing display_on_report treated as shown', () => {
  const rows = [row({ id: 1, allocation_role: 'primary_teacher', auto_initials: 'A.N', display_on_report: undefined })];
  assert.equal(composeReportInitials(rows), 'A.N');
});

// ── primariesToDemote ────────────────────────────────────────────────────────
test('primariesToDemote: demotes other primaries, keeps the target', () => {
  const rows = [
    row({ id: 1, allocation_role: 'primary_teacher' }),
    row({ id: 2, allocation_role: 'primary_teacher' }),
    row({ id: 3, allocation_role: 'assistant_teacher' }),
  ];
  assert.deepEqual(primariesToDemote(rows, 2), [1]);
});
test('primariesToDemote: keepId null → all primaries returned', () => {
  const rows = [
    row({ id: 1, allocation_role: 'primary_teacher' }),
    row({ id: 2, allocation_role: 'primary_teacher' }),
  ];
  assert.deepEqual(primariesToDemote(rows, null), [1, 2]);
});
test('primariesToDemote: none when target is the only primary', () => {
  const rows = [row({ id: 1, allocation_role: 'primary_teacher' }), row({ id: 2, allocation_role: 'assistant_teacher' })];
  assert.deepEqual(primariesToDemote(rows, 1), []);
});

// ── classifyWarnings ─────────────────────────────────────────────────────────
test('classifyWarnings: no primary flagged with teacher count', () => {
  const rows = [
    row({ id: 1, class_id: 10, subject_id: 20, allocation_role: 'assistant_teacher', teacher_name: 'Jo', auto_initials: 'J.O' }),
    row({ id: 2, class_id: 10, subject_id: 20, allocation_role: 'assistant_teacher', teacher_name: 'Mo', auto_initials: 'M.O' }),
  ];
  const w = classifyWarnings(rows);
  assert.equal(w.no_primary.length, 1);
  assert.deepEqual(w.no_primary[0], { class_id: 10, subject_id: 20, teachers: 2 });
  assert.equal(w.multiple_primary.length, 0);
});
test('classifyWarnings: multiple primaries flagged with count', () => {
  const rows = [
    row({ id: 1, class_id: 10, subject_id: 20, allocation_role: 'primary_teacher', teacher_name: 'Jo', auto_initials: 'J.O' }),
    row({ id: 2, class_id: 10, subject_id: 20, allocation_role: 'primary_teacher', teacher_name: 'Mo', auto_initials: 'M.O' }),
  ];
  const w = classifyWarnings(rows);
  assert.equal(w.multiple_primary.length, 1);
  assert.equal(w.multiple_primary[0].count, 2);
  assert.equal(w.no_primary.length, 0);
});
test('classifyWarnings: missing initials flagged once per subject', () => {
  const rows = [
    row({ id: 1, class_id: 10, subject_id: 20, allocation_role: 'primary_teacher', teacher_name: '', auto_initials: null, custom_initials: null }),
    row({ id: 2, class_id: 10, subject_id: 20, allocation_role: 'assistant_teacher', teacher_name: '', auto_initials: null, custom_initials: null }),
  ];
  const w = classifyWarnings(rows);
  assert.equal(w.missing_initials.length, 1);
  assert.deepEqual(w.missing_initials[0], { class_id: 10, subject_id: 20 });
});
test('classifyWarnings: hidden row with no initials is NOT flagged (not on report)', () => {
  const rows = [
    row({ id: 1, class_id: 10, subject_id: 20, allocation_role: 'primary_teacher', teacher_name: 'Jo', auto_initials: 'J.O' }),
    row({ id: 2, class_id: 10, subject_id: 20, allocation_role: 'substitute', teacher_name: '', auto_initials: null, display_on_report: 0 }),
  ];
  const w = classifyWarnings(rows);
  assert.equal(w.missing_initials.length, 0);
});
test('classifyWarnings: healthy subject produces no warnings', () => {
  const rows = [
    row({ id: 1, class_id: 10, subject_id: 20, allocation_role: 'primary_teacher', teacher_name: 'Jo', auto_initials: 'J.O' }),
    row({ id: 2, class_id: 10, subject_id: 20, allocation_role: 'assistant_teacher', teacher_name: 'Mo', auto_initials: 'M.O' }),
  ];
  const w = classifyWarnings(rows);
  assert.equal(w.no_primary.length + w.multiple_primary.length + w.missing_initials.length, 0);
});
test('classifyWarnings: groups independently per (class,subject)', () => {
  const rows = [
    // class 10/subj 20 → no primary
    row({ id: 1, class_id: 10, subject_id: 20, allocation_role: 'assistant_teacher', teacher_name: 'Jo', auto_initials: 'J.O' }),
    // class 11/subj 20 → two primaries
    row({ id: 2, class_id: 11, subject_id: 20, allocation_role: 'primary_teacher', teacher_name: 'A', auto_initials: 'A.A' }),
    row({ id: 3, class_id: 11, subject_id: 20, allocation_role: 'primary_teacher', teacher_name: 'B', auto_initials: 'B.B' }),
  ];
  const w = classifyWarnings(rows);
  assert.equal(w.no_primary.length, 1);
  assert.equal(w.no_primary[0].class_id, 10);
  assert.equal(w.multiple_primary.length, 1);
  assert.equal(w.multiple_primary[0].class_id, 11);
});
