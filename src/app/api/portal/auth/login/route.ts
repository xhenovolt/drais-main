/**
 * POST /api/portal/auth/login
 * Body: { phone, password }
 *
 * Phone + password login. Locks the account for 15 minutes after 5 failures.
 * Returns the parent's schools so the client can show a picker.
 */
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/africastalking';
import { createParentSession, setActiveSchool, parentCookieOptions, PARENT_COOKIE_NAME } from '@/lib/portal/session';
import { parentSchools } from '@/lib/portal/guard';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

function clientIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const phone = normalizePhoneNumber(String(body?.phone ?? ''));
  const password = String(body?.password ?? '');
  if (!phone || !password) {
    return NextResponse.json({ error: 'Phone and password are required' }, { status: 400 });
  }

  const rows = (await query(
    `SELECT id, password_hash, status, failed_logins, locked_until
       FROM parent_accounts WHERE phone = ? LIMIT 1`,
    [phone],
  )) as any[];

  // Uniform invalid-credentials response (no enumeration)
  const invalid = () => NextResponse.json({ error: 'Invalid phone or password' }, { status: 401 });
  if (!rows.length) return invalid();

  const acc = rows[0];
  if (acc.status === 'suspended') {
    return NextResponse.json({ error: 'This account has been suspended.' }, { status: 403 });
  }
  if (acc.locked_until && new Date(acc.locked_until) > new Date()) {
    return NextResponse.json({ error: 'Account temporarily locked. Try again later.' }, { status: 429 });
  }

  const match = await bcrypt.compare(password, acc.password_hash);
  if (!match) {
    const failed = Number(acc.failed_logins) + 1;
    if (failed >= MAX_FAILED) {
      await query(
        `UPDATE parent_accounts SET failed_logins = ?, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?`,
        [failed, LOCK_MINUTES, acc.id],
      );
    } else {
      await query(`UPDATE parent_accounts SET failed_logins = ? WHERE id = ?`, [failed, acc.id]);
    }
    return invalid();
  }

  await query(
    `UPDATE parent_accounts SET failed_logins = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = ? WHERE id = ?`,
    [clientIp(req), acc.id],
  );

  const token = await createParentSession(acc.id, clientIp(req), req.headers.get('user-agent'));

  // Auto-select the school if the parent only belongs to one.
  const schools = await parentSchools(acc.id);
  if (schools.length === 1) {
    await setActiveSchool(token, schools[0].school_id);
  }

  const out = NextResponse.json({
    success: true,
    schools,
    active_school_id: schools.length === 1 ? schools[0].school_id : null,
    needs_school_pick: schools.length > 1,
    needs_link: schools.length === 0,
  });
  out.cookies.set(PARENT_COOKIE_NAME, token, parentCookieOptions());
  return out;
}
