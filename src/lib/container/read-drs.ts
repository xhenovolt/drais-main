/**
 * @drais/container — read/open a .drs file.
 *
 * Two entry points, deliberately separate (docs/architecture/
 * DRAIS_V2_ARCHITECTURE_AUDIT.md §10.2's whole point of an unencrypted
 * header): `readDrsHeader()` needs no passphrase and answers "what is
 * this file, can I even attempt to open it" cheaply. `openDrsFile()` does
 * the real work and needs the key.
 *
 * Failure modes are distinct error types on purpose — callers (and a
 * future UI) should be able to tell "this isn't a .drs file at all" apart
 * from "this file is corrupted" apart from "wrong passphrase", instead of
 * one generic catch-all failure.
 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { promises as fs } from 'node:fs';
import { deriveKey } from './kdf';
import { decrypt } from './aes-gcm';
import { parseHeaderOnly, parseDrsBuffer, FORMAT_VERSION, type DrsHeader } from './drs-format';

export { DrsFormatError } from './drs-format';

export class DrsIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrsIntegrityError';
  }
}

export class DrsDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrsDecryptError';
  }
}

export class DrsVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrsVersionError';
  }
}

/** Header only — no passphrase, no decryption, safe to call on any file
 *  a user hands you before asking them for anything. Reads only the bytes
 *  needed (magic + version + header), not the whole (potentially large)
 *  file. */
export async function readDrsHeader(filePath: string): Promise<DrsHeader> {
  const fh = await fs.open(filePath, 'r');
  try {
    // Read a generous prefix (64KB — headers are small JSON, this is far
    // more than enough) rather than the whole file, then let
    // parseHeaderOnly validate the real declared length against it.
    const PREFIX = 65536;
    const buf = Buffer.alloc(PREFIX);
    const { bytesRead } = await fh.read(buf, 0, PREFIX, 0);
    const { header } = parseHeaderOnly(buf.subarray(0, bytesRead));
    return header;
  } finally {
    await fh.close();
  }
}

export interface OpenDrsResult {
  header: DrsHeader;
  payload: Buffer;
}

/**
 * Full open: structural validation → whole-file checksum → version
 * compatibility → decrypt → decompress → payload checksum. Each stage
 * fails with a specific, distinct error rather than falling through to a
 * generic exception — this is the function docs/architecture/
 * DRAIS_V2_ARCHITECTURE_AUDIT.md §14 Scenario 8 ("a user imports a
 * malformed .drais package... can DRAIS reject it safely") depends on at
 * the .drs layer specifically.
 */
export async function openDrsFile(filePath: string, passphrase: string): Promise<OpenDrsResult> {
  const buf = await fs.readFile(filePath);
  const parsed = parseDrsBuffer(buf); // throws DrsFormatError on structural corruption

  if (!parsed.fileChecksumValid) {
    throw new DrsIntegrityError('File checksum mismatch — this .drs file is corrupted or was tampered with, and cannot be safely opened');
  }
  if (parsed.formatVersion > FORMAT_VERSION) {
    throw new DrsVersionError(`This .drs file uses container format v${parsed.formatVersion}, which this DRAIS build (supports up to v${FORMAT_VERSION}) does not understand. Update DRAIS before opening it.`);
  }

  const salt = Buffer.from(parsed.header.kdf.salt, 'base64');
  const key = await deriveKey(passphrase, salt);

  let decompressed: Buffer;
  try {
    const plain = decrypt(parsed.ciphertext, key, parsed.iv, parsed.tag);
    decompressed = parsed.header.compression === 'gzip' ? gunzipSync(plain) : plain;
  } catch {
    // GCM auth-tag failure (wrong key OR tampered ciphertext) and a
    // corrupt gzip stream both land here — from the outside these are
    // indistinguishable and both mean "cannot trust this content",
    // which is exactly what should happen: never guess which one it was
    // and never return partially-decrypted bytes.
    throw new DrsDecryptError('Could not decrypt this .drs file — the passphrase is wrong, or the file is corrupted');
  }

  const actualChecksum = 'sha256:' + createHash('sha256').update(decompressed).digest('hex');
  if (actualChecksum !== parsed.header.payloadChecksum) {
    throw new DrsIntegrityError('Decrypted payload does not match its recorded checksum — the file may be corrupted in a way GCM alone did not catch');
  }

  return { header: parsed.header, payload: decompressed };
}
