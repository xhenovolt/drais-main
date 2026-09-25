/**
 * GET /api/attendance/boarding-policy — this school's boarding attendance policy, the "reported to
 *     school" SMS template, live numbers for the current reporting period, and who changed what.
 * PUT /api/attendance/boarding-policy — change it (admin). Body:
 *     { mode: 'DAILY_PUNCH'|'REPORTED_ONCE', reportingPeriod: 'TERM'|'WEEK'|'CUSTOM_DAYS', periodDays?,
 *       reportedSmsEnabled?, smsTemplate? }
 *
 * The school is ALWAYS taken from the session. Changing the mode never rewrites past attendance: it
 * only governs dates from today onward (see boarding-policy.ts). Every change is audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';
import { canAny } from '@/lib/rbac/fallback';
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { localDateOf } from '@/lib/attendance/lessons/engine';
import { getBoardingPolicy, saveBoardingPolicy, getPeriodFor, DEFAULT_BOARDING_POLICY } from '@/lib/attendance/boarding-policy';

export const runtime = 'nodejs';

const DEFAULT_REPORTED_TEMPLATE = 'Dear Parent/Guardian, {name} has reported to {school} on {date}. Thank you.';
const EVENT = 'attendance.boarding.reported';

async function gate(req: NextRequest, write: boolean) {
  const s = await getSessionSchoolId(req);
  if (!s) return { err: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const denied = await checkModule(s.schoolId, 'attendance');
  if (denied) return { err: denied };
  const base = { userId: s.userId, schoolId: s.schoolId, isSuperAdmin: !!s.isSuperAdmin };
  const okay = write
    ? await canAny(base, ['attendance.boarding_policy.manage'], ['admin'])
    : await canAny(base, ['attendance.boarding_policy.manage', 'attendance.view'], ['admin']);
  if (!okay) return { err: NextResponse.json({ error: write ? 'Only a school administrator can change the boarding attendance policy' : 'Not allowed' }, { status: 403 }) };
  return { s: base };
}

async function loadTemplate(schoolId: number): Promise<{ id: number | null; template: string; active: boolean }> {
  const r = ((await query(
    `SELECT id, template_body, is_active FROM notification_policies WHERE school_id = ? AND event_type = ? ORDER BY id LIMIT 1`,
    [schoolId, EVENT],
  ).catch(() => [])) as any[])[0];
  return r ? { id: Number(r.id), template: r.template_body || DEFAULT_REPORTED_TEMPLATE, active: Number(r.is_active) === 1 } : { id: null, template: DEFAULT_REPORTED_TEMPLATE, active: false };
}

export async function GET(req: NextRequest) {
  const g = await gate(req, false);
  if ('err' in g && g.err) return g.err;
  const { schoolId } = g.s!;

  const tp = await resolveTimePolicy(schoolId);
  const today = localDateOf(Date.now(), tp.offsetMinutes);
  const policy = await getBoardingPolicy(schoolId, true);
  const period = await getPeriodFor(schoolId, policy, today);
  const tpl = await loadTemplate(schoolId);

  const counts = ((await query(
    `SELECT
       (SELECT COUNT(DISTINCT s.id) FROM students s JOIN enrollments e ON e.student_id = s.id AND e.status = 'active' AND e.deleted_at IS NULL
          WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.residency_status = 'boarding') AS boarders,
       (SELECT COUNT(*) FROM boarding_reports WHERE school_id = ? AND period_key = ?) AS reported`,
    [schoolId, schoolId, period.key],
  ).catch(() => [{ boarders: 0, reported: 0 }])) as any[])[0];

  const history = ((await query(
    `SELECT a.created_at, a.user_id, a.details, TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS who
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN people p ON p.id = u.person_id
      WHERE a.school_id = ? AND a.action = 'BOARDING_POLICY_CHANGED'
      ORDER BY a.id DESC LIMIT 10`,
    [schoolId],
  ).catch(() => [])) as any[]).map((r) => {
    let d: any = {}; try { d = typeof r.details === 'string' ? JSON.parse(r.details) : r.details ?? {}; } catch { /* ignore */ }
    return { at: r.created_at, by: r.who || (r.user_id ? `User #${r.user_id}` : 'System'), from: d.from?.mode ?? null, to: d.to?.mode ?? null, fromPeriod: d.from?.reportingPeriod ?? null, toPeriod: d.to?.reportingPeriod ?? null };
  });

  return NextResponse.json({
    success: true, policy, defaults: DEFAULT_BOARDING_POLICY, today,
    period: { key: period.key, label: period.label, start: period.start, end: period.end },
    numbers: { boarders: Number(counts?.boarders ?? 0), reported: Number(counts?.reported ?? 0) },
    sms: { template: tpl.template, active: tpl.active, defaultTemplate: DEFAULT_REPORTED_TEMPLATE },
    history,
  });
}

export async function PUT(req: NextRequest) {
  const g = await gate(req, true);
  if ('err' in g && g.err) return g.err;
  const { schoolId, userId } = g.s!;
  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const tp = await resolveTimePolicy(schoolId);
  const today = localDateOf(Date.now(), tp.offsetMinutes);
  const { policy, changed } = await saveBoardingPolicy(schoolId, userId, body, today);

  if (typeof body.smsTemplate === 'string' || body.reportedSmsEnabled !== undefined) {
    const template = (typeof body.smsTemplate === 'string' && body.smsTemplate.trim() ? body.smsTemplate.trim() : (await loadTemplate(schoolId)).template).slice(0, 480);
    const cur = await loadTemplate(schoolId);
    const active = policy.reportedSmsEnabled ? 1 : 0;
    if (cur.id) {
      await query(`UPDATE notification_policies SET template_body = ?, is_active = ? WHERE id = ? AND school_id = ?`, [template, active, cur.id, schoolId]);
    } else {
      await query(
        `INSERT INTO notification_policies (school_id, name, event_type, target_role, channel, conditions, template_body, is_active, daily_cap, created_by)
         VALUES (?, 'Boarding reported to school', ?, 'guardian', 'sms', NULL, ?, ?, 5000, ?)`,
        [schoolId, EVENT, template, active, userId],
      );
    }
  }
  return NextResponse.json({ success: true, policy, changed, appliesFrom: changed ? today : null });
}
