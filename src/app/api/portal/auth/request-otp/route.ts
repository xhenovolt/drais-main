/**
 * POST /api/portal/auth/request-otp
 * Body: { phone, purpose: 'verify' | 'reset' }
 * Issues an SMS OTP. Always returns success:true (no account enumeration).
 */
import { NextRequest, NextResponse } from 'next/server';
import { issueOtp, type OtpPurpose } from '@/lib/portal/otp';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 });

  const purpose: OtpPurpose = body.purpose === 'reset' ? 'reset' : 'verify';
  await issueOtp(String(body.phone), purpose);

  // Uniform response regardless of whether the phone exists — prevents
  // enumeration of who has an account.
  return NextResponse.json({ success: true, message: 'If the number is valid, a code has been sent.' });
}
