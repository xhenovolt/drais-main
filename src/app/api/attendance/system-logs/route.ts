import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/system-logs
 *
 * Query the system_logs table with filters.
 * Params: event_type, device_sn, limit (max 200), since_id (for polling), page
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const eventType = url.searchParams.get('event_type');
  const deviceSn = url.searchParams.get('device_sn');
  const sinceId = parseInt(url.searchParams.get('since_id', 10) || '0', 10) || 0;
  const page = Math.max(1, parseInt(url.searchParams.get('page', 10) || '1', 10));
  const rawLimit = parseInt(url.searchParams.get('limit', 10) || '100', 10);
  const limit = Math.min(Math.max(rawLimit, 1), 200);
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = [];
    const params: any[] = [];

    if (eventType) {
      conditions.push('sl.event_type = ?');
      params.push(eventType);
    }
    if (deviceSn) {
      conditions.push('sl.device_sn = ?');
      params.push(deviceSn);
    }
    if (sinceId > 0) {
      conditions.push('sl.id > ?');
      params.push(sinceId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count (skip for polling mode — just return rows)
    let total = 0;
    if (sinceId === 0) {
      const countResult = await query(
        `SELECT COUNT(*) AS total FROM system_logs sl ${where}`,
        params,
      );
      total = Number(countResult[0]?.total || 0);
    }

    const rows = await query(
      `SELECT
         sl.id, sl.device_sn, sl.event_type, sl.direction,
         sl.raw_data, sl.ip_address, sl.user_agent, sl.created_at,
         d.device_name
       FROM system_logs sl
       LEFT JOIN devices d ON sl.device_sn = d.sn
       ${where}
       ORDER BY sl.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    // Device health: check which devices haven't heartbeat in 2 min
    const offlineDevices = await query(
      `SELECT sn, device_name, last_seen,
              TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS seconds_ago
       FROM devices
       WHERE TIMESTAMPDIFF(SECOND, last_seen, NOW()) > 120
       ORDER BY last_seen DESC`,
      [],
    );

    return NextResponse.json({
      success: true,
      data: rows,
      offline_devices: offlineDevices || [],
      pagination: sinceId > 0
        ? { polling: true, returned: rows?.length || 0 }
        : { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('[system-logs GET] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch logs' }, { status: 500 });
  }
}

/**
 * DELETE /api/attendance/system-logs
 *
 * Cleanup: delete HEARTBEAT logs older than 7 days.
 * Only admins can run this.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const result = await query(
      `DELETE FROM system_logs
       WHERE event_type = 'HEARTBEAT' AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [],
    );
    const deleted = (result as any)?.affectedRows || 0;
    return NextResponse.json({ success: true, deleted, message: `Cleaned up ${deleted} old heartbeat logs` });
  } catch (err: any) {
    console.error('[system-logs DELETE] Error:', err);
    return NextResponse.json({ error: err.message || 'Cleanup failed' }, { status: 500 });
  }
}
