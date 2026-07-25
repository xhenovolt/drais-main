/**
 * POST /api/fingerprint — HARD-DISABLED (501).
 *
 * This was the enrollment half of the same "decorative WebAuthn" surface whose
 * verify half (`/api/students/[id]/fingerprint/verify`) is already hard-disabled.
 * It accepted an UNAUTHENTICATED POST and inserted a row into `fingerprints`
 * keyed by a caller-supplied `student_id` — so anyone could write fingerprint
 * credentials for any student id. The credential itself came from a WebAuthn
 * `navigator.credentials.create()` call using a static all-zeros challenge, so
 * it carried no real cryptographic assurance, and nothing verifies against it
 * securely (the verify route returns 501).
 *
 * Closing the open write here is consistent with the decision already recorded
 * on the verify route. A real fingerprint enrolment must land as a NEW,
 * authenticated flow (`@simplewebauthn/server` with a proper challenge, or the
 * per-device ZKTeco PUSH path already used for biometric attendance) — not a
 * patch on top of this stub.
 */
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    success: false,
    error: 'FINGERPRINT_ENROLLMENT_DISABLED',
    message:
      'This fingerprint enrolment endpoint is disabled. It accepted unauthenticated ' +
      'writes and used decorative WebAuthn with no real verification. Use the ZKTeco ' +
      'PUSH biometric path, or a future authenticated WebAuthn flow.',
  }, { status: 501 });
}
