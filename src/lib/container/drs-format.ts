/**
 * @drais/container — .drs binary framing.
 * docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §10.2.
 *
 * Layout:
 *   MAGIC            8 bytes   "DRAISDRS"
 *   FORMAT_VERSION   2 bytes   uint16 BE
 *   HEADER_LEN       4 bytes   uint32 BE
 *   HEADER           HEADER_LEN bytes, UTF-8 JSON, NOT encrypted
 *                     (readable without the key — that's the point: the
 *                     app can decide "can I even attempt this?" before
 *                     asking for a passphrase)
 *   IV               12 bytes  (AES-GCM nonce)
 *   CIPHERTEXT        variable  AES-256-GCM(gzip(payload))
 *   AUTH_TAG          16 bytes  (AES-GCM)
 *   FILE_CHECKSUM     32 bytes  SHA-256 of every byte above (MAGIC..AUTH_TAG)
 *
 * One deliberate refinement over the audit doc's original §10.2 sketch,
 * worth recording here since it's the actual implemented contract: that
 * sketch put a `containerChecksum` field INSIDE the header JSON,
 * described as "sha256 of everything before this field" — which is
 * self-referential (the header's own bytes, containing that field,
 * can't hash themselves) and not actually computable as written. This
 * implementation instead appends a single whole-file FILE_CHECKSUM as a
 * trailing 32 bytes, computed over everything before it. Same goal
 * (detect a truncated/corrupted file before attempting decryption,
 * checkable without the key), no circularity. `payloadChecksum` (a hash
 * of the DECRYPTED payload, not of the container) stays inside the
 * header exactly as specified — that one isn't self-referential, it
 * hashes different content.
 */
import { createHash } from 'node:crypto';
import type { KdfDescriptor } from './kdf';

export const MAGIC = Buffer.from('DRAISDRS', 'ascii'); // 8 bytes
export const FORMAT_VERSION = 1;
export const CHECKSUM_BYTES = 32; // SHA-256

const HEADER_PREFIX_BYTES = 8 + 2 + 4; // MAGIC + FORMAT_VERSION + HEADER_LEN

export class DrsFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrsFormatError';
  }
}

export interface DrsHeader {
  schoolId: number;
  schoolExternalId?: string | null;
  installationId?: string | null;
  drsFormatVersion: number;
  drAisAppVersionMin: string;
  schemaMigrationHead?: string | null;
  engine: 'sqlite';
  createdAt: string; // ISO-8601 UTC
  createdBy?: { installationId?: string | null; userId?: number | string | null } | null;
  kdf: KdfDescriptor;
  cipher: 'aes-256-gcm';
  /** "sha256:<hex>" of the DECRYPTED, DECOMPRESSED payload. */
  payloadChecksum: string;
  compression: 'gzip' | 'none';
}

export interface AssembleInput {
  header: DrsHeader;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

export function assembleDrsBuffer(input: AssembleInput): Buffer {
  const headerJson = Buffer.from(JSON.stringify(input.header), 'utf8');
  const versionBuf = Buffer.alloc(2);
  versionBuf.writeUInt16BE(FORMAT_VERSION, 0);
  const headerLenBuf = Buffer.alloc(4);
  headerLenBuf.writeUInt32BE(headerJson.length, 0);

  const withoutChecksum = Buffer.concat([MAGIC, versionBuf, headerLenBuf, headerJson, input.iv, input.ciphertext, input.tag]);
  const fileChecksum = createHash('sha256').update(withoutChecksum).digest();
  return Buffer.concat([withoutChecksum, fileChecksum]);
}

export interface ParsedDrs {
  formatVersion: number;
  header: DrsHeader;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
  /** Whether the trailing FILE_CHECKSUM matches. False means the file is
   *  truncated or was bit-flipped somewhere — callers must treat this as
   *  fatal, never proceed to decrypt a checksum-invalid file. */
  fileChecksumValid: boolean;
}

/** Read just the header, structurally — no key needed, no decryption
 *  attempted. Used both by the full parse below and by readDrsHeader()
 *  in read-drs.ts, which reads only the header bytes off disk without
 *  loading the whole (potentially large) file into memory first. */
export function parseHeaderOnly(buf: Buffer): { formatVersion: number; header: DrsHeader; headerEnd: number } {
  if (buf.length < HEADER_PREFIX_BYTES) {
    throw new DrsFormatError('File is too small to be a .drs container');
  }
  const magic = buf.subarray(0, 8);
  if (!magic.equals(MAGIC)) {
    throw new DrsFormatError('Not a DRAIS .drs file — magic bytes do not match');
  }
  const formatVersion = buf.readUInt16BE(8);
  const headerLen = buf.readUInt32BE(10);
  const headerEnd = HEADER_PREFIX_BYTES + headerLen;
  if (headerEnd > buf.length) {
    throw new DrsFormatError('File is truncated — the declared header length exceeds the actual file size');
  }
  const headerJson = buf.subarray(HEADER_PREFIX_BYTES, headerEnd);
  let header: DrsHeader;
  try {
    header = JSON.parse(headerJson.toString('utf8'));
  } catch {
    throw new DrsFormatError('Header is not valid JSON — the file is corrupted');
  }
  return { formatVersion, header, headerEnd };
}

export function parseDrsBuffer(buf: Buffer): ParsedDrs {
  const { formatVersion, header, headerEnd } = parseHeaderOnly(buf);

  const IV_BYTES = 12;
  const TAG_BYTES = 16;
  const minRemaining = IV_BYTES + TAG_BYTES + CHECKSUM_BYTES;
  if (headerEnd + minRemaining > buf.length) {
    throw new DrsFormatError('File is truncated — missing IV/ciphertext/tag/checksum bytes');
  }

  const iv = buf.subarray(headerEnd, headerEnd + IV_BYTES);
  const ciphertextEnd = buf.length - CHECKSUM_BYTES - TAG_BYTES;
  const ciphertext = buf.subarray(headerEnd + IV_BYTES, ciphertextEnd);
  const tag = buf.subarray(ciphertextEnd, ciphertextEnd + TAG_BYTES);
  const claimedChecksum = buf.subarray(buf.length - CHECKSUM_BYTES);

  const withoutChecksum = buf.subarray(0, buf.length - CHECKSUM_BYTES);
  const actualChecksum = createHash('sha256').update(withoutChecksum).digest();
  const fileChecksumValid = actualChecksum.equals(claimedChecksum);

  return { formatVersion, header, iv, ciphertext, tag, fileChecksumValid };
}
