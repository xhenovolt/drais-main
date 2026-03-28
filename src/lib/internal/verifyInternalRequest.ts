/**
 * src/lib/internal/verifyInternalRequest.ts
 *
 * Validates that an inbound request carries the correct JETON_API_KEY header.
 * MUST be called at the top of every /api/internal/* route.
 *
 * Throws a NextResponse (not a plain Error) so callers can simply:
 *   const authError = verifyInternalRequest(request);
 *   if (authError) return authError;
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Verify the internal API key.
 * Returns a 401 NextResponse on failure, or null on success.
 *
 * Usage:
 *   const authError = verifyInternalRequest(request);
 *   if (authError) return authError;
 */
export function verifyInternalRequest(request: NextRequest): NextResponse | null {
  const providedKey = request.headers.get('x-api-key');
  const expectedKey = process.env.JETON_API_KEY;

  if (!expectedKey) {
    // Misconfiguration — fail loudly so the operator notices
    console.error('[InternalAPI] JETON_API_KEY is not set in environment. Refusing all internal requests.');
    return NextResponse.json(
      { success: false, error: { message: 'Internal API not configured', code: 'SERVER_MISCONFIGURATION' } },
      { status: 503 }
    );
  }

  if (!providedKey) {
    console.warn('[InternalAPI] Request missing x-api-key header');
    return NextResponse.json(
      { success: false, error: { message: 'Missing API key', code: 'UNAUTHORIZED' } },
      { status: 401 }
    );
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(expectedKey, 'utf-8');
  const provided = Buffer.from(providedKey, 'utf-8');

  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    console.warn('[InternalAPI] Invalid API key provided');
    return NextResponse.json(
      { success: false, error: { message: 'Invalid API key', code: 'UNAUTHORIZED' } },
      { status: 401 }
    );
  }

  return null; // Authenticated
}
