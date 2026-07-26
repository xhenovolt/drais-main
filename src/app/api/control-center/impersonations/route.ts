/**
 * Control Center — impersonation kill-switch (Phase 9 / E-3).
 *   GET                       → every live impersonation across the platform
 *   POST { session_id }       → revoke one
 *   POST { all: true }        → revoke ALL live impersonations
 * Read = control session; revoke = canManage. Audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, canManage, clientIp } from '@/lib/control/auth';
import { listActiveImpersonations, revokeImpersonation, revokeAllImpersonations } from '@/lib/control/impersonation';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const active = await listActiveImpersonations();
  return NextResponse.json({ success: true, active, count: active.length });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (b?.all === true) {
    const count = await revokeAllImpersonations(user.id, clientIp(req));
    return NextResponse.json({ success: true, revoked: count });
  }
  const sessionId = Number(b?.session_id);
  if (!Number.isFinite(sessionId)) return NextResponse.json({ error: 'session_id or all:true is required' }, { status: 400 });
  const res = await revokeImpersonation(sessionId, user.id, clientIp(req));
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
  return NextResponse.json({ success: true, revoked: 1 });
}
