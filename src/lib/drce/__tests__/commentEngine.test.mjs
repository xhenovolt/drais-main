// Intelligent Report Comment Engine — Phase II regression tests.
// Run with:  npx tsx --test src/lib/drce/__tests__/commentEngine.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOverallComment, resolveAllOverallComments, matchesCondition } from '../commentEngine.ts';

const leaf = (left, op, value) => ({ kind: 'compare', left, op, right: value === undefined ? undefined : { kind: 'literal', value } });
const group = (op, children, negate) => ({ kind: 'group', op, children, ...(negate ? { negate: true } : {}) });

const ctxFor = (overrides) => ({
  average: 0, total: 0, totalPossible: 100, percentage: 0,
  position: null, totalInClass: null, aggregate: null, division: null, overallGrade: null,
  subjects: [],
  ...overrides,
});

describe('resolveOverallComment — replace rules (banded comments)', () => {
  const rules = [
    { id: 1, role: 'headTeacher', mode: 'replace', priority: 10, isActive: true,
      condition: leaf('average', 'between', [90, 100]), commentText: 'Outstanding performance.' },
    { id: 2, role: 'headTeacher', mode: 'replace', priority: 20, isActive: true,
      condition: leaf('average', 'between', [80, 89]), commentText: 'Very good performance.' },
    { id: 3, role: 'headTeacher', mode: 'replace', priority: 90, isActive: true,
      condition: null, commentText: 'Keep working hard.' }, // fallback
  ];

  it('picks the band matching the average (90-100)', () => {
    const r = resolveOverallComment(rules, 'headTeacher', ctxFor({ average: 95 }));
    assert.equal(r.text, 'Outstanding performance.');
    assert.deepEqual(r.appliedRuleIds, [1]);
  });

  it('picks a different band for a lower average', () => {
    const r = resolveOverallComment(rules, 'headTeacher', ctxFor({ average: 82 }));
    assert.equal(r.text, 'Very good performance.');
  });

  it('two learners with very different performance get DIFFERENT comments', () => {
    const strong = resolveOverallComment(rules, 'headTeacher', ctxFor({ average: 95 })).text;
    const weak   = resolveOverallComment(rules, 'headTeacher', ctxFor({ average: 35 })).text;
    assert.notEqual(strong, weak);
  });

  it('falls back to the null-condition rule when no band matches', () => {
    const r = resolveOverallComment(rules, 'headTeacher', ctxFor({ average: 35 }));
    assert.equal(r.text, 'Keep working hard.');
    assert.deepEqual(r.appliedRuleIds, [3]);
  });

  it('falls back to the caller-supplied text when the school has NO rules at all (zero-config schools unaffected)', () => {
    const r = resolveOverallComment([], 'headTeacher', ctxFor({ average: 95 }), { fallback: 'Promising grades, continue' });
    assert.equal(r.text, 'Promising grades, continue');
  });
});

describe('resolveOverallComment — append rules layer on top of the base', () => {
  const rules = [
    { id: 1, role: 'headTeacher', mode: 'replace', priority: 10, isActive: true,
      condition: leaf('average', 'between', [80, 89]), commentText: 'Very good performance.' },
    { id: 2, role: 'headTeacher', mode: 'append', priority: 10, isActive: true,
      condition: leaf('division', '==', 'I'), commentText: 'Congratulations on attaining Division I.' },
    { id: 3, role: 'headTeacher', mode: 'append', priority: 20, isActive: true,
      condition: leaf('attendancePercent', '<', 80), commentText: 'Regular attendance is necessary to realize your full potential.' },
  ];

  it('appends the Division I congratulation onto the base band comment', () => {
    const r = resolveOverallComment(rules, 'headTeacher', ctxFor({ average: 82, division: 'I' }));
    assert.equal(r.text, 'Very good performance. Congratulations on attaining Division I.');
    assert.deepEqual(r.appliedRuleIds, [1, 2]);
  });

  it('does not append when its own condition fails (division II)', () => {
    const r = resolveOverallComment(rules, 'headTeacher', ctxFor({ average: 82, division: 'II' }));
    assert.equal(r.text, 'Very good performance.');
  });

  it('applies multiple independent appends in priority order', () => {
    const r = resolveOverallComment(rules, 'headTeacher', ctxFor({ average: 82, division: 'I', attendancePercent: 60 }));
    assert.equal(r.text,
      'Very good performance. Congratulations on attaining Division I. Regular attendance is necessary to realize your full potential.');
  });
});

describe('resolveOverallComment — nested AND/OR conditions (aggregate bands, per Phase II spec)', () => {
  const rules = [
    { id: 1, role: 'dos', mode: 'replace', priority: 10, isActive: true,
      condition: leaf('aggregate', 'between', [4, 12]), commentText: 'Excellent aggregate — Division I band.' },
    { id: 2, role: 'dos', mode: 'replace', priority: 20, isActive: true,
      condition: leaf('aggregate', 'between', [13, 24]), commentText: 'Good aggregate — Division II band.' },
    { id: 3, role: 'dos', mode: 'replace', priority: 30, isActive: true,
      condition: group('OR', [leaf('division', '==', 'I'), leaf('division', '==', 'II')]),
      commentText: 'Well done — a strong division.' },
  ];

  it('matches the aggregate 4-12 band', () => {
    assert.equal(resolveOverallComment(rules, 'dos', ctxFor({ aggregate: 8 })).text, 'Excellent aggregate — Division I band.');
  });

  it('matches the aggregate 13-24 band', () => {
    assert.equal(resolveOverallComment(rules, 'dos', ctxFor({ aggregate: 18 })).text, 'Good aggregate — Division II band.');
  });

  it('nested OR group matches either branch', () => {
    const r = resolveOverallComment([rules[2]], 'dos', ctxFor({ division: 'II' }));
    assert.equal(r.text, 'Well done — a strong division.');
  });
});

describe('resolveOverallComment — priority ordering and inactive rules', () => {
  it('lower priority number wins among multiple matching replace rules', () => {
    const rules = [
      { id: 1, role: 'classTeacher', mode: 'replace', priority: 50, isActive: true, condition: leaf('average', '>=', 50), commentText: 'A' },
      { id: 2, role: 'classTeacher', mode: 'replace', priority: 5,  isActive: true, condition: leaf('average', '>=', 50), commentText: 'B (more specific, lower priority)' },
    ];
    const r = resolveOverallComment(rules, 'classTeacher', ctxFor({ average: 70 }));
    assert.equal(r.text, 'B (more specific, lower priority)');
  });

  it('an inactive rule never matches, even if its condition is true', () => {
    const rules = [
      { id: 1, role: 'classTeacher', mode: 'replace', priority: 10, isActive: false, condition: leaf('average', '>=', 0), commentText: 'Should never appear' },
    ];
    assert.equal(matchesCondition(rules[0], ctxFor({ average: 90 })), false);
    assert.equal(resolveOverallComment(rules, 'classTeacher', ctxFor({ average: 90 }), { fallback: 'default' }).text, 'default');
  });
});

describe('resolveOverallComment — Arabic text selection', () => {
  it('uses commentTextAr when language is ar and it is set', () => {
    const rules = [
      { id: 1, role: 'headTeacher', mode: 'replace', priority: 10, isActive: true,
        condition: null, commentText: 'Outstanding.', commentTextAr: 'أداء ممتاز' },
    ];
    assert.equal(resolveOverallComment(rules, 'headTeacher', ctxFor({}), { language: 'ar' }).text, 'أداء ممتاز');
    assert.equal(resolveOverallComment(rules, 'headTeacher', ctxFor({}), { language: 'en' }).text, 'Outstanding.');
  });
});

describe('resolveOverallComment — custom roles', () => {
  it('scopes custom rules by customKey so two custom roles do not collide', () => {
    const rules = [
      { id: 1, role: 'custom', customKey: 'registrar', mode: 'replace', priority: 10, isActive: true, condition: null, commentText: 'Registrar note' },
      { id: 2, role: 'custom', customKey: 'bursar',    mode: 'replace', priority: 10, isActive: true, condition: null, commentText: 'Bursar note' },
    ];
    assert.equal(resolveOverallComment(rules, 'custom', ctxFor({}), { customKey: 'registrar' }).text, 'Registrar note');
    assert.equal(resolveOverallComment(rules, 'custom', ctxFor({}), { customKey: 'bursar' }).text, 'Bursar note');
  });
});

describe('resolveAllOverallComments', () => {
  it('resolves all three built-in roles independently', () => {
    const rules = [
      { id: 1, role: 'headTeacher', mode: 'replace', priority: 10, isActive: true, condition: leaf('average', '>=', 80), commentText: 'HT: excellent' },
      { id: 2, role: 'dos',         mode: 'replace', priority: 10, isActive: true, condition: leaf('average', '>=', 80), commentText: 'DOS: excellent' },
    ];
    const out = resolveAllOverallComments(rules, ctxFor({ average: 90 }), { classTeacher: 'ct-fallback', dos: 'dos-fallback', headTeacher: 'ht-fallback' });
    assert.equal(out.headTeacher, 'HT: excellent');
    assert.equal(out.dos, 'DOS: excellent');
    assert.equal(out.classTeacher, 'ct-fallback'); // no rule configured for this role -> fallback
  });
});
