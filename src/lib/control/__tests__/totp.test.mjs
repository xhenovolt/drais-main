// Control TOTP — pure RFC-6238 (Phase 10).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { base32Encode, base32Decode, generateTotpSecret, totpCode, verifyTotp, otpauthUrl, generateRecoveryCodes, hashRecovery } from '@/lib/control/totp';

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 128, 64]);
    assert.deepEqual([...base32Decode(base32Encode(buf))], [...buf]);
  });
  it('ignores spaces / lowercase on decode', () => {
    const s = base32Encode(Buffer.from('hello'));
    assert.deepEqual([...base32Decode(s.toLowerCase().replace(/(.{4})/g, '$1 '))], [...Buffer.from('hello')]);
  });
});

describe('totpCode / verifyTotp', () => {
  const secret = generateTotpSecret();
  it('produces a 6-digit code, stable within a 30s step', () => {
    const t = 1_700_000_000_000; // fixed
    const a = totpCode(secret, t);
    assert.match(a, /^\d{6}$/);
    assert.equal(totpCode(secret, t + 5_000), a); // same step
  });
  it('verifies the current code', () => {
    const t = 1_700_000_005_000;
    assert.equal(verifyTotp(secret, totpCode(secret, t), t), true);
  });
  it('accepts an adjacent-window code (clock skew)', () => {
    const t = 1_700_000_050_000;
    assert.equal(verifyTotp(secret, totpCode(secret, t - 30_000), t), true);  // previous step
    assert.equal(verifyTotp(secret, totpCode(secret, t + 30_000), t), true);  // next step
  });
  it('rejects a wrong / far code and malformed input', () => {
    const t = 1_700_000_100_000;
    assert.equal(verifyTotp(secret, totpCode(secret, t - 5 * 30_000), t), false);
    assert.equal(verifyTotp(secret, '000', t), false);
    assert.equal(verifyTotp(secret, 'abcdef', t), false);
  });
  it('different secrets give different code sequences', () => {
    // Compare a sequence across several steps — a single-step collision is
    // possible (~1e-6), an all-step collision is not.
    const s1 = generateTotpSecret(), s2 = generateTotpSecret();
    const seq = (s) => [0, 1, 2, 3, 4].map(i => totpCode(s, 1_700_000_000_000 + i * 30_000)).join('');
    assert.notEqual(seq(s1), seq(s2));
  });
});

describe('otpauthUrl + recovery', () => {
  it('builds a scannable otpauth URI', () => {
    const u = otpauthUrl('JBSWY3DPEHPK3PXP', 'ops@xhenvolt.com');
    assert.match(u, /^otpauth:\/\/totp\//);
    assert.match(u, /secret=JBSWY3DPEHPK3PXP/);
    assert.match(u, /period=30/);
  });
  it('recovery codes are unique and hash stably', () => {
    const codes = generateRecoveryCodes(8);
    assert.equal(new Set(codes).size, 8);
    assert.equal(hashRecovery('AB-cd 12'), hashRecovery('abcd12'));
    assert.notEqual(hashRecovery('aaaa'), hashRecovery('bbbb'));
  });
});
