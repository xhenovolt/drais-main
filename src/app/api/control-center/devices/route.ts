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
import {
  listPlatformDevices, deviceCounts, validateDeviceAction, runDeviceAction, normalizeDeviceStatusFilter,
  DEVICE_STATUS_FILTERS, DEVICE_VIEWS, type PlatformDeviceAction, type DeviceView,
} from '@/lib/control/devices';
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
  const status = normalizeDeviceStatusFilter(url.searchParams.get('status'));
  if (status === null) {
    return NextResponse.json({ error: `Unknown status filter '${url.searchParams.get('status')}'. Use one of: ${DEVICE_STATUS_FILTERS.join(', ')}.` }, { status: 400 });
  }
  const viewRaw = String(url.searchParams.get('view') || 'all').toLowerCase();
  const view = ((DEVICE_VIEWS as readonly string[]).includes(viewRaw) ? viewRaw : 'all') as DeviceView;
  // A school-scoped operator sees only their schools' devices (and no unassigned stock) — applied in
  // SQL so totals and pages are right (it used to filter the page after the query).
  const schoolScope = isScoped(user) ? (user.schoolScope ?? []) : null;
  try {
    const [{ rows: devices, total }, counts] = await Promise.all([
      listPlatformDevices({
        q: url.searchParams.get('q') || undefined,
        schoolId: schoolParam === 'unassigned' ? 'unassigned' : schoolParam ? Number(schoolParam) : null,
        status, view, schoolScope, limit, offset,
      }),
      deviceCounts(schoolScope),
    ]);
    const allSchools = (await query(
      `SELECT id, name FROM schools WHERE deleted_at IS NULL ORDER BY name ASC`, [],
    ).catch(() => [])) as any[];
    const schools = allSchools.filter((s) => schoolInScope(user, s.id));
    return NextResponse.json({
      success: true, devices, schools, count: devices.length, counts,
      filters: { status, view },
      pagination: { page, limit, total, totalPages: totalPages(total, limit) },
    });
  } catch (e: any) {
    // Never answer a failure with an empty list — that reads as "the whole fleet is gone".
    console.error('[control/devices] list failed', e);
    return NextResponse.json({ error: `Could not load devices: ${e?.message || e}` }, { status: 500 });
  }
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
