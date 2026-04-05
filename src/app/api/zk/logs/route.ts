import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/zk/logs
 *
 * Live-polling endpoint for the Device Observability Dashboard.
 * Reads from zk_device_logs (every event: heartbeats, data, errors).
 *
 * Query params:
 *   limit       (default 50, max 200)
 *   page        (default 1)
 *   device_sn
 *   event_type  HEARTBEAT | DATA_RECEIVED | DATA_PARSED | PUNCH_SAVED | ERROR
 *   status      success | failed
 *   matched     1 | 0
 *   date_from   YYYY-MM-DD
 *   date_to     YYYY-MM-DD
 *   search      (user_id LIKE)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { schoolId } = session;

  const url = new URL(req.url);
  const limit     = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit', 10) || '50', 10)));
  const page      = Math.max(1,               parseInt(url.searchParams.get('page', 10)  || '1',  10));
  const offset    = (page - 1) * limit;
  const deviceSn  = url.searchParams.get('device_sn')  || null;
  const eventType = url.searchParams.get('event_type') || null;
  const status    = url.searchParams.get('status')     || null;
  const matched   = url.searchParams.get('matched');   // '1' | '0' | null
  const dateFrom  = url.searchParams.get('date_from')  || null;
  const dateTo    = url.searchParams.get('date_to')    || null;
  const search    = url.searchParams.get('search')     || null;

  try {
    const conditions: string[] = ['1=1'];
    const params: unknown[]    = [];

    if (deviceSn) {
      conditions.push('zdl.device_sn = ?');
      params.push(deviceSn);
    }
    if (eventType) {
      conditions.push('zdl.event_type = ?');
      params.push(eventType);
    }
    if (status === 'success' || status === 'failed') {
      conditions.push('zdl.status = ?');
      params.push(status);
    }
    if (matched === '1' || matched === '0') {
      conditions.push('zdl.matched = ?');
      params.push(parseInt(matched, 10));
    }
    if (dateFrom) {
      conditions.push('zdl.created_at >= ?');
      params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
      conditions.push('zdl.created_at <= ?');
      params.push(`${dateTo} 23:59:59`);
    }
    if (search) {
      conditions.push('zdl.user_id LIKE ?');
      params.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');

    // ── Summary counters (last 24 h, scoped to school) ────────────────────
    const [summaryRows, countRows, dataRows] = await Promise.all([
      query(
        `SELECT
           COUNT(*) AS total_24h,
           SUM(CASE WHEN event_type = 'HEARTBEAT'                        THEN 1 ELSE 0 END) AS heartbeats_24h,
           SUM(CASE WHEN event_type = 'PUNCH_SAVED'                      THEN 1 ELSE 0 END) AS punches_24h,
           SUM(CASE WHEN status = 'failed'                               THEN 1 ELSE 0 END) AS errors_24h,
           SUM(CASE WHEN event_type = 'PUNCH_SAVED' AND matched = 0      THEN 1 ELSE 0 END) AS unmatched_24h,
           COUNT(DISTINCT device_sn)                                                         AS active_devices_24h
         FROM zk_device_logs
         WHERE created_at >= NOW() - INTERVAL 24 HOUR`,
        [],
      ),
      query(
        `SELECT COUNT(*) AS total FROM zk_device_logs zdl WHERE ${where}`,
        params,
      ),
      query(
        `SELECT
           zdl.id,
           zdl.device_sn,
           zdl.ip_address,
           zdl.event_type,
           zdl.table_name,
           zdl.record_count,
           zdl.user_id,
           zdl.check_time,
           zdl.matched,
           zdl.student_id,
           zdl.staff_id,
           zdl.status,
           zdl.error_message,
           zdl.created_at,
           d.device_name,
           d.location AS device_location,
           -- Resolve student name
           CONCAT(COALESCE(sp.first_name, ''), ' ', COALESCE(sp.last_name, '')) AS student_name,
           -- Resolve staff name
           CONCAT(COALESCE(tp.first_name, ''), ' ', COALESCE(tp.last_name, '')) AS staff_name
         FROM zk_device_logs zdl
         LEFT JOIN devices d
           ON d.sn = zdl.device_sn
         LEFT JOIN students stu
           ON stu.id = zdl.student_id AND stu.school_id = zdl.school_id
         LEFT JOIN people sp
           ON sp.id = stu.person_id
         LEFT JOIN staff stf
           ON stf.id = zdl.staff_id AND stf.school_id = zdl.school_id
         LEFT JOIN people tp
           ON tp.id = stf.person_id
         WHERE ${where}
         ORDER BY zdl.id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
    ]);

    const total      = Number((countRows as any[])[0]?.total || 0);
    const summary    = (summaryRows as any[])[0] || {};

    // Clean up whitespace-only names
    const rows = (dataRows as any[]).map(r => ({
      ...r,
      student_name: r.student_name?.trim() || null,
      staff_name:   r.staff_name?.trim()   || null,
    }));

    return NextResponse.json({
      success: true,
      summary: {
        total_24h:          Number(summary.total_24h          || 0),
        heartbeats_24h:     Number(summary.heartbeats_24h     || 0),
        punches_24h:        Number(summary.punches_24h        || 0),
        errors_24h:         Number(summary.errors_24h         || 0),
        unmatched_24h:      Number(summary.unmatched_24h      || 0),
        active_devices_24h: Number(summary.active_devices_24h || 0),
      },
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('[/api/zk/logs] Error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch device logs', error: err?.message },
      { status: 500 },
    );
  }
}
