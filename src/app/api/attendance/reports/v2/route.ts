/**
 * GET /api/attendance/reports/v2
 *
 * Phase 6 — canonical detail-level attendance report.  Reads
 * attendance_records (Phase 3 canonical) through the single
 * report-builder service. Old surfaces (/api/attendance/reports,
 * /api/attendance/zk/reports, /api/attendance/unified) remain
 * untouched until the Phase 6 cutover commit replaces them with a
 * 301 redirect into this route.
 *
 * Query params
 * ------------
 *   from         YYYY-MM-DD (required)
 *   to           YYYY-MM-DD (required)
 *   role         student | staff
 *   status       present | late | absent | half_day | early_leave (comma-separated)
 *   class_ids    comma-separated numeric class ids
 *   limit        default 5000, max 50000
 *   format       json (default) | csv
 *   school_id    super-admin only
 *
 * Auth: session-scoped. Super-admin can query any school via
 * school_id; everyone else gets their own school.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { buildDetailReport, type AttendanceStatus } from '@/lib/attendance/report-builder';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');
  if (!from || !to) {
    return NextResponse.json(
      { error: '`from` and `to` query params are required (YYYY-MM-DD)' },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json(
      { error: '`from`/`to` must be YYYY-MM-DD' },
      { status: 400 },
    );
  }

  const schoolIdRaw = Number(url.searchParams.get('school_id'));
  const schoolId =
    session.isSuperAdmin && Number.isFinite(schoolIdRaw) && schoolIdRaw > 0
      ? schoolIdRaw
      : session.schoolId;

  const roleParam = url.searchParams.get('role');
  const roleType =
    roleParam === 'student' || roleParam === 'staff'
      ? roleParam
      : undefined;

  const statusParam = url.searchParams.get('status');
  const validStatuses: AttendanceStatus[] = [
    'present', 'late', 'absent', 'half_day', 'early_leave', 'holiday', 'weekend',
  ];
  const statusIn = statusParam
    ? statusParam.split(',').map(s => s.trim()).filter((s): s is AttendanceStatus =>
        validStatuses.includes(s as AttendanceStatus),
      )
    : undefined;

  const classIdsParam = url.searchParams.get('class_ids');
  const classIds = classIdsParam
    ? classIdsParam.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0)
    : undefined;

  const limit = Number(url.searchParams.get('limit')) || undefined;

  const rows = await buildDetailReport({
    schoolId, fromDate: from, toDate: to, roleType, statusIn, classIds, limit,
  });

  const format = url.searchParams.get('format');
  if (format === 'csv') {
    return new Response(rowsToCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="attendance_${from}_${to}.csv"`,
      },
    });
  }

  return NextResponse.json({
    success: true,
    schoolId,
    fromDate: from,
    toDate: to,
    count: rows.length,
    rows,
  });
}

function rowsToCsv(rows: ReadonlyArray<object>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    const obj = r as Record<string, unknown>;
    lines.push(headers.map(h => escape(obj[h])).join(','));
  }
  return lines.join('\n');
}
