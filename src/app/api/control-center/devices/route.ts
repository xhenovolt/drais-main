/**
 * Control Center — platform device management API (Roadmap P2).
 *   GET  ?q=&school=&status=  → every device across every school + schools list
 *   POST { sn, action, to_school_id?, reason? }
 *         action ∈ assign | release | suspend | activate | retire
 * Read requires a control session; mutations require canManage. Audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, canManage, clientIp } from '@/lib/control/auth';
import { listPlatformDevices, validateDeviceAction, runDeviceAction, type PlatformDeviceAction } from '@/lib/control/devices';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const schoolParam = url.searchParams.get('school');
  const devices = await listPlatformDevices({
    q: url.searchParams.get('q') || undefined,
    schoolId: schoolParam === 'unassigned' ? 'unassigned' : schoolParam ? Number(schoolParam) : null,
    status: url.searchParams.get('status') || null,
  }).catch(() => []);
  const schools = (await query(
    `SELECT id, name FROM schools WHERE deleted_at IS NULL ORDER BY name ASC`, [],
  ).catch(() => [])) as any[];
  return NextResponse.json({ success: true, devices, schools, count: devices.length });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });

  const b = await req.json().catch(() => null);
  const sn = String(b?.sn || '').trim();
  const action = String(b?.action || '');
  if (!sn) return NextResponse.json({ error: 'sn is required' }, { status: 400 });

  const toSchoolId = b?.to_school_id != null ? Number(b.to_school_id) : null;
  const check = validateDeviceAction(action, { toSchoolId });
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  try {
    const res = await runDeviceAction({
      sn, action: action as PlatformDeviceAction, toSchoolId,
      reason: b?.reason ? String(b.reason).slice(0, 255) : null,
      operatorId: user.id, ip: clientIp(req),
    });
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
    return NextResponse.json({ success: true, ...res });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Action failed' }, { status: 500 });
  }
}
