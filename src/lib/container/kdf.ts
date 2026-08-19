/**
 * @drais/container — key derivation.
 *
 * Argon2id turns a school/installation passphrase into the AES-256 key
 * that protects a .drs file (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md
 * §10.3-10.4). Never invent cryptography — this wraps `hash-wasm`'s
 * argon2id implementation, a mature, widely-used primitive.
 *
 * Deliberately WASM, not a native (`node-gyp`) binding: this session's own
 * `better-sqlite3` incident (a native module that compiled fine locally
 * but broke the Vercel build entirely — Python 3.12 dropped `distutils`,
 * no prebuilt binary matched) is exactly the failure mode a WASM
 * dependency cannot have. There is no compile step at all, so it can't
 * break a build the way a native module can. Confirmed at install time:
 * `hash-wasm` has zero install scripts (unlike better-sqlite3,
 * core-js, electron, puppeteer, sharp — every native-ish dependency in
 * this repo's own install-scripts warning list).
 *
 * Parameters follow OWASP's Argon2id "second recommended" desktop-class
 * profile (m=64 MiB, t=3, p=4) — this protects a file encryption key, not
 * a login form; a few hundred milliseconds of KDF time on unlock is an
 * acceptable, deliberate cost for a local install, not something to
 * economize on the way a high-QPS login endpoint would need to.
 */
import { argon2id } from 'hash-wasm';
import { randomBytes } from 'node:crypto';

export const KDF_ALGORITHM = 'argon2id' as const;
export const KDF_PARAMS = {
  parallelism: 4,
  iterations: 3,
  memorySize: 65536, // KiB = 64 MiB
  hashLength: 32,     // bytes = 256 bits, exactly an AES-256 key
} as const;

export const SALT_BYTES = 16;

export interface KdfDescriptor {
  algorithm: typeof KDF_ALGORITHM;
  params: typeof KDF_PARAMS;
  /** base64 */
  salt: string;
}

export function generateSalt(): Buffer {
  return randomBytes(SALT_BYTES);
}

/** Derive a 32-byte AES-256 key from a passphrase + salt. */
export async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  const out = await argon2id({
    password: passphrase,
    salt,
    parallelism: KDF_PARAMS.parallelism,
    iterations: KDF_PARAMS.iterations,
    memorySize: KDF_PARAMS.memorySize,
    hashLength: KDF_PARAMS.hashLength,
    outputType: 'binary',
  });
  return Buffer.from(out);
}

export function describeKdf(salt: Buffer): KdfDescriptor {
  return { algorithm: KDF_ALGORITHM, params: KDF_PARAMS, salt: salt.toString('base64') };
}
