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
import { getPlanByCode, assignPlanToSchool, schoolUsage, usageAgainst } from '@/lib/control/subscriptions';
import { schoolFootprint, hardDeleteSchool } from '@/lib/control/school-hard-delete';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const schoolId = Number(id);

  const schools = (await query(
    // No deleted_at filter — an operator must be able to view a soft-deleted /
    // archived school in order to restore it.
    `SELECT id, name, short_code, status, subscription_plan, subscription_status,
            subscription_end_date, district, country, email, phone, created_at, deleted_at
       FROM schools WHERE id = ? LIMIT 1`, [schoolId],
  )) as any[];
  if (!schools[0]) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  const list = async (sql: string, params: any[] = [schoolId]) =>
    (await query(sql, params).catch(() => [])) as any[];

  const [devices, punches24, todayCounts, clock, smsRecent, moduleRows, syncEvents, recentPunches] = await Promise.all([
    list(`SELECT sn, device_name, device_type, is_online, last_seen, lan_ip FROM devices WHERE school_id = ?`),
    list(`SELECT COUNT(*) n FROM attendance_raw_events WHERE school_id = ? AND punch_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`),
    list(`SELECT role_type, status, COUNT(*) n FROM attendance_records WHERE school_id = ? AND attendance_date = CURDATE() GROUP BY role_type, status`),
    list(`SELECT device_sn, confidence, status, likely_cause FROM device_clock_health WHERE school_id = ? AND local_date = CURDATE()`),
    list(`SELECT status, COUNT(*) n FROM notification_outbox WHERE school_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR) GROUP BY status`),
    getSchoolModuleStatus(schoolId).catch(() => []),
    list(`SELECT source, COUNT(*) n, MAX(ingested_at) latest FROM attendance_raw_events
           WHERE school_id = ? AND ingested_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY source`),
    // Recent activity — the last punches, with a resolved name where matched.
    // Read-only platform view: see a school operating WITHOUT impersonating it.
    list(`SELECT e.punch_at, e.role_type, e.device_sn, e.matched, e.device_user_id,
                 COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), NULL) AS who
            FROM attendance_raw_events e
            LEFT JOIN people p ON p.id = e.person_id
           WHERE e.school_id = ?
           ORDER BY e.punch_at DESC LIMIT 15`),
  ]);

  // Plan + usage (P5) — the school's plan limits vs its current usage.
  const plan = schools[0].subscription_plan ? await getPlanByCode(schools[0].subscription_plan).catch(() => null) : null;
  const usage = await schoolUsage(schoolId).catch(() => null);
  const planUsage = plan && usage ? usageAgainst(plan.limits, usage) : null;

  await controlAudit(user.id, 'viewed_school', `schools:${schoolId}`, { name: schools[0].name }, clientIp(req));
  return NextResponse.json({
    success: true,
    school: schools[0],
    plan,
    plan_usage: planUsage,
    devices,
    punches_24h: Number(punches24[0]?.n || 0),
    attendance_today: todayCounts,
    clock_health_today: clock,
    sms_48h: smsRecent,
    sync_events_7d: syncEvents,
    recent_punches: recentPunches,
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

  // ── Assign a catalog subscription plan to this school (P5) ──
  if (b?.action === 'assign_plan') {
    const code = String(b.plan_code || '').trim();
    if (!code) return NextResponse.json({ error: 'plan_code is required' }, { status: 400 });
    const res = await assignPlanToSchool(schoolId, code, user.id, clientIp(req));
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
    return NextResponse.json({ success: true, plan: res.plan });
  }

  // ── Suspend / activate a school (operate without its credentials) ──
  if (b?.action === 'set_status') {
    const status = ['active', 'suspended'].includes(b.status) ? b.status : null;
    if (!status) return NextResponse.json({ error: "status must be 'active' or 'suspended'" }, { status: 400 });
    const before = ((await query(`SELECT status FROM schools WHERE id = ? LIMIT 1`, [schoolId])) as any[])[0]?.status ?? null;
    await query(`UPDATE schools SET status = ?, updated_at = NOW() WHERE id = ?`, [status, schoolId]);
    await controlAudit(user.id, status === 'suspended' ? 'school_suspended' : 'school_activated', `schools:${schoolId}`,
      { from: before, to: status, reason: b.reason ?? null }, clientIp(req));
    return NextResponse.json({ success: true, status });
  }

  // ── Lifecycle: archive / soft-delete / restore (data is never hard-deleted) ──
  if (b?.action === 'archive') {
    await query(`UPDATE schools SET status = 'archived', updated_at = NOW() WHERE id = ?`, [schoolId]);
    await controlAudit(user.id, 'school_archived', `schools:${schoolId}`, { reason: b.reason ?? null }, clientIp(req));
    return NextResponse.json({ success: true, status: 'archived' });
  }
  if (b?.action === 'soft_delete') {
    await query(`UPDATE schools SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [schoolId]);
    await controlAudit(user.id, 'school_deleted', `schools:${schoolId}`, { reason: b.reason ?? null }, clientIp(req));
    return NextResponse.json({ success: true, deleted: true });
  }
  if (b?.action === 'restore') {
    await query(`UPDATE schools SET deleted_at = NULL, status = 'active', updated_at = NOW() WHERE id = ?`, [schoolId]);
    await controlAudit(user.id, 'school_restored', `schools:${schoolId}`, null, clientIp(req));
    return NextResponse.json({ success: true, status: 'active' });
  }

  // ── Permanent (hard) delete — irreversible; heavily guarded ──
  if (b?.action === 'footprint') {
    return NextResponse.json({ success: true, footprint: await schoolFootprint(schoolId) });
  }
  if (b?.action === 'hard_delete') {
    const res = await hardDeleteSchool({
      schoolId, confirmName: String(b.confirm_name || ''), force: b.force === true,
      operatorId: user.id, ip: clientIp(req),
    });
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
    return NextResponse.json({ success: true, ...res });
  }

  // ── Subscription / license management ──
  if (b?.action === 'set_subscription') {
    const plan = b.plan ? String(b.plan).slice(0, 40) : null;
    const subStatus = b.subscription_status ? String(b.subscription_status).slice(0, 40) : null;
    const endDate = b.subscription_end_date ? String(b.subscription_end_date).slice(0, 10) : null;
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return NextResponse.json({ error: 'subscription_end_date must be YYYY-MM-DD' }, { status: 400 });
    const before = ((await query(`SELECT subscription_plan, subscription_status, subscription_end_date FROM schools WHERE id = ? LIMIT 1`, [schoolId])) as any[])[0] ?? null;
    await query(
      `UPDATE schools SET
         subscription_plan = COALESCE(?, subscription_plan),
         subscription_status = COALESCE(?, subscription_status),
         subscription_end_date = COALESCE(?, subscription_end_date),
         updated_at = NOW()
       WHERE id = ?`,
      [plan, subStatus, endDate, schoolId],
    );
    await controlAudit(user.id, 'subscription_updated', `schools:${schoolId}`,
      { before, after: { plan, subscription_status: subStatus, subscription_end_date: endDate } }, clientIp(req));
    return NextResponse.json({ success: true });
  }

  // ── Extend the trial/subscription by N days (quick action) ──
  if (b?.action === 'extend_days') {
    const days = Math.max(1, Math.min(3650, Number(b.days) || 0));
    if (!days) return NextResponse.json({ error: 'days is required' }, { status: 400 });
    await query(
      `UPDATE schools SET subscription_end_date =
         DATE_ADD(COALESCE(subscription_end_date, CURDATE()), INTERVAL ? DAY), updated_at = NOW()
       WHERE id = ?`,
      [days, schoolId],
    );
    const after = ((await query(`SELECT subscription_end_date FROM schools WHERE id = ? LIMIT 1`, [schoolId])) as any[])[0]?.subscription_end_date ?? null;
    await controlAudit(user.id, 'subscription_extended', `schools:${schoolId}`, { days, new_end: after }, clientIp(req));
    return NextResponse.json({ success: true, subscription_end_date: after });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
