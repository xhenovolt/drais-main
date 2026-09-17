import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, revokeControlSession, controlAudit, clientIp, CONTROL_COOKIE } from '@/lib/control/auth';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid session' }, { status: 400 });
  const revoked = await revokeControlSession(user.id, id, req.cookies.get(CONTROL_COOKIE)?.value);
  if (!revoked) return NextResponse.json({ error: 'Session not found or is the current session' }, { status: 404 });
  await controlAudit(user.id, 'session_revoked', `control_sessions:${id}`, null, clientIp(req));
  return NextResponse.json({ success: true });
}