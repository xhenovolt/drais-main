import { NextRequest, NextResponse } from 'next/server';
import { schoolLocalToday } from '@/lib/datetime/local-date';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/consolidated
 *
 * The "one record per student per day" view (DRAIS Phase 2). Unlike
 * /api/attendance/history (every raw punch, so one legitimate person can
 * appear many times a day — school entry, re-entry, multiple lessons,
 * multiple devices), this reads attendance_records: the engine's single
 * evaluated verdict row per (person, attendance_date), already deduped by
 * construction via its uk_person_day unique key. Raw punches are never
 * discarded — raw_event_count says how many contributed to each row, and
 * the client can drill into them with
 * /api/attendance/history?person_id=<id>&date_from=<date>&date_to=<date>.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { schoolId } = session;

  const moduleDenied = await checkModule(schoolId, 'attendance');
  if (moduleDenied) return moduleDenied;

  const url = new URL(req.url);
  const tab = url.searchParams.get('tab') || 'all'; // all | learners | staff
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limitRaw = url.searchParams.get('limit') || '50';
  const limit = limitRaw === 'all' ? 5000 : Math.min(250, Math.max(1, parseInt(limitRaw, 10) || 50));
  const offset = (page - 1) * limit;
  const dateFrom = url.searchParams.get('date_from') || schoolLocalToday();
  const dateTo = url.searchParams.get('date_to') || dateFrom;
  const classId = url.searchParams.get('class_id');
  const gender = url.searchParams.get('gender');
  const status = url.searchParams.get('status'); // present|late|absent|half_day|early_leave
  const search = url.searchParams.get('search');

  try {
    const conditions: string[] = ['r.school_id = ?', 'r.attendance_date BETWEEN ? AND ?'];
    const params: any[] = [schoolId, dateFrom, dateTo];

    if (tab === 'learners') conditions.push(`r.role_type = 'student'`);
    else if (tab === 'staff') conditions.push(`r.role_type = 'staff'`);

    if (status) {
      conditions.push('r.status = ?');
      params.push(status);
    }
    if (gender) {
      conditions.push('p.gender = ?');
      params.push(gender);
    }
    if (classId) {
      conditions.push(
        `EXISTS (
          SELECT 1
            FROM students s
            JOIN enrollments e ON e.student_id = s.id
           WHERE s.person_id = r.person_id
             AND e.status = 'active'
             AND e.class_id = ?
        )`,
      );
      params.push(Number(classId));
    }
    if (search) {
      conditions.push(`(LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ?)`);
      const s = `%${search.toLowerCase()}%`;
      params.push(s, s);
    }

    const where = conditions.join(' AND ');

    const countRows = await query(
      `SELECT COUNT(*) AS total
         FROM attendance_records r
         LEFT JOIN people p ON p.id = r.person_id
        WHERE ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);

    const rows = await query(
      `SELECT
         r.id, r.person_id, r.role_type, r.attendance_date,
         r.first_in_at, r.last_out_at, r.status,
         r.late_minutes, r.early_minutes, r.total_minutes,
         r.raw_event_count, r.is_provisional, r.provisional_reason,
         p.first_name, p.last_name, p.photo_url, p.gender,
         -- Scalar correlated subquery, NOT a JOIN-with-subquery-in-ON (TiDB
         -- rejects subqueries in a JOIN's ON condition). A student may hold
         -- 2+ simultaneous active enrollments (multi-program, migration 027)
         -- — pick one deterministic "primary" one so this stays one row per
         -- student per day, matching the table's own promise.
         (SELECT c2.name FROM enrollments e2
            LEFT JOIN programs pr2 ON pr2.id = e2.program_id
            JOIN classes c2 ON c2.id = e2.class_id
           WHERE e2.student_id = s.id AND e2.status = 'active'
           ORDER BY pr2.is_default DESC, e2.id DESC
           LIMIT 1) AS class_name,
         s.admission_no,
         stf.position AS staff_position,
         dep.name AS staff_department
       FROM attendance_records r
       LEFT JOIN people p ON p.id = r.person_id
       LEFT JOIN staff stf ON r.role_type = 'staff' AND stf.person_id = r.person_id AND stf.school_id = r.school_id AND stf.deleted_at IS NULL
       LEFT JOIN departments dep ON dep.id = stf.department_id
       LEFT JOIN students s ON s.person_id = p.id AND s.school_id = r.school_id
       WHERE ${where}
       ORDER BY r.attendance_date DESC, COALESCE(r.first_in_at, r.evaluated_at) DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    const data = (rows as any[]).map((row) => ({
      ...row,
      person_name: [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
    }));

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (err) {
    console.error('[attendance/consolidated] failed', err);
    return NextResponse.json({ error: 'Failed to load consolidated attendance' }, { status: 500 });
  }
}
