import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/zk/pipeline
 *
 * Serves the 3-tab Raw-First Pipeline dashboard:
 *   tab=raw      → zk_raw_logs   (one row per HTTP exchange)
 *   tab=parsed   → zk_parsed_logs (one row per record)
 *   tab=errors   → zk_parsed_logs WHERE status='failed'
 *
 * Common query params:
 *   limit, page, device_sn, date_from, date_to, search
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { schoolId } = session;

  const url = new URL(req.url);
  const tab       = (url.searchParams.get('tab') || 'raw').toLowerCase();
  const limit     = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit', 10) || '50', 10)));
  const page      = Math.max(1, parseInt(url.searchParams.get('page', 10) || '1', 10));
  const offset    = (page - 1) * limit;
  const deviceSn  = url.searchParams.get('device_sn') || null;
  const dateFrom  = url.searchParams.get('date_from') || null;
  const dateTo    = url.searchParams.get('date_to') || null;
  const search    = url.searchParams.get('search') || null;
  const tableName = url.searchParams.get('table_name') || null;

  try {
    if (tab === 'raw') {
      return await handleRaw(schoolId, { limit, offset, page, deviceSn, dateFrom, dateTo, search });
    } else if (tab === 'parsed') {
      return await handleParsed(schoolId, { limit, offset, page, deviceSn, dateFrom, dateTo, search, tableName, errorsOnly: false });
    } else if (tab === 'errors') {
      return await handleParsed(schoolId, { limit, offset, page, deviceSn, dateFrom, dateTo, search, tableName, errorsOnly: true });
    } else {
      return NextResponse.json({ error: 'Invalid tab. Use: raw, parsed, errors' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[/api/zk/pipeline] Error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch pipeline data', error: err?.message },
      { status: 500 },
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Filters {
  limit: number;
  offset: number;
  page: number;
  deviceSn: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string | null;
}

interface ParsedFilters extends Filters {
  tableName: string | null;
  errorsOnly: boolean;
}

async function handleRaw(schoolId: number, f: Filters) {
  const conds: string[] = ['1=1'];
  const params: unknown[] = [];

  if (f.deviceSn) { conds.push('r.device_sn = ?'); params.push(f.deviceSn); }
  if (f.dateFrom) { conds.push('r.created_at >= ?'); params.push(`${f.dateFrom} 00:00:00`); }
  if (f.dateTo)   { conds.push('r.created_at <= ?'); params.push(`${f.dateTo} 23:59:59`); }
  if (f.search)   { conds.push('(r.raw_body LIKE ? OR r.device_sn LIKE ?)'); params.push(`%${f.search}%`, `%${f.search}%`); }

  const where = conds.join(' AND ');

  const [summaryRows, countRows, dataRows] = await Promise.all([
    query(
      `SELECT
         COUNT(*) AS total_24h,
         SUM(CASE WHEN http_method = 'GET'  THEN 1 ELSE 0 END) AS gets_24h,
         SUM(CASE WHEN http_method = 'POST' THEN 1 ELSE 0 END) AS posts_24h,
         COUNT(DISTINCT device_sn) AS devices_24h
       FROM zk_raw_logs
       WHERE created_at >= NOW() - INTERVAL 24 HOUR`,
      [],
    ),
    query(`SELECT COUNT(*) AS total FROM zk_raw_logs r WHERE ${where}`, params),
    query(
      `SELECT
         r.id,
         r.device_sn,
         r.http_method,
         r.query_string,
         LEFT(r.raw_body, 500) AS raw_body_preview,
         LENGTH(r.raw_body) AS body_length,
         r.source_ip,
         r.user_agent,
         r.endpoint,
         r.created_at
       FROM zk_raw_logs r
       WHERE ${where}
       ORDER BY r.id DESC
       LIMIT ${f.limit} OFFSET ${f.offset}`,
      params,
    ),
  ]);

  const summary = (summaryRows as any[])[0] || {};
  const total = Number((countRows as any[])[0]?.total || 0);

  return NextResponse.json({
    success: true,
    tab: 'raw',
    summary: {
      total_24h:   Number(summary.total_24h   || 0),
      gets_24h:    Number(summary.gets_24h    || 0),
      posts_24h:   Number(summary.posts_24h   || 0),
      devices_24h: Number(summary.devices_24h || 0),
    },
    data: dataRows,
    pagination: { page: f.page, limit: f.limit, total, totalPages: Math.ceil(total / f.limit) },
  });
}

async function handleParsed(schoolId: number, f: ParsedFilters) {
  const conds: string[] = ['1=1'];
  const params: unknown[] = [];

  if (f.errorsOnly) { conds.push("p.status = 'failed'"); }
  if (f.deviceSn)   { conds.push('p.device_sn = ?'); params.push(f.deviceSn); }
  if (f.tableName)  { conds.push('p.table_name = ?'); params.push(f.tableName); }
  if (f.dateFrom)   { conds.push('p.created_at >= ?'); params.push(`${f.dateFrom} 00:00:00`); }
  if (f.dateTo)     { conds.push('p.created_at <= ?'); params.push(`${f.dateTo} 23:59:59`); }
  if (f.search)     { conds.push('(p.user_id LIKE ? OR p.raw_line LIKE ? OR p.error_message LIKE ?)'); params.push(`%${f.search}%`, `%${f.search}%`, `%${f.search}%`); }

  const where = conds.join(' AND ');

  const [summaryRows, countRows, dataRows] = await Promise.all([
    query(
      `SELECT
         COUNT(*) AS total_24h,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_24h,
         SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END) AS failed_24h,
         SUM(CASE WHEN matched = 1         THEN 1 ELSE 0 END) AS matched_24h,
         SUM(CASE WHEN matched = 0 AND table_name = 'ATTLOG' THEN 1 ELSE 0 END) AS unmatched_24h,
         COUNT(DISTINCT device_sn) AS devices_24h
       FROM zk_parsed_logs
       WHERE created_at >= NOW() - INTERVAL 24 HOUR`,
      [],
    ),
    query(`SELECT COUNT(*) AS total FROM zk_parsed_logs p WHERE ${where}`, params),
    query(
      `SELECT
         p.id,
         p.raw_log_id,
         p.device_sn,
         p.table_name,
         p.raw_line,
         p.user_id,
         p.check_time,
         p.verify_type,
         p.inout_mode,
         p.work_code,
         p.log_id,
         p.matched,
         p.student_id,
         p.staff_id,
         p.status,
         p.error_message,
         p.created_at,
         d.device_name,
         d.location AS device_location,
         CONCAT(COALESCE(sp.first_name, ''), ' ', COALESCE(sp.last_name, '')) AS student_name,
         CONCAT(COALESCE(tp.first_name, ''), ' ', COALESCE(tp.last_name, '')) AS staff_name
       FROM zk_parsed_logs p
       LEFT JOIN devices d ON d.sn = p.device_sn
       LEFT JOIN students stu ON stu.id = p.student_id AND stu.school_id = p.school_id
       LEFT JOIN people sp ON sp.id = stu.person_id
       LEFT JOIN staff stf ON stf.id = p.staff_id AND stf.school_id = p.school_id
       LEFT JOIN people tp ON tp.id = stf.person_id
       WHERE ${where}
       ORDER BY p.id DESC
       LIMIT ${f.limit} OFFSET ${f.offset}`,
      params,
    ),
  ]);

  const summary = (summaryRows as any[])[0] || {};
  const total = Number((countRows as any[])[0]?.total || 0);

  const rows = (dataRows as any[]).map(r => ({
    ...r,
    student_name: r.student_name?.trim() || null,
    staff_name:   r.staff_name?.trim()   || null,
  }));

  return NextResponse.json({
    success: true,
    tab: f.errorsOnly ? 'errors' : 'parsed',
    summary: {
      total_24h:     Number(summary.total_24h     || 0),
      success_24h:   Number(summary.success_24h   || 0),
      failed_24h:    Number(summary.failed_24h    || 0),
      matched_24h:   Number(summary.matched_24h   || 0),
      unmatched_24h: Number(summary.unmatched_24h || 0),
      devices_24h:   Number(summary.devices_24h   || 0),
    },
    data: rows,
    pagination: { page: f.page, limit: f.limit, total, totalPages: Math.ceil(total / f.limit) },
  });
}
