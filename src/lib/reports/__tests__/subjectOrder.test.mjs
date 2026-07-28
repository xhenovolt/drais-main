// Configurable subject ordering — Reporting Architecture Phase 1.
// Run with: npx tsx --test src/lib/reports/__tests__/subjectOrder.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orderSubjects, resolvePriorityMap } from '../subjectOrder.ts';

const subjects = [
  { id: 4, name: 'Chemistry' },
  { id: 5, name: 'Geography' },
  { id: 3, name: 'Physics' },
  { id: 1, name: 'Mathematics' },
  { id: 2, name: 'English' },
  { id: 9, name: 'Art' },       // unconfigured
  { id: 8, name: 'Zoology' },   // unconfigured
];

const mathEng = [
  { id: 1, name: 'Mathematics' },
  { id: 2, name: 'English' },
];

describe('orderSubjects — no rules configured', () => {
  it('falls back to alphabetical, never raw id order', () => {
    const out = orderSubjects(subjects, [], null, null);
    assert.deepEqual(out.map(s => s.name), ['Art', 'Chemistry', 'English', 'Geography', 'Mathematics', 'Physics', 'Zoology']);
  });
});

describe('orderSubjects — school-wide default (brief\'s worked example)', () => {
  const rules = [
    { subjectId: 1, classId: null, resultTypeId: null, priority: 1 }, // Mathematics
    { subjectId: 2, classId: null, resultTypeId: null, priority: 2 }, // English
    { subjectId: 3, classId: null, resultTypeId: null, priority: 3 }, // Physics
    { subjectId: 4, classId: null, resultTypeId: null, priority: 4 }, // Chemistry
    { subjectId: 5, classId: null, resultTypeId: null, priority: 5 }, // Geography
  ];

  it('orders configured subjects by priority, unconfigured ones after, alphabetically', () => {
    const out = orderSubjects(subjects, rules, null, null);
    assert.deepEqual(out.map(s => s.name), ['Mathematics', 'English', 'Physics', 'Chemistry', 'Geography', 'Art', 'Zoology']);
  });
});

describe('orderSubjects — class-specific override wins over school default', () => {
  const rules = [
    { subjectId: 1, classId: null, resultTypeId: null, priority: 1 }, // school default: Maths first
    { subjectId: 2, classId: null, resultTypeId: null, priority: 2 }, // English second
    { subjectId: 2, classId: 100, resultTypeId: null, priority: 1 },  // but for class 100, English first
    { subjectId: 1, classId: 100, resultTypeId: null, priority: 2 },  // and Maths second
  ];

  it('uses the class-specific order for that class', () => {
    const out = orderSubjects(mathEng, rules, 100, null);
    assert.deepEqual(out.map(s => s.name), ['English', 'Mathematics']);
  });

  it('uses the school default for a class with no override', () => {
    const out = orderSubjects(mathEng, rules, 200, null);
    assert.deepEqual(out.map(s => s.name), ['Mathematics', 'English']);
  });
});

describe('orderSubjects — exam/result-type-specific override', () => {
  const rules = [
    { subjectId: 1, classId: null, resultTypeId: null, priority: 1 },   // default: Maths first
    { subjectId: 2, classId: null, resultTypeId: null, priority: 2 },   // default: English second
    { subjectId: 2, classId: null, resultTypeId: 400004, priority: 1 }, // MID TERM: English first
    { subjectId: 1, classId: null, resultTypeId: 400004, priority: 2 }, // MID TERM: Maths second
  ];

  it('uses the exam-specific order for that result type', () => {
    const out = orderSubjects(mathEng, rules, null, 400004);
    assert.deepEqual(out.map(s => s.name), ['English', 'Mathematics']);
  });

  it('falls back to school default for a different result type', () => {
    const out = orderSubjects(mathEng, rules, null, 1);
    assert.deepEqual(out.map(s => s.name), ['Mathematics', 'English']);
  });
});

describe('orderSubjects — combined class+exam is most specific', () => {
  const rules = [
    { subjectId: 1, classId: null, resultTypeId: null, priority: 1 },       // default: Maths first
    { subjectId: 2, classId: null, resultTypeId: null, priority: 2 },       // default: English second
    { subjectId: 2, classId: 100, resultTypeId: null, priority: 1 },        // class 100 default: English first
    { subjectId: 1, classId: 100, resultTypeId: null, priority: 2 },
    { subjectId: 1, classId: 100, resultTypeId: 400004, priority: 1 },      // class 100 + MID TERM: Maths first (most specific)
    { subjectId: 2, classId: 100, resultTypeId: 400004, priority: 2 },
  ];

  it('the most specific (class+exam) rule wins over the class-only rule', () => {
    const out = orderSubjects(mathEng, rules, 100, 400004);
    assert.deepEqual(out.map(s => s.name), ['Mathematics', 'English']);
  });

  it('falls back to class-only when the exam does not match', () => {
    const out = orderSubjects(mathEng, rules, 100, 999);
    assert.deepEqual(out.map(s => s.name), ['English', 'Mathematics']);
  });
});

describe('resolvePriorityMap', () => {
  it('returns only subjects with an applicable rule', () => {
    const rules = [{ subjectId: 1, classId: null, resultTypeId: null, priority: 5 }];
    const map = resolvePriorityMap(rules, null, null);
    assert.equal(map.get(1), 5);
    assert.equal(map.get(2), undefined);
  });
});
