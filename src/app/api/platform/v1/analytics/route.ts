import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';

async function safe<T>(p: Promise<T>, fb: T) { try { return await p; } catch { return fb; } }

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req, ['analytics:read']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;

  const [tenantTotals, growth, subsBreakdown, smsGlobal, activitySchools] = await Promise.all([
    safe(query(
      `SELECT
         COUNT(*)                                                     AS total_schools,
         SUM(status = 'active')                                       AS active_schools,
         SUM(status = 'suspended')                                    AS suspended_schools,
         SUM(subscription_status = 'trial')                           AS trial_schools,
         SUM(subscription_status = 'expired')                         AS expired_schools
       FROM schools WHERE deleted_at IS NULL`,
    ) as Promise<any[]>, [{}]),
    safe(query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS new_schools
         FROM schools
        WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY month ORDER BY month ASC`,
    ) as Promise<any[]>, []),
    safe(query(
      `SELECT subscription_plan AS plan, COUNT(*) AS count
         FROM schools WHERE deleted_at IS NULL GROUP BY subscription_plan`,
    ) as Promise<any[]>, []),
    safe(query(
      `SELECT COUNT(*) AS c FROM comm_dispatch_log
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    ) as Promise<any[]>, [{ c: 0 }]),
    safe(query(
      `SELECT COUNT(DISTINCT school_id) AS c FROM sessions
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
    ) as Promise<any[]>, [{ c: 0 }]),
  ]);

  const t = tenantTotals[0] ?? {};
  const data = {
    tenants: {
      total:      Number(t.total_schools ?? 0),
      active:     Number(t.active_schools ?? 0),
      suspended:  Number(t.suspended_schools ?? 0),
      trial:      Number(t.trial_schools ?? 0),
      expired:    Number(t.expired_schools ?? 0),
    },
    growth_12_months: growth.map((g: any) => ({ month: g.month, new_schools: Number(g.new_schools) })),
    subscription_plans: subsBreakdown.map((s: any) => ({ plan: s.plan ?? 'unknown', count: Number(s.count) })),
    sms_30d:          Number(smsGlobal[0]?.c ?? 0),
    active_tenants_7d: Number(activitySchools[0]?.c ?? 0),
    generated_at:     new Date().toISOString(),
  };
  await finalizeAudit(ctx, req, 200);
  return ok(data, ctx.requestId, rateLimitHeaders(ctx));
}
