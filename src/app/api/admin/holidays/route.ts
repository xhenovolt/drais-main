/**
 * GET  /api/admin/holidays         — list holidays for the caller's
 *                                    school. Optional ?year=YYYY
 *                                    filter; defaults to current year.
 *                                    National (school_id IS NULL)
 *                                    rows are always included.
 *
 * POST /api/admin/holidays         — create a holiday. Body:
 *                                    { holiday_date, name, scope?,
 *                                      applies_to_classes? }
 *                                    scope defaults to 'school'.
 *
 * Phase 3's rule evaluator already reads from this table — the
 * attendance engine's evaluateDay step calls isHolidayForSchool,
 * which suppresses the absent/late verdicts on these dates. Without
 * this UI the table stays empty and the suppression never fires.
 *
 * Auth: any authenticated school admin can create/list for their
 * own school. Super-admin can target any school via ?school_id /
 * body.school_id (national rows = NULL school_id need super-admin).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { ensureAttendanceEngineSchema } from '@/lib/attendance/migrations/attendance-tables-schema';

export const runtime = 'nodejs';

const VALID_SCOPES = new Set(['national', 'school', 'class']);

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await ensureAttendanceEngineSchema();

  const url = new URL(req.url);
  const yearRaw = Number(url.searchParams.get('year'));
  const year = Number.isFinite(yearRaw) && yearRaw > 1900 ? yearRaw : new Date().getFullYear();

  const targetSchoolId =
    session.isSuperAdmin && Number(url.searchParams.get('school_id'))
      ? Number(url.searchParams.get('school_id'))
      : session.schoolId;

  const rows = await query(
    `SELECT id, school_id, holiday_date, name, scope, applies_to_classes, created_at
       FROM holidays
      WHERE (school_id = ? OR school_id IS NULL)
        AND YEAR(holiday_date) = ?
      ORDER BY holiday_date ASC`,
    [targetSchoolId, year],
  );

  return NextResponse.json({ success: true, year, holidays: rows });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await ensureAttendanceEngineSchema();

  let body: {
    holiday_date?: string;
    name?: string;
    scope?: 'national' | 'school' | 'class';
    applies_to_classes?: string | null;
    school_id?: number | null;   // super-admin only; null = national row
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.holiday_date || !body.name) {
    return NextResponse.json(
      { error: 'holiday_date and name are required' },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.holiday_date)) {
    return NextResponse.json(
      { error: 'holiday_date must be YYYY-MM-DD' },
      { status: 400 },
    );
  }
  const scope = body.scope ?? 'school';
  if (!VALID_SCOPES.has(scope)) {
    return NextResponse.json({ error: `Invalid scope: ${scope}` }, { status: 400 });
  }

  // Super-admin can create national rows (school_id NULL) or target
  // another school. Everyone else is pinned to their own.
  let targetSchoolId: number | null;
  if (session.isSuperAdmin) {
    if (body.school_id === null) targetSchoolId = null;
    else if (body.school_id !== undefined) targetSchoolId = body.school_id;
    else targetSchoolId = session.schoolId;
  } else {
    targetSchoolId = session.schoolId;
  }

  try {
    const result = (await query(
      `INSERT INTO holidays
         (school_id, holiday_date, name, scope, applies_to_classes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        targetSchoolId,
        body.holiday_date,
        body.name,
        scope,
        body.applies_to_classes ?? null,
        session.userId,
      ],
    )) as { insertId?: number };

    return NextResponse.json({
      success: true,
      holiday: {
        id: result?.insertId ?? null,
        school_id: targetSchoolId,
        holiday_date: body.holiday_date,
        name: body.name,
        scope,
        applies_to_classes: body.applies_to_classes ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The UNIQUE(school_id, holiday_date, name) constraint provides
    // idempotency at the SQL layer; we surface a clean 409 here.
    if (/duplicate/i.test(msg)) {
      return NextResponse.json(
        { error: 'Holiday already exists for this date + name' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
