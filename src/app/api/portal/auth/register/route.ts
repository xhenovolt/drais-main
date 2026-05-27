/**
 * POST /api/portal/auth/register
 * Body: { phone, password, fullName?, otp }
 *
 * Creates a parent account after verifying the phone via OTP. Phone+password
 * is the login credential; OTP is consumed here to prove phone control.
 * Does NOT create any student links — linking is a separate, gated flow.
 */
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/africastalking';
import { verifyOtp } from '@/lib/portal/otp';
import { createParentSession, parentCookieOptions, PARENT_COOKIE_NAME } from '@/lib/portal/session';

function clientIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const phone = normalizePhoneNumber(String(body.phone ?? ''));
  const password = String(body.password ?? '');
  const otp = String(body.otp ?? '');
  const fullName = body.fullName ? String(body.fullName).slice(0, 150) : null;

  if (!phone)               return NextResponse.json({ error: 'Valid phone is required' }, { status: 400 });
  if (password.length < 8)  return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  if (!/^\d{6}$/.test(otp))  return NextResponse.json({ error: 'A 6-digit code is required' }, { status: 400 });

  // Verify phone ownership
  const okOtp = await verifyOtp(phone, 'verify', otp);
  if (!okOtp) return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });

  const existing = (await query(`SELECT id FROM parent_accounts WHERE phone = ? LIMIT 1`, [phone])) as any[];
  if (existing.length) {
    return NextResponse.json({ error: 'An account with this phone already exists. Please sign in.' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const res: any = await query(
    `INSERT INTO parent_accounts (phone, full_name, password_hash, phone_verified, status)
     VALUES (?, ?, ?, TRUE, 'active')`,
    [phone, fullName, passwordHash],
  );
  const parentAccountId = Number(res.insertId);

  const token = await createParentSession(parentAccountId, clientIp(req), req.headers.get('user-agent'));
  const out = NextResponse.json({
    success: true,
    parent: { id: parentAccountId, phone, fullName },
    next: 'link_child', // no links yet — UI should send them to claim a child
  });
  out.cookies.set(PARENT_COOKIE_NAME, token, parentCookieOptions());
  return out;
}
