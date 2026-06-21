/**
 * POST /api/parent/auth/verify-otp
 * Body: { phone, code }
 *
 * Verifies the OTP, then (idempotently) provisions a password-less parent
 * account, materializes active learner links across ALL schools from the
 * phone-on-contact evidence, opens a session, and returns the linked learners.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/africastalking';
import { verifyOtp } from '@/lib/portal/otp';
import { claimLearners } from '@/lib/portal/linking';
import { createParentSession, parentCookieOptions, PARENT_COOKIE_NAME } from '@/lib/portal/session';
import { resolveLearnersForParent, type LearnerAccess } from '@/lib/parent/parent-access-resolver';

function clientIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

/** Strip server-only fields before sending learners to the client. */
function publicLearner(l: LearnerAccess) {
  const { student_id: _omit, parent_identity_id: _omit2, ...safe } = l;
  void _omit; void _omit2;
  return safe;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const phone = normalizePhoneNumber(String(body?.phone ?? ''));
  const code = String(body?.code ?? '');
  if (!phone || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Phone and 6-digit code are required' }, { status: 400 });
  }

  const ok = await verifyOtp(phone, 'verify', code);
  if (!ok) return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });

  // Provision (or fetch) the password-less account.
  let acc = (await query(
    `SELECT id, status FROM parent_accounts WHERE phone = ? LIMIT 1`, [phone],
  )) as Array<{ id: number; status: string }>;
  if (!acc.length) {
    const res: any = await query(
      `INSERT INTO parent_accounts (phone, phone_verified, status) VALUES (?, TRUE, 'active')`,
      [phone],
    );
    acc = [{ id: Number(res.insertId), status: 'active' }];
  } else if (acc[0].status === 'suspended') {
    return NextResponse.json({ error: 'This account has been suspended. Contact your school.' }, { status: 403 });
  } else {
    await query(
      `UPDATE parent_accounts SET phone_verified = TRUE, last_login_at = NOW(), last_login_ip = ? WHERE id = ?`,
      [clientIp(req), acc[0].id],
    );
  }
  const parentId = acc[0].id;

  // Materialize active links from phone-on-contact evidence (auto-approve ON
  // by default). Idempotent — re-login is a no-op for existing links.
  try { await claimLearners(parentId, phone); } catch (e) { console.error('[parent/verify-otp] claim error', e); }

  const token = await createParentSession(parentId, clientIp(req), req.headers.get('user-agent'));
  const learners = await resolveLearnersForParent(parentId);

  const out = NextResponse.json({
    success: true,
    parent: { id: parentId, phone },
    learners: learners.map(publicLearner),
    learner_count: learners.length,
  });
  out.cookies.set(PARENT_COOKIE_NAME, token, parentCookieOptions());
  return out;
}
