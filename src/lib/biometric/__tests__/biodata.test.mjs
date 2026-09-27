// Classifying one uploaded BIODATA/TEMPLATEV10/FP record — the fix for a face template being stored as
// a fingerprint, and for a second finger landing in the same slot as the first.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBioRecord } from '@/lib/biometric/biodata.ts';

describe('classifyBioRecord', () => {
  it('a TEMPLATEV10/FP-style record (no TYPE) is a fingerprint, finger slot from FID', () => {
    const r = classifyBioRecord({ PIN: '12', FID: '6', SIZE: '512', VALID: '1', TMP: 'QUJD' });
    assert.equal(r.kind, 'finger');
    assert.equal(r.fingerIndex, 6);
    assert.equal(r.pin, '12');
    assert.equal(r.template, 'QUJD');
  });

  it('BIODATA TYPE=1 is a fingerprint, finger slot from NO (not INDEX, which is the template instance)', () => {
    const r = classifyBioRecord({ PIN: '12', TYPE: '1', NO: '3', INDEX: '0', TMP: 'QUJD' });
    assert.equal(r.kind, 'finger');
    assert.equal(r.fingerIndex, 3);
  });

  it('BIODATA TYPE=2 and TYPE=9 are faces, never stored as a fingerprint', () => {
    assert.equal(classifyBioRecord({ PIN: '12', TYPE: '2', TMP: 'QUJD' }).kind, 'face');
    assert.equal(classifyBioRecord({ PIN: '12', TYPE: '9', TMP: 'QUJD' }).kind, 'face');
  });

  it('an unsupported TYPE (palm, iris, voice, …) is neither a finger nor a face', () => {
    for (const type of ['3', '4', '7', '8']) {
      assert.equal(classifyBioRecord({ PIN: '1', TYPE: type, TMP: 'x' }).kind, 'other');
    }
  });

  it('a second finger from the same person gets a DIFFERENT slot than the first — the bug this fixes', () => {
    const first = classifyBioRecord({ PIN: '12', FID: '6', TMP: 'AAA' });
    const second = classifyBioRecord({ PIN: '12', FID: '3', TMP: 'BBB' });
    assert.notEqual(first.fingerIndex, second.fingerIndex);
  });

  it('an out-of-range or missing finger slot falls back to 0 rather than throwing', () => {
    assert.equal(classifyBioRecord({ PIN: '1', FID: '99', TMP: 'x' }).fingerIndex, 0);
    assert.equal(classifyBioRecord({ PIN: '1', TMP: 'x' }).fingerIndex, 0);
  });

  it('estimates size from the base64 template when SIZE is absent', () => {
    const tmp = 'A'.repeat(100); // ~75 bytes
    const r = classifyBioRecord({ PIN: '1', TMP: tmp });
    assert.equal(r.size, Math.floor((tmp.length * 3) / 4));
  });

  it('an explicit SIZE is trusted over the base64 estimate', () => {
    const r = classifyBioRecord({ PIN: '1', SIZE: '512', TMP: 'A'.repeat(1000) });
    assert.equal(r.size, 512);
  });
});
