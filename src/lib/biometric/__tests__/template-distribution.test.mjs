// Template distribution — the ADMS FINGERTMP push command (pure), Part 6.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFingerTmpCommand } from '@/lib/biometric/template-distribution';

describe('buildFingerTmpCommand', () => {
  it('is the exact inverse of the TEMPLATEV10 fields the device sent', () => {
    const cmd = buildFingerTmpCommand({ pin: 79, fingerIndex: 6, size: 916, templateBase64: 'S+1TUzIxAAAC' });
    assert.equal(cmd, 'DATA UPDATE FINGERTMP PIN=79\tFID=6\tSize=916\tValid=1\tTMP=S+1TUzIxAAAC');
  });

  it('defaults Valid=1 but honours an explicit valid flag', () => {
    assert.match(buildFingerTmpCommand({ pin: 1, fingerIndex: 0, size: 10, templateBase64: 'x' }), /Valid=1/);
    assert.match(buildFingerTmpCommand({ pin: 1, fingerIndex: 0, size: 10, valid: 0, templateBase64: 'x' }), /Valid=0/);
  });

  it('tab-delimits fields (ADMS wire format) and preserves base64 verbatim', () => {
    const b64 = 'TUdTUzIxAAAEBAYECAUHCc7Q+/=';
    const cmd = buildFingerTmpCommand({ pin: 123, fingerIndex: 5, size: 1372, templateBase64: b64 });
    const parts = cmd.replace('DATA UPDATE FINGERTMP ', '').split('\t');
    assert.equal(parts[0], 'PIN=123');
    assert.equal(parts[1], 'FID=5');
    assert.equal(parts[4], `TMP=${b64}`); // base64 untouched — no re-encoding
  });

  it('starts with the DATA UPDATE FINGERTMP verb the device expects', () => {
    assert.ok(buildFingerTmpCommand({ pin: 9, fingerIndex: 1, size: 5, templateBase64: 'a' }).startsWith('DATA UPDATE FINGERTMP '));
  });
});
