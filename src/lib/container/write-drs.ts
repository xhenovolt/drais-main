/**
 * @drais/container — write a .drs file.
 *
 * Atomic write: write to `<path>.tmp-<pid>-<ts>`, fsync, rename over the
 * destination. Standard crash-safe pattern — a half-written temp file
 * never gets renamed into place, so a power loss or crash mid-write
 * leaves either the OLD .drs file intact or no file at all, never a
 * corrupted one masquerading as complete (docs/architecture/
 * DRAIS_V2_ARCHITECTURE_AUDIT.md §10.3, §14 Scenario 6).
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { generateSalt, deriveKey, describeKdf } from './kdf';
import { generateIv, encrypt, CIPHER_ALGORITHM } from './aes-gcm';
import { assembleDrsBuffer, type DrsHeader } from './drs-format';

export interface WriteDrsMeta {
  schoolId: number;
  schoolExternalId?: string | null;
  installationId?: string | null;
  drAisAppVersionMin: string;
  schemaMigrationHead?: string | null;
  createdBy?: { installationId?: string | null; userId?: number | string | null } | null;
}

export interface WriteDrsOptions {
  /** The raw bytes to protect — e.g. a provisioned SQLite file's contents
   *  (src/lib/provisioning/provision-school.ts's output, read from disk). */
  payload: Buffer;
  passphrase: string;
  outPath: string;
  meta: WriteDrsMeta;
  /** Default true. Set false only for payloads that are already
   *  compressed (gzipping twice wastes CPU for no benefit). */
  compress?: boolean;
}

export interface WriteDrsResult {
  path: string;
  bytes: number;
  payloadChecksum: string;
}

export async function writeDrsFile(opts: WriteDrsOptions): Promise<WriteDrsResult> {
  const compression: DrsHeader['compression'] = opts.compress === false ? 'none' : 'gzip';
  const compressed = compression === 'gzip' ? gzipSync(opts.payload) : opts.payload;
  const payloadChecksum = 'sha256:' + createHash('sha256').update(opts.payload).digest('hex');

  const salt = generateSalt();
  const key = await deriveKey(opts.passphrase, salt);
  const iv = generateIv();
  const { ciphertext, tag } = encrypt(compressed, key, iv);

  const header: DrsHeader = {
    schoolId: opts.meta.schoolId,
    schoolExternalId: opts.meta.schoolExternalId ?? null,
    installationId: opts.meta.installationId ?? null,
    drsFormatVersion: 1,
    drAisAppVersionMin: opts.meta.drAisAppVersionMin,
    schemaMigrationHead: opts.meta.schemaMigrationHead ?? null,
    engine: 'sqlite',
    createdAt: new Date().toISOString(),
    createdBy: opts.meta.createdBy ?? null,
    kdf: describeKdf(salt),
    cipher: CIPHER_ALGORITHM,
    payloadChecksum,
    compression,
  };

  const fileBuf = assembleDrsBuffer({ header, iv, ciphertext, tag });

  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
  const tmpPath = `${opts.outPath}.tmp-${process.pid}-${Date.now()}`;
  const fh = await fs.open(tmpPath, 'w');
  try {
    await fh.writeFile(fileBuf);
    await fh.sync(); // fsync before rename — the crash-safety point of this whole pattern
  } finally {
    await fh.close();
  }
  await fs.rename(tmpPath, opts.outPath);

  return { path: opts.outPath, bytes: fileBuf.length, payloadChecksum };
}
