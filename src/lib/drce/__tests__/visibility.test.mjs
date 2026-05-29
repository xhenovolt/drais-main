// node:test suite for the P2 visibility rule evaluator.
// Run with:  npx tsx --test src/lib/drce/__tests__/visibility.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRule } from '../visibility.ts';

// Minimal data context — only fields the rules below touch are populated.
function ctx(student, custom = {}, assessment = {}) {
  return {
    student: { ...student, custom },
    results: [], subjects: [],
    assessment: { classPosition: null, streamPosition: null, aggregates: null,
      division: null, totalStudents: null, ...assessment },
    comments: { classTeacher: '', dos: '', headTeacher: '' },
    meta: { schoolName: '', schoolAddress: '', schoolContact: '', schoolEmail: '',
      centerNo: '', registrationNo: '', term: '', year: '', reportTitle: '',
      nextTermBegins: '' },
    language: 'en',
  };
}

const leaf = (left, op, value) =>
  ({ kind: 'compare', left, op, right: { kind: 'literal', value } });
const group = (op, children, negate) =>
  ({ kind: 'group', op, children, negate });

describe('visibility — null / empty rule', () => {
  it('null rule renders unconditionally', () => {
    assert.equal(evaluateRule(null, ctx({})), true);
    assert.equal(evaluateRule(undefined, ctx({})), true);
  });
  it('empty group renders unconditionally', () => {
    assert.equal(evaluateRule(group('AND', []), ctx({})), true);
    assert.equal(evaluateRule(group('OR',  []), ctx({})), true);
  });
});

describe('visibility — equality', () => {
  it('string == string is case + whitespace tolerant', () => {
    const r = leaf('student.gender', '==', 'female');
    assert.equal(evaluateRule(r, ctx({ gender: 'Female' })), true);
    assert.equal(evaluateRule(r, ctx({ gender: '  female ' })), true);
    assert.equal(evaluateRule(r, ctx({ gender: 'male' })), false);
  });
  it('boolean == boolean coerces via Boolean()', () => {
    const r = leaf('student.custom.is_boarding', '==', true);
    assert.equal(evaluateRule(r, ctx({}, { is_boarding: true })),  true);
    assert.equal(evaluateRule(r, ctx({}, { is_boarding: false })), false);
    // Numbers and non-empty strings are truthy under Boolean coercion.
    assert.equal(evaluateRule(r, ctx({}, { is_boarding: 1 })),     true);
    assert.equal(evaluateRule(r, ctx({}, { is_boarding: 'yes' })), true);
  });
});

describe('visibility — numeric comparisons', () => {
  it('>= reads number from string or number', () => {
    const r = leaf('assessment.classPosition', '<=', 5);
    assert.equal(evaluateRule(r, ctx({}, {}, { classPosition: 3 })),  true);
    assert.equal(evaluateRule(r, ctx({}, {}, { classPosition: 5 })),  true);
    assert.equal(evaluateRule(r, ctx({}, {}, { classPosition: 10 })), false);
  });
  it('null on left side never satisfies a numeric compare', () => {
    const r = leaf('assessment.classPosition', '<=', 5);
    assert.equal(evaluateRule(r, ctx({}, {}, { classPosition: null })), false);
  });
});

describe('visibility — string ops', () => {
  it('contains is case-insensitive substring match', () => {
    const r = leaf('student.className', 'contains', 'senior');
    assert.equal(evaluateRule(r, ctx({ className: 'Senior 6 East' })), true);
    assert.equal(evaluateRule(r, ctx({ className: 'P3' })),            false);
  });
  it('not_contains negates', () => {
    const r = leaf('student.className', 'not_contains', 'senior');
    assert.equal(evaluateRule(r, ctx({ className: 'P3' })), true);
  });
  it('empty / not_empty handle missing custom fields', () => {
    const empty    = leaf('student.custom.bus_route', 'empty');
    const notEmpty = leaf('student.custom.bus_route', 'not_empty');
    assert.equal(evaluateRule(empty,    ctx({}, {})), true);
    assert.equal(evaluateRule(notEmpty, ctx({}, {})), false);
    assert.equal(evaluateRule(notEmpty, ctx({}, { bus_route: 'A' })), true);
  });
});

describe('visibility — in / not_in', () => {
  it('in finds match in list', () => {
    const r = leaf('student.gender', 'in', ['female', 'other']);
    assert.equal(evaluateRule(r, ctx({ gender: 'Female' })), true);
    assert.equal(evaluateRule(r, ctx({ gender: 'male' })),  false);
  });
});

describe('visibility — groups', () => {
  it('AND of two leaves', () => {
    const r = group('AND', [
      leaf('student.gender', '==', 'female'),
      leaf('assessment.classPosition', '<=', 5),
    ]);
    assert.equal(evaluateRule(r, ctx({ gender: 'female' }, {}, { classPosition: 3 })), true);
    assert.equal(evaluateRule(r, ctx({ gender: 'male'   }, {}, { classPosition: 3 })), false);
    assert.equal(evaluateRule(r, ctx({ gender: 'female' }, {}, { classPosition: 9 })), false);
  });
  it('OR matches if any child matches', () => {
    const r = group('OR', [
      leaf('student.gender', '==', 'female'),
      leaf('student.custom.is_boarding', '==', true),
    ]);
    assert.equal(evaluateRule(r, ctx({ gender: 'male' }, { is_boarding: true })), true);
    assert.equal(evaluateRule(r, ctx({ gender: 'male' }, { is_boarding: false })), false);
  });
  it('negate flips group result', () => {
    const r = group('AND', [leaf('student.gender', '==', 'female')], true);
    assert.equal(evaluateRule(r, ctx({ gender: 'female' })), false);
    assert.equal(evaluateRule(r, ctx({ gender: 'male'   })), true);
  });
  it('nested groups: (A AND B) OR C', () => {
    const r = group('OR', [
      group('AND', [
        leaf('student.gender', '==', 'female'),
        leaf('assessment.classPosition', '<=', 5),
      ]),
      leaf('student.custom.is_prefect', '==', true),
    ]);
    assert.equal(evaluateRule(r, ctx({ gender: 'male'   }, { is_prefect: true }, { classPosition: 50 })), true);
    assert.equal(evaluateRule(r, ctx({ gender: 'female' }, {}, { classPosition: 3  })), true);
    assert.equal(evaluateRule(r, ctx({ gender: 'female' }, {}, { classPosition: 50 })), false);
  });
});
