/**
 * POST /api/parent/auth/request-otp
 * Body: { phone }
 *
 * Pure phone-OTP login (no password, no email). Sends an OTP only if the phone
 * is on file as a guardian/contact for at least one learner. ALWAYS returns the
 * same generic response so a caller can never enumerate which numbers exist.
 */
import { NextRequest, NextResponse } from 'next/server';
import { normalizePhoneNumber } from '@/lib/africastalking';
import { findMatchableLearners } from '@/lib/portal/linking';
import { issueOtp } from '@/lib/portal/otp';

const GENERIC = { success: true, message: 'If this number is linked to learners, an OTP has been sent.' };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const phone = normalizePhoneNumber(String(body?.phone ?? ''));
  // Even an invalid phone gets the generic answer (no enumeration / no shape leak).
  if (!phone) return NextResponse.json(GENERIC);

  try {
    const matches = await findMatchableLearners(phone);
    if (matches.length > 0) {
      // issueOtp throttles re-sends per phone+purpose (resend cooldown).
      await issueOtp(phone, 'verify');
    }
  } catch (e) {
    console.error('[parent/request-otp] error', e);
    // still generic — don't reveal internal failures to a probing client
  }
  return NextResponse.json(GENERIC);
}
