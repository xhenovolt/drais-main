/**
 * POST /api/portal/auth/reset-password
 * Body: { phone, otp, newPassword }
 *
 * Completes a password reset using a 'reset' OTP (requested via
 * /request-otp with purpose='reset'). Invalidates all existing sessions.
 */
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/africastalking';
import { verifyOtp } from '@/lib/portal/otp';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const phone = normalizePhoneNumber(String(body?.phone ?? ''));
  const otp = String(body?.otp ?? '');
  const newPassword = String(body?.newPassword ?? '');

  if (!phone)                  return NextResponse.json({ error: 'Valid phone is required' }, { status: 400 });
  if (newPassword.length < 8)  return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  if (!/^\d{6}$/.test(otp))     return NextResponse.json({ error: 'A 6-digit code is required' }, { status: 400 });

  const okOtp = await verifyOtp(phone, 'reset', otp);
  if (!okOtp) return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });

  const rows = (await query(`SELECT id FROM parent_accounts WHERE phone = ? LIMIT 1`, [phone])) as any[];
  if (!rows.length) {
    // OTP was valid but no account — uniform success to avoid enumeration
    return NextResponse.json({ success: true });
  }
  const id = rows[0].id;
  const hash = await bcrypt.hash(newPassword, 10);
  await query(
    `UPDATE parent_accounts SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?`,
    [hash, id],
  );
  // Revoke all sessions — force re-login with the new password
  await query(`UPDATE parent_sessions SET is_active = FALSE WHERE parent_account_id = ?`, [id]);

  return NextResponse.json({ success: true });
}
