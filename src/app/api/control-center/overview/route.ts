/**
 * GET /api/control-center/overview — the platform at a glance.
 * Schools by status, learners, staff, devices online/offline, SMS usage,
 * clock anomalies today, recent problems. Control-session gated + audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/control/db';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { denied } from '@/lib/control/guard';
import { controlCan } from '@/lib/control/permissions';
import changelog from '@/data/changelog.json';
import { deviceCounts, DEVICE_LIFECYCLE_SQL, DEVICE_ONLINE_SQL, type DeviceCounts } from '@/lib/control/devices';

const ZERO_COUNTS: DeviceCounts = { all: 0, in_service: 0, online: 0, offline: 0, suspended: 0, released: 0, retired: 0 };

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'dashboard.view')) return denied('dashboard.view');

  let devicesFailed = false;
  const one = async (sql: string, params: any[] = []) =>
    (await query(sql, params).catch(() => [{}])) as any[];

  const [schools, learners, staff, deviceN, sms24, anomalies, offline] = await Promise.all([
    one(`SELECT COUNT(*) total,
                SUM(status = 'active' OR status IS NULL) active,
                SUM(status = 'suspended') suspended
           FROM schools WHERE deleted_at IS NULL`),
    one(`SELECT COUNT(*) n FROM students WHERE deleted_at IS NULL AND status = 'active'`),
    one(`SELECT COUNT(*) n FROM staff WHERE deleted_at IS NULL AND status = 'active'`),
    // Same definitions as the device list (lib/control/devices): retired devices are counted apart and
    // never part of fleet health; "online" = heard from in the last 2 minutes.
    deviceCounts().catch((e) => { console.error('[control/overview] device counts failed', e); devicesFailed = true; return ZERO_COUNTS; }),
    one(`SELECT COUNT(*) sent, SUM(status = 'failed') failed FROM notification_outbox
          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`),
    one(`SELECT COUNT(*) n FROM device_clock_health WHERE local_date = CURDATE() AND status = 'anomaly'`),
    query(`SELECT d.sn, d.device_name, s.name AS school_name,
                  TIMESTAMPDIFF(MINUTE, d.last_seen, NOW()) AS offline_min
             FROM devices d LEFT JOIN schools s ON s.id = d.school_id
            WHERE (${DEVICE_LIFECYCLE_SQL}) = 'in_service' AND NOT ${DEVICE_ONLINE_SQL}
            ORDER BY d.last_seen ASC LIMIT 10`).catch(() => []) as Promise<any[]>,
  ]);

  const problems: Array<{ severity: string; text: string }> = [];
  if (devicesFailed) problems.push({ severity: 'critical', text: 'Device counts could not be loaded — the device figures above are not real' });
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
    // `total` = in service (what the fleet is); retired/suspended reported separately.
    devices: {
      total: deviceN.in_service, online: deviceN.online, offline: deviceN.offline,
      retired: deviceN.retired, suspended: deviceN.suspended, released: deviceN.released, all: deviceN.all,
    },
    sms_24h: { sent: Number(sms24[0]?.sent || 0), failed: Number(sms24[0]?.failed || 0) },
    clock_anomalies_today: Number(anomalies[0]?.n || 0),
    problems: problems.slice(0, 12),
    app_version: (changelog as any).app_version || null,
  });
}
