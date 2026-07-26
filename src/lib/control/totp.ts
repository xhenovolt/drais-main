/**
 * Control Center — TOTP (RFC 6238) for OPTIONAL two-factor auth (Phase 10 / E-2).
 *
 * Implemented on node:crypto (HMAC-SHA1) — no external dependency. All functions
 * are PURE (deterministic given a time), so they unit-test cleanly. 2FA is
 * strictly opt-in per operator; nothing here forces it.
 */
import { createHmac, randomBytes, createHash } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch); if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A fresh base32 TOTP secret (160 bits by default). */
export function generateTotpSecret(bytes = 20): string { return base32Encode(randomBytes(bytes)); }

/** PURE: the 6-digit code for a secret at a given time. */
export function totpCode(secretB32: string, timeMs: number = Date.now(), step = 30, digits = 6): string {
  const counter = Math.floor(timeMs / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secretB32)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** PURE: accept a token within ±`window` steps (clock-skew tolerance). */
export function verifyTotp(secretB32: string, token: string, timeMs: number = Date.now(), window = 1): boolean {
  const t = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return false;
  for (let w = -window; w <= window; w++) {
    if (totpCode(secretB32, timeMs + w * 30_000) === t) return true;
  }
  return false;
}

/** otpauth:// URI for authenticator apps (QR or manual key entry). */
export function otpauthUrl(secretB32: string, account: string, issuer = 'DRAIS Control'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** One-time recovery codes (shown once; only hashes are stored). */
export function generateRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => randomBytes(5).toString('hex'));
}
// Forgiving normalisation: recovery codes are typed by hand, so ignore case,
// spaces and separators (e.g. "AB-cd 12" == "abcd12").
export const hashRecovery = (code: string): string =>
  createHash('sha256').update(String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');
