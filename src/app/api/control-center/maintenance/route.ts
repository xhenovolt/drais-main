/**
 * Control Center — maintenance-mode control (Phase 23 / E-20).
 *   GET                        → current mode + message
 *   POST { mode, message? }    → set it (super-admin, audited)
 * mode ∈ off | banner | read_only. read_only blocks tenant writes (withRoute).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, canManage, controlAudit, clientIp } from '@/lib/control/auth';
import { getMaintenance, setMaintenance, MAINTENANCE_MODES, type MaintenanceMode } from '@/lib/control/platform-settings';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ success: true, ...(await getMaintenance()) });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });
  const b = await req.json().catch(() => null);
  const mode = b?.mode as MaintenanceMode;
  if (!MAINTENANCE_MODES.includes(mode)) return NextResponse.json({ error: `mode must be one of ${MAINTENANCE_MODES.join(', ')}` }, { status: 400 });
  const res = await setMaintenance(mode, String(b?.message || ''));
  await controlAudit(user.id, 'maintenance_set', 'platform', res, clientIp(req));
  return NextResponse.json({ success: true, ...res });
}
