// Phase 5 tests. docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md's stated
// completion criteria for this phase, verified directly: a .drs file can
// be produced, its header read without the key, its payload decrypted
// and verified with the key, and a deliberately-corrupted file is
// rejected with a SPECIFIC error — never a crash, never a silent partial
// read.
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  writeDrsFile, readDrsHeader, openDrsFile,
  DrsFormatError, DrsIntegrityError, DrsDecryptError, DrsVersionError,
} from '@/lib/container';

const tmpPaths = [];
function tmpDrsPath(name) {
  const p = path.join(os.tmpdir(), `drais-container-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.drs`);
  tmpPaths.push(p);
  return p;
}

after(() => {
  for (const p of tmpPaths) { try { fs.unlinkSync(p); } catch { /* best effort */ } }
});

const BASE_META = {
  schoolId: 8002,
  schoolExternalId: 'JIPRA',
  installationId: 'test-install-001',
  drAisAppVersionMin: '2.1.0',
  schemaMigrationHead: '044_backup_center',
};

describe('.drs container (Phase 5)', () => {
  it('round-trips a payload exactly: write -> open -> identical bytes', async () => {
    const payload = Buffer.from('SQLite file bytes go here, pretend this is a real db file'.repeat(50));
    const outPath = tmpDrsPath('roundtrip');
    const written = await writeDrsFile({ payload, passphrase: 'correct horse battery staple', outPath, meta: BASE_META });
    assert.equal(written.path, outPath);
    assert.ok(fs.existsSync(outPath));

    const opened = await openDrsFile(outPath, 'correct horse battery staple');
    assert.ok(opened.payload.equals(payload), 'decrypted payload must be byte-identical to the original');
    assert.equal(opened.header.schoolId, 8002);
    assert.equal(opened.header.engine, 'sqlite');
    assert.equal(opened.header.compression, 'gzip');
  });

  it('atomic write leaves no .tmp-* file behind on success', async () => {
    const payload = Buffer.from('atomic write check');
    const outPath = tmpDrsPath('atomic');
    await writeDrsFile({ payload, passphrase: 'pw', outPath, meta: BASE_META });
    const dir = path.dirname(outPath);
    const base = path.basename(outPath);
    const leftovers = fs.readdirSync(dir).filter((f) => f.startsWith(`${base}.tmp-`));
    assert.deepEqual(leftovers, []);
  });

  it('readDrsHeader needs no passphrase at all', async () => {
    const payload = Buffer.from('header without key');
    const outPath = tmpDrsPath('header-only');
    await writeDrsFile({ payload, passphrase: 'secret', outPath, meta: BASE_META });

    const header = await readDrsHeader(outPath); // no passphrase argument exists on this function
    assert.equal(header.schoolId, 8002);
    assert.equal(header.schoolExternalId, 'JIPRA');
    assert.ok(header.kdf.salt, 'salt must be present in the plaintext header — it is meant to be public');
    assert.equal(header.cipher, 'aes-256-gcm');
  });

  it('wrong passphrase fails cleanly with DrsDecryptError, never returns garbage', async () => {
    const payload = Buffer.from('protect me');
    const outPath = tmpDrsPath('wrong-pw');
    await writeDrsFile({ payload, passphrase: 'the-real-passphrase', outPath, meta: BASE_META });

    await assert.rejects(
      () => openDrsFile(outPath, 'a-completely-wrong-passphrase'),
      (err) => err instanceof DrsDecryptError,
    );
  });

  it('bad magic bytes -> DrsFormatError, not a crash', async () => {
    const outPath = tmpDrsPath('bad-magic');
    fs.writeFileSync(outPath, Buffer.from('NOT A DRS FILE AT ALL, JUST SOME BYTES'));
    await assert.rejects(() => openDrsFile(outPath, 'anything'), (err) => err instanceof DrsFormatError);
    await assert.rejects(() => readDrsHeader(outPath), (err) => err instanceof DrsFormatError);
  });

  it('truncated file -> DrsFormatError, not a crash', async () => {
    const payload = Buffer.from('this payload will be truncated away');
    const fullPath = tmpDrsPath('trunc-source');
    await writeDrsFile({ payload, passphrase: 'pw', outPath: fullPath, meta: BASE_META });
    const full = fs.readFileSync(fullPath);

    const truncatedPath = tmpDrsPath('truncated');
    fs.writeFileSync(truncatedPath, full.subarray(0, Math.floor(full.length / 2)));
    await assert.rejects(() => openDrsFile(truncatedPath, 'pw'), (err) => err instanceof DrsFormatError);
  });

  it('a single flipped byte anywhere in the encrypted region is caught by the whole-file checksum BEFORE decryption is even attempted', async () => {
    const payload = Buffer.from('tamper-detection check '.repeat(20));
    const fullPath = tmpDrsPath('tamper-source');
    await writeDrsFile({ payload, passphrase: 'pw', outPath: fullPath, meta: BASE_META });
    const bytes = fs.readFileSync(fullPath);

    // Flip one bit somewhere past the header (in the IV/ciphertext/tag region).
    const tamperIndex = bytes.length - 40; // well within the encrypted tail, not the checksum itself
    bytes[tamperIndex] ^= 0xff;
    const tamperedPath = tmpDrsPath('tampered');
    fs.writeFileSync(tamperedPath, bytes);

    await assert.rejects(
      () => openDrsFile(tamperedPath, 'pw'), // correct passphrase — proves it's the CHECKSUM catching this, not GCM
      (err) => err instanceof DrsIntegrityError,
    );
  });

  it('a format version newer than this build supports is refused, not guessed at', async () => {
    const payload = Buffer.from('future format');
    const outPath = tmpDrsPath('future-version');
    await writeDrsFile({ payload, passphrase: 'pw', outPath, meta: BASE_META });

    // Hand-craft the version-too-new case: bump the FORMAT_VERSION field
    // (bytes 8-9) without touching anything else, then re-derive a valid
    // whole-file checksum so this test isolates the version check from
    // the checksum check above rather than accidentally re-testing it.
    const bytes = fs.readFileSync(outPath);
    bytes.writeUInt16BE(9999, 8);
    const { createHash } = await import('node:crypto');
    const withoutChecksum = bytes.subarray(0, bytes.length - 32);
    const newChecksum = createHash('sha256').update(withoutChecksum).digest();
    const rebuilt = Buffer.concat([withoutChecksum, newChecksum]);
    const futurePath = tmpDrsPath('future-version-rebuilt');
    fs.writeFileSync(futurePath, rebuilt);

    await assert.rejects(() => openDrsFile(futurePath, 'pw'), (err) => err instanceof DrsVersionError);
  });

  it('compression actually reduces size for a compressible payload', async () => {
    const payload = Buffer.from('A'.repeat(10000)); // highly compressible
    const outPath = tmpDrsPath('compression');
    const written = await writeDrsFile({ payload, passphrase: 'pw', outPath, meta: BASE_META });
    assert.ok(written.bytes < payload.length, 'the .drs file should be smaller than the raw payload for compressible data');
  });
});
