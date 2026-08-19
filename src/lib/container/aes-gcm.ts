/**
 * @drais/container — AES-256-GCM encrypt/decrypt.
 *
 * Node's built-in `crypto` module (OpenSSL-backed) — zero new dependency,
 * zero install-time risk of any kind. AES-GCM is an AEAD cipher: it gives
 * confidentiality AND integrity in one primitive. A wrong key or any
 * tampering of the ciphertext/IV is caught by GCM's own authentication
 * tag at decrypt time — decrypt() below throws in exactly that case,
 * never returns garbage plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const CIPHER_ALGORITHM = 'aes-256-gcm' as const;
export const IV_BYTES = 12;   // GCM's recommended nonce size
export const TAG_BYTES = 16;  // GCM's standard authentication tag size

export interface EncryptResult {
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

export function generateIv(): Buffer {
  return randomBytes(IV_BYTES);
}

export function encrypt(plaintext: Buffer, key: Buffer, iv: Buffer): EncryptResult {
  if (key.length !== 32) throw new Error(`AES-256 key must be 32 bytes, got ${key.length}`);
  const cipher = createCipheriv(CIPHER_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, ciphertext, tag };
}

/** Throws (never returns corrupted/garbage data) if the key is wrong or
 *  the ciphertext/IV/tag was tampered with in any way — GCM's own
 *  authentication check, not a check this module adds on top. */
export function decrypt(ciphertext: Buffer, key: Buffer, iv: Buffer, tag: Buffer): Buffer {
  if (key.length !== 32) throw new Error(`AES-256 key must be 32 bytes, got ${key.length}`);
  const decipher = createDecipheriv(CIPHER_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
