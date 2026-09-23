// Gender-based attendance filtering (DRAIS Phase 5) — pure normalization
// logic. people.gender is free text with dirty production data ('male',
// 'Male', 'M' all mean the same thing); these tests lock in that every
// known variant matches and nothing is silently guessed for missing data.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { genderMatchSql, genderMatchAnySql, normalizeGender, isGenderFilter } from '@/lib/attendance/gender';

describe('normalizeGender', () => {
  it('recognizes every known variant of male', () => {
    for (const v of ['male', 'Male', 'MALE', 'm', 'M', '  Male  ']) {
      assert.equal(normalizeGender(v), 'male', `expected "${v}" to normalize to male`);
    }
  });

  it('recognizes every known variant of female', () => {
    for (const v of ['female', 'Female', 'FEMALE', 'f', 'F', '  female ']) {
      assert.equal(normalizeGender(v), 'female', `expected "${v}" to normalize to female`);
    }
  });

  it('never guesses — null, empty, and unrecognized values normalize to null', () => {
    assert.equal(normalizeGender(null), null);
    assert.equal(normalizeGender(undefined), null);
    assert.equal(normalizeGender(''), null);
    assert.equal(normalizeGender('   '), null);
    assert.equal(normalizeGender('other'), null);
    assert.equal(normalizeGender('not_specified'), null);
  });
});

describe('isGenderFilter', () => {
  it('accepts only the two canonical values', () => {
    assert.equal(isGenderFilter('male'), true);
    assert.equal(isGenderFilter('female'), true);
    assert.equal(isGenderFilter('Male'), false); // callers must normalize first
    assert.equal(isGenderFilter('m'), false);
    assert.equal(isGenderFilter(null), false);
    assert.equal(isGenderFilter(''), false);
    assert.equal(isGenderFilter(undefined), false);
  });
});

describe('genderMatchSql', () => {
  it('builds a case-insensitive IN clause covering both known variants', () => {
    const male = genderMatchSql('p.gender', 'male');
    assert.equal(male.sql, "LOWER(TRIM(p.gender)) IN (?,?)");
    assert.deepEqual(male.params.sort(), ['m', 'male']);

    const female = genderMatchSql('p.gender', 'female');
    assert.deepEqual(female.params.sort(), ['f', 'female']);
  });

  it('never includes a bare NULL/blank match — LOWER(TRIM(NULL)) IN (...) is never true', () => {
    // Documents the invariant genderMatchSql relies on rather than testing
    // the DB directly: TRIM(NULL) is NULL, and NULL IN (...) is never TRUE,
    // so unspecified gender is excluded from either filter, not guessed.
    const { sql } = genderMatchSql('p.gender', 'male');
    assert.match(sql, /^LOWER\(TRIM\(.+\)\) IN \(/);
  });
});

describe('genderMatchAnySql', () => {
  it('ORs variants together for a multi-value filter', () => {
    const both = genderMatchAnySql('p.gender', ['male', 'female']);
    assert.deepEqual(both.params.sort(), ['f', 'female', 'm', 'male']);
  });

  it('an empty value list matches nothing (not everything)', () => {
    const none = genderMatchAnySql('p.gender', []);
    assert.equal(none.sql, '1=0');
    assert.deepEqual(none.params, []);
  });
});
