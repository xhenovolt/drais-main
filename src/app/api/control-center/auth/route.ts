/**
 * Control Center auth API (Xhenvolt domain — never touches school auth).
 *   GET    → { setup_required, authenticated, user? }
 *   POST   → login { email, password }
 *   PUT    → first-time setup { name, email, password } (only when 0 users)
 *   DELETE → logout
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  hasAnyControlUser, createControlUser, loginControl, logoutControl,
  getControlSession, controlAudit, clientIp, CONTROL_COOKIE,
} from '@/lib/control/auth';

export const runtime = 'nodejs';

const cookieOpts = {
  httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production',
  path: '/', maxAge: 12 * 3600,
};

export async function GET(req: NextRequest) {
  const [setupRequired, user] = await Promise.all([
    hasAnyControlUser().then(v => !v),
    getControlSession(req),
  ]);
  return NextResponse.json({
    success: true, setup_required: setupRequired, authenticated: !!user,
    user: user ? { name: user.name, email: user.email, role: user.role } : null,
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b?.email || !b?.password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  const res = await loginControl(String(b.email), String(b.password), clientIp(req), req.headers.get('user-agent'));
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 401 });
  const out = NextResponse.json({ success: true, user: { name: res.user!.name, email: res.user!.email, role: res.user!.role } });
  out.cookies.set(CONTROL_COOKIE, res.token!, cookieOpts);
  return out;
}

export async function PUT(req: NextRequest) {
  // First-time setup — permanently closed the moment any user exists.
  if (await hasAnyControlUser()) return NextResponse.json({ error: 'Setup already completed' }, { status: 409 });
  const b = await req.json().catch(() => null);
  if (!b?.name || !b?.email || !b?.password) return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 });
  if (b.password !== b.confirm_password) return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
  const created = await createControlUser({
    name: String(b.name), email: String(b.email), password: String(b.password), role: 'XHENVOLT_SUPER_ADMIN',
  });
  if (!created.ok) return NextResponse.json({ error: created.reason }, { status: 400 });
  await controlAudit(created.id!, 'setup_super_admin_created', `control_users:${created.id}`, { email: b.email }, clientIp(req));
  const res = await loginControl(String(b.email), String(b.password), clientIp(req), req.headers.get('user-agent'));
  const out = NextResponse.json({ success: true, user: { name: b.name, email: b.email, role: 'XHENVOLT_SUPER_ADMIN' } });
  if (res.ok) out.cookies.set(CONTROL_COOKIE, res.token!, cookieOpts);
  return out;
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(CONTROL_COOKIE)?.value;
  const user = await getControlSession(req);
  if (token) await logoutControl(token);
  if (user) await controlAudit(user.id, 'logout', 'session', null, clientIp(req));
  const out = NextResponse.json({ success: true });
  out.cookies.set(CONTROL_COOKIE, '', { ...cookieOpts, maxAge: 0 });
  return out;
}
