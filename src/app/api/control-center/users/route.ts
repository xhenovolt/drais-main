/**
 * Control Center operators.
 * GET  → list (any control user)
 * POST → create operator (XHENVOLT_SUPER_ADMIN only) { name, email, password, role }
 * All actions audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getControlSession, createControlUser, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const rows = (await query(
    `SELECT id, name, email, role, status, created_at, last_login FROM control_users ORDER BY id ASC`, [],
  )) as any[];
  return NextResponse.json({ success: true, rows });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'operators.manage')) return NextResponse.json({ error: 'You do not have permission to manage operators' }, { status: 403 });
  const b = await req.json().catch(() => null);
  const role = ['XHENVOLT_SUPER_ADMIN', 'XHENVOLT_OPERATOR', 'XHENVOLT_VIEWER'].includes(b?.role) ? b.role : 'XHENVOLT_OPERATOR';
  const created = await createControlUser({
    name: String(b?.name || ''), email: String(b?.email || ''), password: String(b?.password || ''),
    role, createdBy: user.id,
  });
  if (!created.ok) return NextResponse.json({ error: created.reason }, { status: 400 });
  await controlAudit(user.id, 'operator_created', `control_users:${created.id}`, { email: b.email, role }, clientIp(req));
  return NextResponse.json({ success: true, id: created.id });
}
