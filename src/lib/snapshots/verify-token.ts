/**
 * Snapshot verification tokens — anti-forgery for printed report cards.
 *
 * A token is an opaque base64url string carrying a payload (snapshotId,
 * optional studentDbId, optional schoolId, version) and an HMAC-SHA256
 * signature over the canonical bytes. Anyone can DECODE the payload;
 * only the server can mint VALID signatures, so a printed QR linking
 * to /verify/<token> can be trusted by a scanner once the server
 * confirms the signature.
 *
 * Tokens are intentionally NOT time-bounded — a parent looking up a
 * report card years later should still get a valid verification view.
 * Revocation (e.g. report-card recall) is by rotating the key OR by a
 * future revocations-table check that runs after signature validation.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC secret. Reuses SESSION_COOKIE_SECRET — the same long random key
 * the opaque session cookie system signs with (src/lib/auth.ts).
 * Single key surface = one rotation event, one threat model. The
 * dedicated DRAIS_VERIFICATION_SECRET override exists for the rare
 * case an operator wants to rotate verify tokens independently of
 * session cookies (e.g. a leaked QR archive that needs to be
 * invalidated without logging every user out).
 */
function secret(): string {
  const s = process.env.DRAIS_VERIFICATION_SECRET || process.env.SESSION_COOKIE_SECRET;
  if (!s || s.length < 16) {
    throw new Error('Missing DRAIS_VERIFICATION_SECRET / SESSION_COOKIE_SECRET (need ≥16 chars)');
  }
  return s;
}

export interface VerifyPayload {
  /** Snapshot UUID. */
  s: string;
  /** Optional student db id — when present, the verify page filters to
   *  this one learner. When omitted, the verify page shows the whole
   *  snapshot (rare; typically used for class transcripts). */
  u?: number;
  /** Snapshot school id — used to scope the lookup at verify time. */
  c?: number;
  /** Schema version — bump when payload shape changes so old tokens
   *  can be rejected loudly rather than parsed against the wrong
   *  shape. */
  v: 1;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/**
 * Sign a payload and return an opaque token (base64url(json).base64url(hmac)).
 * Token length ≈ 80–120 chars for the typical (snapshotId + studentDbId)
 * payload — comfortable in a printed QR at 100×100 px.
 */
export function signVerifyToken(payload: VerifyPayload): string {
  const json = JSON.stringify(payload);
  const body = b64urlEncode(Buffer.from(json, 'utf8'));
  const sig  = createHmac('sha256', secret()).update(body).digest();
  const sigB = b64urlEncode(sig);
  return `${body}.${sigB}`;
}

/**
 * Validate a token and return its payload. Returns null when the token
 * is malformed, the signature is wrong, or the version is unknown.
 * Constant-time HMAC comparison via timingSafeEqual.
 */
export function verifyVerifyToken(token: string): VerifyPayload | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sigB] = token.split('.');
  if (!body || !sigB) return null;
  let expectedSig: Buffer;
  let providedSig: Buffer;
  try {
    expectedSig = createHmac('sha256', secret()).update(body).digest();
    providedSig = b64urlDecode(sigB);
  } catch { return null; }
  if (expectedSig.length !== providedSig.length) return null;
  if (!timingSafeEqual(expectedSig, providedSig)) return null;
  try {
    const json = b64urlDecode(body).toString('utf8');
    const payload = JSON.parse(json) as VerifyPayload;
    if (payload?.v !== 1 || typeof payload.s !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}

/** Build the absolute verification URL for a payload, given an origin. */
export function buildVerifyUrl(origin: string, payload: VerifyPayload): string {
  const token = signVerifyToken(payload);
  return `${origin.replace(/\/$/, '')}/verify/${token}`;
}
