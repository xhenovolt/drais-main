/**
 * GET / POST /api/students/[id]/fingerprint/verify
 *
 * PHASE BIO-3 — HARD-DISABLED.
 *
 * The previous implementation called itself "WebAuthn verification"
 * but the verifier was literally:
 *
 *   async function verifyWebAuthnCredential(stored, challenge) {
 *     return JSON.parse(stored).id === JSON.parse(challenge).id;
 *   }
 *
 * No challenge / response. No signature. No public-key parsing. No
 * clientDataJSON, no authenticatorData, no relying-party origin
 * check. Anyone who could read or guess a credential id could
 * authenticate as anyone. The phrase "WebAuthn" was decorative.
 *
 * `@simplewebauthn/server` is not in package.json. There is no
 * code path that performs an actual cryptographic verification.
 *
 * Both handlers now return 501 NOT_IMPLEMENTED so:
 *   - No silent false-positive verifies happen.
 *   - The audit_logs table stops accruing rows that imply a
 *     verification occurred when none did.
 *   - A future commit that introduces real WebAuthn (via the
 *     SimpleWebAuthn server library) lands as a NEW file, not a
 *     patch on top of the stub.
 *
 * Validate that no production UI depends on this surface before
 * re-enabling. grep evidence at the time of disabling: no client-
 * side caller fetches /api/students/<id>/fingerprint/verify; the
 * fingerprint-auth page authenticates through a separate path.
 */
import { NextRequest, NextResponse } from 'next/server';

function notImplemented(): NextResponse {
  return NextResponse.json({
    success: false,
    error:   'WEBAUTHN_NOT_IMPLEMENTED',
    message:
      'Fingerprint verification at this endpoint is disabled. ' +
      'The previous implementation performed an id-equality check ' +
      'and was not WebAuthn. A real verifier requires ' +
      '`@simplewebauthn/server` and a challenge/registration flow ' +
      'this route does not yet have. Use the per-device ZKTeco PUSH ' +
      'path for fingerprint authentication today.',
  }, { status: 501 });
}

export async function GET(_req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  return notImplemented();
}

export async function POST(_req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  return notImplemented();
}
