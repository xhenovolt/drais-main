/**
 * Control Center — cross-school communications overview.
 *   GET → last-30-days comm_dispatch_log rollup by channel + status,
 *        per-school breakdown, delivery rate. Read-only.
 *
 * Distinct from control-center/sms/route.ts (SMS billing/quota economics,
 * a single platform Africa's Talking account balance) — this reuses
 * comm_dispatch_log's existing channel/status columns for real send/
 * delivery counts across every channel, every school. No new tables.
 *
 * Control-session gated (getControlSession) — this is deliberately NOT
 * school_id-scoped, matching control-center/sms/route.ts and every other
 * Control Center route: operators see across every tenant by design.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession } from '@/lib/control/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const days = Math.min(90, Math.max(1, Number(sp.get('days')) || 30));

  const [byChannelStatus, byChannel, bySchool] = await Promise.all([
    query(
      `SELECT channel, status, COUNT(*) AS n
         FROM comm_dispatch_log
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY channel, status`,
      [days],
    ) as Promise<Array<{ channel: string; status: string; n: number }>>,
    query(
      `SELECT channel, COUNT(*) AS total,
              SUM(status IN ('sent','delivered','read')) AS sent,
              SUM(status = 'delivered' OR status = 'read') AS delivered,
              SUM(status = 'failed') AS failed
         FROM comm_dispatch_log
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY channel`,
      [days],
    ) as Promise<Array<{ channel: string; total: number; sent: number; delivered: number; failed: number }>>,
    query(
      `SELECT cdl.school_id, s.name AS school_name, cdl.channel, COUNT(*) AS n
         FROM comm_dispatch_log cdl
         LEFT JOIN schools s ON s.id = cdl.school_id
        WHERE cdl.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY cdl.school_id, s.name, cdl.channel
        ORDER BY n DESC
        LIMIT 200`,
      [days],
    ) as Promise<Array<{ school_id: number; school_name: string | null; channel: string; n: number }>>,
  ]);

  const overview = byChannel.map(r => ({
    channel: r.channel,
    total: Number(r.total),
    sent: Number(r.sent),
    delivered: Number(r.delivered),
    failed: Number(r.failed),
    deliveryRate: Number(r.sent) > 0 ? Math.round((Number(r.delivered) / Number(r.sent)) * 1000) / 10 : null,
  }));

  return NextResponse.json({
    success: true,
    days,
    overview,
    byChannelStatus,
    bySchool,
  });
}
