/**
 * OTP issuance + verification for the parent portal.
 * Used for: phone verification at signup, password reset, link claim.
 * Codes are stored hashed; the raw 6-digit code only ever exists in the SMS.
 */
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { query } from '@/lib/db';
import { sendSMS, normalizePhoneNumber } from '@/lib/africastalking';

export type OtpPurpose = 'verify' | 'reset' | 'link';

const TTL_MINUTES   = 10;
const MAX_ATTEMPTS  = 5;
const RESEND_WINDOW_SECONDS = 60; // throttle re-sends per phone+purpose

function sixDigit(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Issue an OTP for a phone+purpose. Throttled: refuses if one was sent in the
 * last RESEND_WINDOW_SECONDS. Returns { sent } — never the code.
 */
export async function issueOtp(rawPhone: string, purpose: OtpPurpose): Promise<{ sent: boolean; reason?: string }> {
  const phone = normalizePhoneNumber(rawPhone);
  if (!phone) return { sent: false, reason: 'invalid_phone' };

  const recent = (await query(
    `SELECT id FROM parent_otp_codes
      WHERE phone = ? AND purpose = ?
        AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
      ORDER BY id DESC LIMIT 1`,
    [phone, purpose, RESEND_WINDOW_SECONDS],
  )) as any[];
  if (recent.length) return { sent: false, reason: 'throttled' };

  const code = sixDigit();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO parent_otp_codes (phone, code_hash, purpose, expires_at) VALUES (?, ?, ?, ?)`,
    [phone, codeHash, purpose, expiresAt],
  );

  // Plain, conversational wording — Africa's Talking content filters/sender-ID
  // rules tend to block the standard "Your code is X / OTP / do not share" form,
  // so messages silently never arrive. This phrasing delivers reliably.
  const sms = await sendSMS(phone, `Please use ${code} as your DRAIS code.`);
  if (!sms?.success) {
    // Surface in server logs so an admin can tell SMS failed (the API still
    // returns the generic privacy-preserving response to the caller).
    console.error('[otp] SMS not delivered:', sms?.error || 'unknown', '→', phone);
  }
  return { sent: !!sms?.success };
}

/**
 * Verify a code for a phone+purpose. Consumes the most recent unexpired,
 * unconsumed code on success. Increments attempts on failure; locks the code
 * after MAX_ATTEMPTS. Returns true only on a clean match.
 */
export async function verifyOtp(rawPhone: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  const phone = normalizePhoneNumber(rawPhone);
  if (!phone || !/^\d{6}$/.test(code)) return false;

  const rows = (await query(
    `SELECT id, code_hash, attempts
       FROM parent_otp_codes
      WHERE phone = ? AND purpose = ?
        AND consumed_at IS NULL
        AND expires_at > NOW()
        AND attempts < ?
      ORDER BY id DESC LIMIT 1`,
    [phone, purpose, MAX_ATTEMPTS],
  )) as any[];
  if (!rows.length) return false;

  const row = rows[0];
  const match = await bcrypt.compare(code, row.code_hash);
  if (!match) {
    await query(`UPDATE parent_otp_codes SET attempts = attempts + 1 WHERE id = ?`, [row.id]);
    return false;
  }
  await query(`UPDATE parent_otp_codes SET consumed_at = NOW() WHERE id = ?`, [row.id]);
  return true;
}
