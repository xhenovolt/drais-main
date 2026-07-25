// Person merge — pure name normalization + duplicate grouping (Phase B).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, groupDuplicates } from '@/lib/biometric/person-merge';

describe('normalizeName', () => {
  it('is case/space/punctuation insensitive', () => {
    assert.equal(normalizeName('Mulema', null, 'Paul'), 'MULEMA PAUL');
    assert.equal(normalizeName('  mulema ', '', ' paul.'), 'MULEMA PAUL');
    assert.equal(normalizeName('MULEMA', null, 'PAUL'), normalizeName('mulema', null, 'paul'));
  });
  it('includes the middle name', () => {
    assert.equal(normalizeName('John', 'K', 'Doe'), 'JOHN K DOE');
  });
  it('empty → empty', () => {
    assert.equal(normalizeName(null, null, null), '');
  });
});

describe('groupDuplicates', () => {
  const P = (id, f, l, role = 'staff', ref = id) => ({ person_id: id, first_name: f, last_name: l, role, ref_id: ref });

  it('groups same-name people, ignores singletons', () => {
    const g = groupDuplicates([
      P(1, 'Mulema', 'Paul'), P(2, 'Mulema', 'Paul'),
      P(3, 'Jane', 'Doe'),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].name, 'MULEMA PAUL');
    assert.equal(g[0].members.length, 2);
  });

  it('matches across spelling/case/punctuation', () => {
    const g = groupDuplicates([P(1, 'mulema', 'paul.'), P(2, 'MULEMA', 'PAUL')]);
    assert.equal(g.length, 1);
  });

  it('three copies → one group of three', () => {
    const g = groupDuplicates([P(1, 'A', 'B'), P(2, 'A', 'B'), P(3, 'A', 'B')]);
    assert.equal(g[0].members.length, 3);
  });

  it('blank names are skipped', () => {
    const g = groupDuplicates([{ person_id: 1, role: 'none', ref_id: null }, { person_id: 2, role: 'none', ref_id: null }]);
    assert.deepEqual(g, []);
  });

  it('preserves each member role/ref', () => {
    const g = groupDuplicates([P(1, 'A', 'B', 'staff', 500), P(2, 'A', 'B', 'student', 900)]);
    const roles = g[0].members.map(m => m.role).sort();
    assert.deepEqual(roles, ['staff', 'student']);
  });
});
