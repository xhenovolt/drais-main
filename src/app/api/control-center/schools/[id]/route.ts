/**
 * School operations view (Control Center).
 * GET  → everything needed to answer "is this school operating normally?"
 * POST → { action: 'set_module', module_code, enabled } — feature management
 *        (super-admin only, reuses the existing school_modules registry).
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getControlSession, controlAudit, clientIp, canManage } from '@/lib/control/auth';
import { MODULE_CATALOG, isModuleCode, getSchoolModuleStatus, setSchoolModule } from '@/lib/school-modules';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const schoolId = Number(id);

  const schools = (await query(
    `SELECT id, name, short_code, status, subscription_plan, subscription_status,
            subscription_end_date, district, country, email, phone, created_at
       FROM schools WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [schoolId],
  )) as any[];
  if (!schools[0]) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  const list = async (sql: string, params: any[] = [schoolId]) =>
    (await query(sql, params).catch(() => [])) as any[];

  const [devices, punches24, todayCounts, clock, smsRecent, moduleRows, syncEvents] = await Promise.all([
    list(`SELECT sn, device_name, device_type, is_online, last_seen, lan_ip FROM devices WHERE school_id = ?`),
    list(`SELECT COUNT(*) n FROM attendance_raw_events WHERE school_id = ? AND punch_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`),
    list(`SELECT role_type, status, COUNT(*) n FROM attendance_records WHERE school_id = ? AND attendance_date = CURDATE() GROUP BY role_type, status`),
    list(`SELECT device_sn, confidence, status, likely_cause FROM device_clock_health WHERE school_id = ? AND local_date = CURDATE()`),
    list(`SELECT status, COUNT(*) n FROM notification_outbox WHERE school_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR) GROUP BY status`),
    getSchoolModuleStatus(schoolId).catch(() => []),
    list(`SELECT source, COUNT(*) n, MAX(ingested_at) latest FROM attendance_raw_events
           WHERE school_id = ? AND ingested_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY source`),
  ]);

  await controlAudit(user.id, 'viewed_school', `schools:${schoolId}`, { name: schools[0].name }, clientIp(req));
  return NextResponse.json({
    success: true,
    school: schools[0],
    devices,
    punches_24h: Number(punches24[0]?.n || 0),
    attendance_today: todayCounts,
    clock_health_today: clock,
    sms_48h: smsRecent,
    sync_events_7d: syncEvents,
    modules: {
      catalog: MODULE_CATALOG.map(m => ({ code: m.code, label: m.label })),
      enabled: moduleRows,
    },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });
  const { id } = await ctx.params;
  const schoolId = Number(id);
  const b = await req.json().catch(() => null);

  if (b?.action === 'set_module') {
    if (!isModuleCode(b.module_code)) return NextResponse.json({ error: 'Unknown module code' }, { status: 400 });
    await setSchoolModule({ schoolId, moduleCode: b.module_code, isEnabled: !!b.enabled });
    await controlAudit(user.id, 'feature_toggled', `schools:${schoolId}`,
      { module: b.module_code, enabled: !!b.enabled }, clientIp(req));
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
