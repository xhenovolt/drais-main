import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { checkAnyPermission } from '@/lib/rbac';
import {
  loadAllSchoolHours,
  upsertSchoolHours,
  deleteSchoolHoursRow,
  type SchoolHoursAudience,
  type UpsertSchoolHoursInput,
} from '@/lib/school-hours';

/**
 * Per-school working & study hours.
 *
 *   GET    /api/admin/school-hours    → current school's full schedule
 *   PUT    /api/admin/school-hours    → upsert N rows in one batch
 *   DELETE /api/admin/school-hours    → soft-archive one row
 *
 * Scope: always the caller's own school (multi-tenant isolation via
 * getSessionSchoolId). Super-admin cross-school edits go through the
 * school-selection flow that switches session.schoolId.
 *
 * The PUT body shape matches the settings UI: an array of rows, each
 * specifying audience + dayOfWeek + start/end/grace/closed. The route
 * validates each row's HH:MM shape, then upsertSchoolHours decides
 * insert-vs-update via the UNIQUE (school, audience, day) key.
 */

const VALID_AUDIENCES: SchoolHoursAudience[] = ['student', 'staff'];

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  try {
    const rows = await loadAllSchoolHours(session.schoolId);
    return NextResponse.json({ success: true, schoolId: session.schoolId, rows });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: 'Failed to load school hours', message: String(err) },
      { status: 500 },
    );
  }
}

interface PutBody {
  rows?: Array<{
    audience:          string;
    dayOfWeek:         number | null;
    startTime:         string;
    endTime:           string;
    lateAfterMinutes?: number | null;
    isClosed?:         boolean;
    notes?:            string | null;
  }>;
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const denied = await checkAnyPermission(session.userId, session.schoolId, ['school.update'], session.isSuperAdmin);
  if (denied) return denied;
  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ success: false, error: 'rows[] required' }, { status: 400 });
  }

  // Validate each row's shape before touching the DB. A bad row blocks
  // the WHOLE request — schools sending bulk edits get one clear error
  // rather than partial writes.
  const normalised: UpsertSchoolHoursInput[] = [];
  for (let i = 0; i < body.rows.length; i++) {
    const r = body.rows[i];
    if (!VALID_AUDIENCES.includes(r.audience as SchoolHoursAudience)) {
      return NextResponse.json(
        { success: false, error: `rows[${i}].audience must be 'student' or 'staff'` },
        { status: 400 },
      );
    }
    if (r.dayOfWeek !== null && (typeof r.dayOfWeek !== 'number' || r.dayOfWeek < 0 || r.dayOfWeek > 6)) {
      return NextResponse.json(
        { success: false, error: `rows[${i}].dayOfWeek must be 0-6 or null` },
        { status: 400 },
      );
    }
    if (typeof r.startTime !== 'string' || !/^\d{2}:\d{2}$/.test(r.startTime)) {
      return NextResponse.json(
        { success: false, error: `rows[${i}].startTime must be HH:MM` },
        { status: 400 },
      );
    }
    if (typeof r.endTime !== 'string' || !/^\d{2}:\d{2}$/.test(r.endTime)) {
      return NextResponse.json(
        { success: false, error: `rows[${i}].endTime must be HH:MM` },
        { status: 400 },
      );
    }
    if (r.lateAfterMinutes != null && (typeof r.lateAfterMinutes !== 'number' || r.lateAfterMinutes < 0 || r.lateAfterMinutes > 240)) {
      return NextResponse.json(
        { success: false, error: `rows[${i}].lateAfterMinutes must be 0-240 or null` },
        { status: 400 },
      );
    }
    normalised.push({
      audience:          r.audience as SchoolHoursAudience,
      dayOfWeek:         r.dayOfWeek,
      startTime:         r.startTime,
      endTime:           r.endTime,
      lateAfterMinutes:  r.lateAfterMinutes ?? null,
      isClosed:          Boolean(r.isClosed),
      notes:             r.notes ?? null,
    });
  }

  try {
    const result = await upsertSchoolHours({
      schoolId:  session.schoolId,
      createdBy: session.userId ?? null,
      rows:      normalised,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: 'Failed to save school hours', message: String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const denied = await checkAnyPermission(session.userId, session.schoolId, ['school.update'], session.isSuperAdmin);
  if (denied) return denied;
  const url = new URL(req.url);
  const audience = url.searchParams.get('audience');
  const dayParam = url.searchParams.get('dayOfWeek');
  if (!audience || !VALID_AUDIENCES.includes(audience as SchoolHoursAudience)) {
    return NextResponse.json(
      { success: false, error: "audience query param required: 'student' or 'staff'" },
      { status: 400 },
    );
  }
  const dayOfWeek = dayParam === null || dayParam === '' || dayParam === 'null'
    ? null
    : Number.parseInt(dayParam, 10);
  if (dayOfWeek !== null && (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) {
    return NextResponse.json(
      { success: false, error: 'dayOfWeek must be 0-6 or null' },
      { status: 400 },
    );
  }

  try {
    await deleteSchoolHoursRow({
      schoolId: session.schoolId,
      audience: audience as SchoolHoursAudience,
      dayOfWeek,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete row', message: String(err) },
      { status: 500 },
    );
  }
}
