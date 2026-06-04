/**
 * GET /api/admin/device-alerts
 *
 * Lists device_alerts rows produced by Phase 2's cron sweeper.
 * Default scope: open alerts (acknowledged_at IS NULL) for the
 * caller's school.
 *
 * Query params:
 *   status=open|acked|all        default 'open'
 *   severity=info|warning|critical (optional)
 *   sn=<device serial>           (optional)
 *   limit                        default 200, max 1000
 *
 * Super-admin can query across schools with ?school_id=.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { ensureDeviceOwnershipSchema } from '@/lib/devices/migrations/devices-ownership-schema';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await ensureDeviceOwnershipSchema();

  const url = new URL(req.url);
  const status = (url.searchParams.get('status') || 'open').toLowerCase();
  const severity = url.searchParams.get('severity');
  const sn = url.searchParams.get('sn');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), 1000);

  const schoolIdRaw = Number(url.searchParams.get('school_id'));
  const targetSchoolId =
    session.isSuperAdmin && Number.isFinite(schoolIdRaw) && schoolIdRaw > 0
      ? schoolIdRaw
      : session.schoolId;

  const where: string[] = ['(a.school_id = ? OR a.school_id IS NULL)'];
  const params: unknown[] = [targetSchoolId];

  if (status === 'open') where.push('a.acknowledged_at IS NULL');
  else if (status === 'acked') where.push('a.acknowledged_at IS NOT NULL');
  // 'all' = no status filter

  if (severity && ['info', 'warning', 'critical'].includes(severity)) {
    where.push('a.severity = ?');
    params.push(severity);
  }
  if (sn) {
    where.push('a.device_sn = ?');
    params.push(sn);
  }

  const rows = await query(
    `SELECT a.id, a.device_sn, a.school_id, a.severity, a.code, a.message,
            a.created_at, a.acknowledged_at, a.acknowledged_by,
            d.device_name, d.location
       FROM device_alerts a
       LEFT JOIN devices d ON d.sn = a.device_sn
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT ?`,
    [...params, limit],
  );

  // Per-severity rollup so the UI can pin counts at the top.
  const countsRows = (await query(
    `SELECT severity, COUNT(*) AS n
       FROM device_alerts
      WHERE (school_id = ? OR school_id IS NULL)
        AND acknowledged_at IS NULL
      GROUP BY severity`,
    [targetSchoolId],
  )) as Array<{ severity: string; n: number }>;
  const counts: Record<string, number> = { info: 0, warning: 0, critical: 0 };
  for (const r of countsRows) counts[r.severity] = Number(r.n);

  return NextResponse.json({ success: true, alerts: rows, openCounts: counts });
}
