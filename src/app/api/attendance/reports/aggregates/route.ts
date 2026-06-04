/**
 * GET /api/attendance/reports/aggregates
 *
 * Phase 6 — dashboard-style aggregate bucket report. Reads
 * attendance_daily_aggregates with auto-refresh-on-stale fallthrough.
 * One row per (school, class, date, role, status) bucket.
 *
 * Query params: same shape as /v2 minus `format` (always JSON).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { buildAggregateReport, type AttendanceStatus } from '@/lib/attendance/report-builder';

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

  const buckets = await buildAggregateReport({
    schoolId, fromDate: from, toDate: to, roleType, statusIn, classIds,
  });

  return NextResponse.json({
    success: true,
    schoolId,
    fromDate: from,
    toDate: to,
    count: buckets.length,
    buckets,
  });
}
