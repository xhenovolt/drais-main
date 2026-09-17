import { NextRequest, NextResponse } from 'next/server';
import {
  getControlSession, listControlSessions, revokeAllControlSessions,
  revokeOtherControlSessions, controlAudit, clientIp, CONTROL_COOKIE,
} from '@/lib/control/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ success: true, data: await listControlSessions(req, user.id) });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const currentToken = req.cookies.get(CONTROL_COOKIE)?.value;
  if (body?.action === 'revoke_others') {
    if (!currentToken) return NextResponse.json({ error: 'Current session missing' }, { status: 401 });
    const count = await revokeOtherControlSessions(user.id, currentToken);
    await controlAudit(user.id, 'session_revoke_all_others', 'control_sessions', { count }, clientIp(req));
    return NextResponse.json({ success: true, sessions_revoked: count });
  }
  if (body?.action === 'revoke_all') {
    const count = await revokeAllControlSessions(user.id);
    await controlAudit(user.id, 'session_revoke_all', 'control_sessions', { count }, clientIp(req));
    const out = NextResponse.json({ success: true, sessions_revoked: count });
    out.cookies.set(CONTROL_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
    return out;
  }
  return NextResponse.json({ error: 'Unknown session action' }, { status: 400 });
}