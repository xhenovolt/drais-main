import { NextRequest, NextResponse } from 'next/server';
import { getControlSession } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { query } from '@/lib/control/db';
import { getSmsRateBySchool, getParentCarrierBreakdownBySchool } from '@/lib/control/sms-accounting';

export const runtime = 'nodejs';

/**
 * GET /api/control-center/sms/accounting
 *
 * Per-school: average SMS/day (over days it actually sent, not diluted by
 * silent days), this month's total so far, a projected month-end total at
 * that rate, and the parent contact book split MTN vs Airtel by phone prefix
 * (best-effort — see sms/carrier.ts for the caveat on ported numbers).
 */
export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sms.balance.view')) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

  const [rates, carriers, schools] = await Promise.all([
    getSmsRateBySchool(30),
    getParentCarrierBreakdownBySchool(),
    query(`SELECT id, name FROM schools WHERE deleted_at IS NULL ORDER BY name ASC`).catch(() => []) as Promise<any[]>,
  ]);

  const rows = (schools as any[]).map((s) => {
    const id = Number(s.id);
    const rate = rates[id];
    const carrier = carriers[id] ?? { mtn: 0, airtel: 0, other: 0, total: 0 };
    return {
      school_id: id, name: s.name,
      avg_per_active_day: rate ? Math.round(rate.avgPerActiveDay * 10) / 10 : 0,
      active_days_window: rate?.activeDaysWindow ?? 0,
      total_window: rate?.totalWindow ?? 0,
      total_this_month: rate?.totalThisMonth ?? 0,
      projected_month_total: rate ? Math.round(rate.projectedMonthTotal) : 0,
      days_remaining_this_month: rate?.daysRemainingThisMonth ?? 0,
      contacts: carrier,
    };
  });

  return NextResponse.json({ success: true, rows });
}
