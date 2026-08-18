// node:test suite — fees pipeline pure logic (import redesign Phase C).
// Run with: npx tsx --test src/lib/ingestion/__tests__/fees-schema.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FEE_FIELDS, validateFeeRow, feeIdentityFromRow } from '../pipelines/fees-schema.ts';
import { guessSheetPurpose } from '../parse/purpose-guess.ts';

describe('validateFeeRow', () => {
  it('accepts a clean row', () => {
    const r = validateFeeRow({ admission_no: 'XHN/001', amount: '150,000', method: 'Mobile Money', date: '20/01/2026', term: 'Term 1' }, { sourceRowIndex: 1, sourceFile: 'f' });
    assert.equal(r.ok, true);
    assert.equal(r.value.amount, 150000);
    assert.equal(r.value.date, '2026-01-20');
  });

  it('rejects a missing admission_no', () => {
    const r = validateFeeRow({ amount: 1000 }, { sourceRowIndex: 1, sourceFile: 'f' });
    assert.equal(r.ok, false);
    assert.match(r.error, /admission_no/);
  });

  it('rejects a missing or non-numeric amount', () => {
    const r1 = validateFeeRow({ admission_no: 'XHN/001', amount: 'not a number' }, { sourceRowIndex: 1, sourceFile: 'f' });
    assert.equal(r1.ok, false);
    const r2 = validateFeeRow({ admission_no: 'XHN/001' }, { sourceRowIndex: 1, sourceFile: 'f' });
    assert.equal(r2.ok, false);
  });

  it('rejects a zero or negative amount — a payment of 0 or less is not a real payment', () => {
    const r1 = validateFeeRow({ admission_no: 'XHN/001', amount: 0 }, { sourceRowIndex: 1, sourceFile: 'f' });
    assert.equal(r1.ok, false);
    const r2 = validateFeeRow({ admission_no: 'XHN/001', amount: -500 }, { sourceRowIndex: 1, sourceFile: 'f' });
    assert.equal(r2.ok, false);
  });
});

describe('feeIdentityFromRow', () => {
  it('never includes a name — admission_no only, per the brief\'s "no fuzzy matching for money" rule', () => {
    const claim = feeIdentityFromRow({ admission_no: 'XHN/001', amount: 100, method: null, date: null, term: null, reference: null, payer_name: 'John Kato Sr.' });
    assert.equal(claim.admissionNo, 'XHN/001');
    assert.equal(claim.firstName, undefined);
    assert.equal(claim.lastName, undefined);
  });
});

describe('FEE_FIELDS feeds purpose-guessing correctly', () => {
  it('a real fee-history export is recognized as fees, not students', () => {
    const g = guessSheetPurpose(['Admission No', 'Amount Paid', 'Payment Method', 'Payment Date', 'Term']);
    assert.equal(g.purpose, 'fees');
  });
});
