import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { ADMISSION_STATUSES } from '@/lib/admissions/mode';

const num = (v: string | null, dflt: number, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  if (v == null) return dflt;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'admissions.applicant.view', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  const status   = sp.get('status');
  const search   = sp.get('search');
  const page     = num(sp.get('page'),     1, 1);
  const per_page = num(sp.get('per_page'), 50, 1, 200);
  const offset   = (page - 1) * per_page;

  const where: string[] = ['a.school_id = ?', 'a.deleted_at IS NULL'];
  const params: any[]   = [session.schoolId];
  if (status && (ADMISSION_STATUSES as readonly string[]).includes(status)) {
    where.push('a.status = ?'); params.push(status);
  }
  if (search) {
    where.push('(LOWER(a.first_name) LIKE ? OR LOWER(a.last_name) LIKE ? OR a.application_no LIKE ?)');
    const term = `%${search.toLowerCase()}%`;
    params.push(term, term, `%${search}%`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const conn = await getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT a.id, a.application_no, a.first_name, a.last_name, a.other_name,
              a.gender, a.date_of_birth,
              a.applicant_phone, a.guardian_name, a.guardian_phone,
              a.desired_class_id, c.name AS desired_class_name,
              a.status, a.created_at, a.updated_at, a.enrolled_student_id
         FROM admissions a
         LEFT JOIN classes c ON c.id = a.desired_class_id
         ${whereSql}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ${per_page} OFFSET ${offset}`,
      params,
    );
    const [[countRow]]: any = await conn.execute(
      `SELECT COUNT(*) AS total FROM admissions a ${whereSql}`,
      params,
    );
    const [counts]: any = await conn.execute(
      `SELECT status, COUNT(*) AS n
         FROM admissions
        WHERE school_id = ? AND deleted_at IS NULL
        GROUP BY status`,
      [session.schoolId],
    );
    return NextResponse.json({
      success: true,
      data:    rows,
      total:   Number(countRow.total) || 0,
      page,
      per_page,
      counts,
    });
  } finally { await conn.end(); }
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'admissions.applicant.create', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const { first_name, last_name } = body;
  if (!first_name || !last_name) {
    return NextResponse.json({ error: 'first_name and last_name required' }, { status: 400 });
  }

  const conn = await getConnection();
  try {
    // Auto-generate an application number per school per year. Format
    // APP-2026-000123. Lightweight (no separate sequence table).
    const year = new Date().getFullYear();
    const [[countRow]]: any = await conn.execute(
      `SELECT COUNT(*) AS n FROM admissions
        WHERE school_id = ? AND application_no LIKE ?`,
      [session.schoolId, `APP-${year}-%`],
    );
    const next = (Number(countRow.n) || 0) + 1;
    const application_no = `APP-${year}-${String(next).padStart(6, '0')}`;

    const [r]: any = await conn.execute(
      `INSERT INTO admissions
         (school_id, application_no, first_name, last_name, other_name,
          gender, date_of_birth, nationality_id, district_id,
          applicant_phone, applicant_email,
          guardian_name, guardian_phone, guardian_email, guardian_relation,
          desired_class_id, desired_stream_id, desired_term_id, desired_academic_year_id,
          previous_school, notes, source, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.schoolId, application_no,
        first_name, last_name, body.other_name ?? null,
        body.gender ?? null, body.date_of_birth ?? null,
        body.nationality_id ?? null, body.district_id ?? null,
        body.applicant_phone ?? null, body.applicant_email ?? null,
        body.guardian_name ?? null, body.guardian_phone ?? null,
        body.guardian_email ?? null, body.guardian_relation ?? null,
        body.desired_class_id ?? null, body.desired_stream_id ?? null,
        body.desired_term_id ?? null, body.desired_academic_year_id ?? null,
        body.previous_school ?? null, body.notes ?? null,
        body.source ?? 'admin_intake',
        session.userId,
      ],
    );
    await conn.execute(
      `INSERT INTO admission_audit (admission_id, school_id, from_status, to_status, actor_user_id, reason)
       VALUES (?, ?, NULL, 'applicant', ?, ?)`,
      [r.insertId, session.schoolId, session.userId, 'created via admin intake'],
    );
    return NextResponse.json({ success: true, id: r.insertId, application_no }, { status: 201 });
  } finally { await conn.end(); }
}
