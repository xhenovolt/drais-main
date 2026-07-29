// Template distribution — the ADMS FINGERTMP push command (pure), Part 6.
// Phase 5 (docs/audits/BIOMETRIC_CENTRALIZATION_AUDIT.md) added scoped bulk
// pushes (all/role/selected/modified/diff-only) — describeScope and
// parsePushScope are the pure pieces of that; the DB-touching functions
// (selectTemplatesForPush, syncTemplatesToDevice, previewTemplatePush) are
// exercised indirectly via the API route, not unit-tested here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFingerTmpCommand, describeScope, parsePushScope } from '@/lib/biometric/template-distribution';

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

describe('parsePushScope — validates an untrusted request body', () => {
  it('defaults to "all" when scope is missing/not an object', () => {
    assert.deepEqual(parsePushScope(undefined), { type: 'all' });
    assert.deepEqual(parsePushScope(null), { type: 'all' });
  });

  it('accepts a valid role scope, rejects an invalid role', () => {
    assert.deepEqual(parsePushScope({ type: 'role', role: 'staff' }), { type: 'role', role: 'staff' });
    assert.deepEqual(parsePushScope({ type: 'role', role: 'student' }), { type: 'role', role: 'student' });
    assert.equal(parsePushScope({ type: 'role', role: 'admin' }), null);
  });

  it('coerces and filters a selected-person id list, dropping junk values', () => {
    const scope = parsePushScope({ type: 'selected', personIds: [1, '2', 0, -3, 'x', null, 4.0] });
    assert.deepEqual(scope, { type: 'selected', personIds: [1, 2, 4] });
  });

  it('an empty/missing personIds list still parses (route layer rejects emptiness, not this)', () => {
    assert.deepEqual(parsePushScope({ type: 'selected' }), { type: 'selected', personIds: [] });
  });

  it('requires a non-empty sinceIso string for modified_since', () => {
    assert.deepEqual(parsePushScope({ type: 'modified_since', sinceIso: '2026-01-01T00:00:00Z' }),
      { type: 'modified_since', sinceIso: '2026-01-01T00:00:00Z' });
    assert.equal(parsePushScope({ type: 'modified_since' }), null);
    assert.equal(parsePushScope({ type: 'modified_since', sinceIso: 123 }), null);
  });

  it('diff_only and all round-trip with no extra fields required', () => {
    assert.deepEqual(parsePushScope({ type: 'diff_only' }), { type: 'diff_only' });
    assert.deepEqual(parsePushScope({ type: 'all' }), { type: 'all' });
  });

  it('rejects an unknown scope type', () => {
    assert.equal(parsePushScope({ type: 'fleet_wide_silent' }), null);
  });
});

describe('describeScope — human-readable audit/preview label per scope', () => {
  it('describes every scope kind distinctly', () => {
    assert.equal(describeScope({ type: 'all' }), 'all enrollments');
    assert.equal(describeScope({ type: 'role', role: 'staff' }), 'staff only');
    assert.equal(describeScope({ type: 'role', role: 'student' }), 'student only');
    assert.equal(describeScope({ type: 'selected', personIds: [1, 2, 3] }), '3 selected person(s)');
    assert.match(describeScope({ type: 'modified_since', sinceIso: '2026-01-01T00:00:00Z' }), /modified since/);
    assert.equal(describeScope({ type: 'diff_only' }), 'out-of-sync (diff) only');
  });
});
