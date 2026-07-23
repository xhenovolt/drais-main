/**
 * GET /api/control-center/overview — the platform at a glance.
 * Schools by status, learners, staff, devices online/offline, SMS usage,
 * clock anomalies today, recent problems. Control-session gated + audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import changelog from '@/data/changelog.json';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const one = async (sql: string, params: any[] = []) =>
    (await query(sql, params).catch(() => [{}])) as any[];

  const [schools, learners, staff, devices, sms24, anomalies, offline] = await Promise.all([
    one(`SELECT COUNT(*) total,
                SUM(status = 'active' OR status IS NULL) active,
                SUM(status = 'suspended') suspended
           FROM schools WHERE deleted_at IS NULL`),
    one(`SELECT COUNT(*) n FROM students WHERE deleted_at IS NULL AND status = 'active'`),
    one(`SELECT COUNT(*) n FROM staff WHERE deleted_at IS NULL AND status = 'active'`),
    one(`SELECT COUNT(*) total, SUM(is_online = 1) online FROM devices`),
    one(`SELECT COUNT(*) sent, SUM(status = 'failed') failed FROM notification_outbox
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`),
    one(`SELECT COUNT(*) n FROM device_clock_health WHERE local_date = CURDATE() AND status = 'anomaly'`),
    query(`SELECT d.sn, d.device_name, s.name AS school_name,
                  TIMESTAMPDIFF(MINUTE, d.last_seen, NOW()) AS offline_min
             FROM devices d LEFT JOIN schools s ON s.id = d.school_id
            WHERE d.is_online = 0 ORDER BY d.last_seen ASC LIMIT 10`).catch(() => []) as Promise<any[]>,
  ]);

  const problems: Array<{ severity: string; text: string }> = [];
  if (Number(anomalies[0]?.n || 0) > 0) problems.push({ severity: 'critical', text: `${anomalies[0].n} device clock anomaly(ies) today — attendance times at risk` });
  if (Number(sms24[0]?.failed || 0) > 0) problems.push({ severity: 'warning', text: `${sms24[0].failed} SMS failed in the last 24h` });
  for (const d of offline as any[]) {
    problems.push({ severity: 'warning', text: `${d.device_name || d.sn} (${d.school_name || 'unknown school'}) offline ${d.offline_min > 120 ? Math.round(d.offline_min / 60) + 'h' : (d.offline_min ?? '?') + ' min'}` });
  }

  await controlAudit(user.id, 'viewed_overview', 'overview', null, clientIp(req));
  return NextResponse.json({
    success: true,
    schools: {
      total: Number(schools[0]?.total || 0),
      active: Number(schools[0]?.active || 0),
      suspended: Number(schools[0]?.suspended || 0),
    },
    learners: Number(learners[0]?.n || 0),
    staff: Number(staff[0]?.n || 0),
    devices: { total: Number(devices[0]?.total || 0), online: Number(devices[0]?.online || 0) },
    sms_24h: { sent: Number(sms24[0]?.sent || 0), failed: Number(sms24[0]?.failed || 0) },
    clock_anomalies_today: Number(anomalies[0]?.n || 0),
    problems: problems.slice(0, 12),
    app_version: (changelog as any).app_version || null,
  });
}
