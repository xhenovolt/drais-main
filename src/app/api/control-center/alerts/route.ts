/**
 * Control Center — founder alert feed (Phase 17 / E-13).
 *   GET                       → recent platform alerts (school-critical, …)
 *   POST { id }               → acknowledge one
 * Read = control session; acknowledge = any control session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, clientIp } from '@/lib/control/auth';
import { listAlerts, acknowledgeAlert } from '@/lib/control/health-history';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const alerts = await listAlerts(40);
  return NextResponse.json({ success: true, alerts, unacked: alerts.filter((a: any) => !a.acknowledged_at).length });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json().catch(() => null);
  const id = Number(b?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  await acknowledgeAlert(id, user.id, clientIp(req));
  return NextResponse.json({ success: true });
}
