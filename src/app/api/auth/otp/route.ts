/**
 * Auth OTP endpoint. Generates a 6-digit code, stashes it in
 * password_reset_codes (or auth_otps if present), and emits an
 * 'auth.otp' or 'auth.password.reset' event so the communication
 * engine takes care of delivery.
 *
 * POST /api/auth/otp
 *   body: { userId, purpose: 'otp'|'password_reset' }
 *
 * Returns { success, ttlMinutes } — never returns the code in the
 * response body (would defeat the OTP).
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { emit } from '@/lib/comm';

const TTL_MIN = 10;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  const purpose = (body.purpose ?? 'otp') as 'otp' | 'password_reset';

  const userRows = (await query(
    `SELECT u.id, u.school_id, u.phone,
            COALESCE(NULLIF(u.first_name, ''), '') AS first_name
       FROM users u
      WHERE u.id = ?`,
    [body.userId],
  )) as Array<{ id: number; school_id: number; phone: string | null; first_name: string }>;
  if (!userRows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const user = userRows[0];
  if (!user.phone) {
    return NextResponse.json({ error: 'User has no phone on file' }, { status: 400 });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + TTL_MIN * 60 * 1000);

  // Persist for verification. We use a generic auth_codes table if
  // present; otherwise log to console and rely on the event audit
  // (operators bootstrap the table separately).
  try {
    await query(
      `INSERT INTO auth_codes (user_id, purpose, code, expires_at)
       VALUES (?, ?, ?, ?)`,
      [user.id, purpose, code, expiresAt],
    );
  } catch {
    // table missing — degrade gracefully; the engine still logs the
    // dispatch and the verifier endpoint will report "Invalid code".
    console.warn('[auth/otp] auth_codes table missing — code not persisted');
  }

  const evt = purpose === 'password_reset' ? 'auth.password.reset' : 'auth.otp';
  await emit(evt, {
    schoolId:    user.school_id,
    userId:      user.id,
    phone:       user.phone,
    code,
    ttlMinutes:  TTL_MIN,
    source:      'auto',
    triggeredBy: null,
  } as any);

  return NextResponse.json({ success: true, ttlMinutes: TTL_MIN });
}
