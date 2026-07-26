/**
 * Control Center — optional 2FA management (Phase 10 / E-2).
 * The signed-in operator manages THEIR OWN second factor (opt-in):
 *   GET    → { enabled }
 *   POST   → begin enrollment  → { secret, otpauth }
 *   PUT    { code }            → confirm enrollment → { recovery: [...] } (shown once)
 *   DELETE { code }            → disable (requires a valid code)
 * 2FA is never forced; these endpoints only affect the caller's own account.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, clientIp, getTotpStatus, beginTotpEnrollment, confirmTotpEnrollment, disableTotp } from '@/lib/control/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ success: true, ...(await getTotpStatus(user.id)) });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { secret, otpauth } = await beginTotpEnrollment(user.id, user.email);
  return NextResponse.json({ success: true, secret, otpauth });
}

export async function PUT(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json().catch(() => null);
  const res = await confirmTotpEnrollment(user.id, String(b?.code || ''), clientIp(req));
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
  return NextResponse.json({ success: true, recovery: res.recovery });
}

export async function DELETE(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json().catch(() => null);
  const res = await disableTotp(user.id, String(b?.code || ''), clientIp(req));
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
  return NextResponse.json({ success: true });
}
