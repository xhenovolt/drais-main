/**
 * GET /api/attendance/breakdown?date=YYYY-MM-DD[&classId=n]
 * School-wide attendance by residence (day/boarding) x gender x outcome, with a reconciliation report.
 * School comes from the session only. One aggregated query; nothing is loaded into the browser per learner.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';
import { canAny } from '@/lib/rbac/fallback';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { localDateOf } from '@/lib/attendance/lessons/engine';
import { getBoardingPolicy, modeForDate, getPeriodFor } from '@/lib/attendance/boarding-policy';
import { buildBreakdown, loadBreakdownRows } from '@/lib/attendance/breakdown';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const s = await getSessionSchoolId(req);
  if (!s) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const denied = await checkModule(s.schoolId, 'attendance');
  if (denied) return denied;
  const base = { userId: s.userId, schoolId: s.schoolId, isSuperAdmin: !!s.isSuperAdmin };
  if (!(await canAny(base, ['attendance.view', 'attendance.record.view'], ['admin']))) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const tp = await resolveTimePolicy(s.schoolId);
  const q = req.nextUrl.searchParams.get('date');
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : localDateOf(Date.now(), tp.offsetMinutes);
  const classId = Number(req.nextUrl.searchParams.get('classId')) || undefined;

  const policy = await getBoardingPolicy(s.schoolId);
  const mode = modeForDate(policy, date);
  const period = mode === 'REPORTED_ONCE' ? await getPeriodFor(s.schoolId, policy, date) : null;

  const rows = await loadBreakdownRows(s.schoolId, date, period?.key ?? null, classId);
  const breakdown = buildBreakdown(rows, { date, boardingMode: mode, reportingPeriod: period?.label ?? null });
  if (!breakdown.reconciliation.ok) console.warn('[attendance/breakdown] reconciliation failed', s.schoolId, breakdown.reconciliation.issues);
  return NextResponse.json({ success: true, ...breakdown });
}
