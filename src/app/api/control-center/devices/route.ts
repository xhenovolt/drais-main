/**
 * Control Center — platform device management API (Roadmap P2).
 *   GET  ?q=&school=&status=  → every device across every school + schools list
 *   POST { sn, action, to_school_id?, reason? }
 *         action ∈ assign | release | suspend | activate | retire
 * Read requires a control session; mutations require canManage. Audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, clientIp } from '@/lib/control/auth';
import { denied, schoolInScope, isScoped } from '@/lib/control/guard';
import { controlCan } from '@/lib/control/permissions';
import { listPlatformDevices, validateDeviceAction, runDeviceAction, type PlatformDeviceAction } from '@/lib/control/devices';
import { parsePageParams, totalPages } from '@/lib/control/pagination';
import { query } from '@/lib/control/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'devices.view')) return denied('devices.view');

  const url = new URL(req.url);
  const schoolParam = url.searchParams.get('school');
  const { page, limit, offset } = parsePageParams(url.searchParams.get('page'), url.searchParams.get('limit'), { defaultLimit: 50, maxLimit: 200 });
  const { rows: devices, total } = await listPlatformDevices({
    q: url.searchParams.get('q') || undefined,
    schoolId: schoolParam === 'unassigned' ? 'unassigned' : schoolParam ? Number(schoolParam) : null,
    status: url.searchParams.get('status') || null,
    limit, offset,
  }).catch(() => ({ rows: [] as any[], total: 0 }));
  const allSchools = (await query(
    `SELECT id, name FROM schools WHERE deleted_at IS NULL ORDER BY name ASC`, [],
  ).catch(() => [])) as any[];
  // A school-scoped operator sees only their schools' devices (and no unassigned stock).
  const schools = allSchools.filter((s) => schoolInScope(user, s.id));
  if (isScoped(user)) devices.splice(0, devices.length, ...devices.filter((d: any) => d.school_id != null && schoolInScope(user, d.school_id)));
  return NextResponse.json({
    success: true, devices, schools, count: devices.length,
    pagination: { page, limit, total, totalPages: totalPages(total, limit) },
  });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'devices.manage')) return NextResponse.json({ error: 'You do not have permission to manage devices' }, { status: 403 });

  const b = await req.json().catch(() => null);
  const sn = String(b?.sn || '').trim();
  const action = String(b?.action || '');
  if (!sn) return NextResponse.json({ error: 'sn is required' }, { status: 400 });

  const toSchoolId = b?.to_school_id != null ? Number(b.to_school_id) : null;
  const check = validateDeviceAction(action, { toSchoolId });
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
  // A school-limited operator may only act on their schools' devices, and only move them between those schools.
  if (isScoped(user)) {
    const cur = ((await query(`SELECT school_id FROM devices WHERE sn = ? LIMIT 1`, [sn]).catch(() => [])) as any[])[0];
    if (!cur || cur.school_id == null || !schoolInScope(user, cur.school_id)) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    if (toSchoolId != null && !schoolInScope(user, toSchoolId)) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

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
