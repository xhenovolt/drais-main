// Identity reconciliation matching engine — every scenario from the
// mission brief, plus the protections. Pure module, no DB.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeName, levenshtein, tokenSimilarity, scoreNameMatch, tierFor,
  matchDeviceUsers,
} from '@/lib/biometric/identity/matching.ts';

describe('normalization', () => {
  it('kills case, accents and punctuation', () => {
    assert.equal(normalizeName('  Jóhn   döe-Smith '), 'JOHN DOE SMITH');
  });
});

describe('tokenSimilarity', () => {
  it('exact and case-free', () => assert.equal(tokenSimilarity('KATO', 'KATO'), 1));
  it('typo tolerance: Muhamadi ~ Muhammadi', () => {
    assert.ok(tokenSimilarity('MUHAMADI', 'MUHAMMADI') >= 0.85);
  });
  it('initial matches full name (weaker)', () => {
    const s = tokenSimilarity('K', 'KATO');
    assert.ok(s > 0.6 && s < 0.85);
  });
  it('different words score zero', () => {
    assert.equal(tokenSimilarity('MOSES', 'AGNES'), 0);
  });
});

describe('scoreNameMatch — mission scenarios', () => {
  it('capitalization: JOHN DOE ≡ John Doe → 100', () => {
    assert.equal(scoreNameMatch('JOHN DOE', 'John Doe'), 100);
  });
  it('reversed: DOE JOHN ≡ John Doe → 100', () => {
    assert.equal(scoreNameMatch('DOE JOHN', 'John Doe'), 100);
  });
  it('missing space: JOHNDOE ~ John Doe → auto tier', () => {
    const s = scoreNameMatch('JOHNDOE', 'John Doe');
    assert.ok(s >= 90, `expected ≥90, got ${s}`);
  });
  it('missing middle name: John Doe vs John David Doe → 94 (auto)', () => {
    assert.equal(scoreNameMatch('JOHN DOE', 'John David Doe'), 94);
  });
  it('missing middle name: Moses Kato vs Moses Ibrahim Kato → auto', () => {
    const s = scoreNameMatch('Moses Kato', 'Moses Ibrahim Kato');
    assert.ok(s >= 90, `expected ≥90, got ${s}`);
  });
  it('typos: Muhamadi Kasule vs Muhammadi Kasule → auto', () => {
    const s = scoreNameMatch('Muhamadi Kasule', 'Muhammadi Kasule');
    assert.ok(s >= 90, `expected ≥90, got ${s}`);
  });
  it('the real JIPRA case: HAUMBA MOSES vs Hamuza Moses Haumba → review', () => {
    const s = scoreNameMatch('HAUMBA MOSES', 'Hamuza Moses Haumba');
    assert.ok(s >= 60 && s < 90, `expected review band, got ${s}`);
  });
  it('unrelated names stay unmatched', () => {
    const s = scoreNameMatch('NAKATO SARAH', 'Okello Vincent');
    assert.ok(s < 60, `expected <60, got ${s}`);
  });
  it('single-token names are weak evidence, never auto', () => {
    const s = scoreNameMatch('MOSES', 'Moses Ibrahim Kato');
    assert.ok(s < 90, `expected <90, got ${s}`);
  });
});

describe('tiers', () => {
  it('boundaries per mission: 90 / 60', () => {
    assert.equal(tierFor(90), 'auto');
    assert.equal(tierFor(89), 'review');
    assert.equal(tierFor(60), 'review');
    assert.equal(tierFor(59), 'unmatched');
  });
});

describe('matchDeviceUsers — protections', () => {
  const staff = (id, name, position = null) => ({ refId: id, roleType: 'staff', personId: id, name, position });

  it('produces best + alternatives, tiered', () => {
    const out = matchDeviceUsers(
      [{ pin: '24', name: 'HAUMBA MOSES' }],
      [staff(1, 'Hamuza Moses Haumba'), staff(2, 'Sarah Nakato')],
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].best.refId, 1);
    assert.equal(out[0].tier, 'review');
  });

  it('never auto-maps two device users to one person (contested → review)', () => {
    const out = matchDeviceUsers(
      [
        { pin: '1', name: 'JOHN DOE' },
        { pin: '2', name: 'John Doe' },
      ],
      [staff(7, 'John Doe')],
    );
    assert.equal(out[0].tier, 'review');
    assert.equal(out[1].tier, 'review');
    assert.ok(out[0].contested && out[1].contested);
  });

  it('no candidates → unmatched', () => {
    const out = matchDeviceUsers([{ pin: '9', name: 'ZZZ QQQ' }], [staff(1, 'John Doe')]);
    assert.equal(out[0].tier, 'unmatched');
    assert.equal(out[0].best, null);
  });
});
