import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { canTransition, ADMISSION_STATUSES, type AdmissionStatus } from '@/lib/admissions/mode';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'admissions.applicant.view', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const { id } = await params;
  const conn = await getConnection();
  try {
    const [rows]: any = await conn.execute(
      `SELECT a.*,
              c.name  AS desired_class_name,
              st.name AS desired_stream_name,
              t.name  AS desired_term_name,
              ay.name AS desired_year_name
         FROM admissions a
         LEFT JOIN classes        c  ON c.id  = a.desired_class_id
         LEFT JOIN streams        st ON st.id = a.desired_stream_id
         LEFT JOIN terms          t  ON t.id  = a.desired_term_id
         LEFT JOIN academic_years ay ON ay.id = a.desired_academic_year_id
        WHERE a.id = ? AND a.school_id = ? AND a.deleted_at IS NULL`,
      [id, session.schoolId],
    );
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [docs] = await conn.execute(
      `SELECT id, document_type, file_url, uploaded_at, verified
         FROM admission_documents
        WHERE admission_id = ? AND school_id = ?
        ORDER BY uploaded_at DESC`,
      [id, session.schoolId],
    );

    const [audit] = await conn.execute(
      `SELECT aa.id, aa.from_status, aa.to_status, aa.reason, aa.created_at,
              aa.actor_user_id, u.first_name AS actor_first, u.last_name AS actor_last
         FROM admission_audit aa
         LEFT JOIN users u ON u.id = aa.actor_user_id
        WHERE aa.admission_id = ? AND aa.school_id = ?
        ORDER BY aa.created_at DESC, aa.id DESC`,
      [id, session.schoolId],
    );

    return NextResponse.json({ success: true, data: rows[0], documents: docs, audit });
  } finally { await conn.end(); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const conn = await getConnection();
  try {
    const [rows]: any = await conn.execute(
      `SELECT * FROM admissions WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [id, session.schoolId],
    );
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const current = rows[0];

    // Status transition path
    if (body.status && body.status !== current.status) {
      const target = body.status as AdmissionStatus;
      if (!(ADMISSION_STATUSES as readonly string[]).includes(target)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      if (!canTransition(current.status, target)) {
        return NextResponse.json({
          error: `Cannot transition from '${current.status}' to '${target}'`,
        }, { status: 400 });
      }
      // Permission gates per transition
      const needsPerm =
        (target === 'review')                       ? 'admissions.applicant.review'
        : (target === 'approved' || target === 'rejected') ? 'admissions.applicant.approve'
        : 'admissions.applicant.update';
      try {
        await requirePermission(session.userId, session.schoolId, needsPerm, session.isSuperAdmin);
      } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

      const setFields: string[] = ['status = ?'];
      const setParams: any[]    = [target];

      if (target === 'review') {
        setFields.push('reviewed_by = ?', 'reviewed_at = NOW()');
        setParams.push(session.userId);
      }
      if (target === 'approved') {
        setFields.push('approved_by = ?', 'approved_at = NOW()');
        setParams.push(session.userId);
      }
      if (target === 'rejected') {
        setFields.push('rejection_reason = ?');
        setParams.push(body.reason ?? null);
      }

      setParams.push(id, session.schoolId);
      await conn.execute(
        `UPDATE admissions SET ${setFields.join(', ')} WHERE id = ? AND school_id = ?`,
        setParams,
      );
      await conn.execute(
        `INSERT INTO admission_audit
           (admission_id, school_id, from_status, to_status, actor_user_id, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, session.schoolId, current.status, target, session.userId, body.reason ?? null],
      );
      return NextResponse.json({ success: true, status: target });
    }

    // Field updates (applicant data only — status uses the path above)
    try {
      await requirePermission(session.userId, session.schoolId, 'admissions.applicant.update', session.isSuperAdmin);
    } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

    const allowed = [
      'first_name','last_name','other_name','gender','date_of_birth',
      'nationality_id','district_id','applicant_phone','applicant_email',
      'guardian_name','guardian_phone','guardian_email','guardian_relation',
      'desired_class_id','desired_stream_id','desired_term_id','desired_academic_year_id',
      'previous_school','notes',
    ];
    const setFields: string[] = [];
    const setParams: any[]    = [];
    for (const k of allowed) {
      if (k in body) {
        setFields.push(`${k} = ?`);
        setParams.push(body[k]);
      }
    }
    if (setFields.length === 0) {
      return NextResponse.json({ success: true });
    }
    setParams.push(id, session.schoolId);
    await conn.execute(
      `UPDATE admissions SET ${setFields.join(', ')} WHERE id = ? AND school_id = ?`,
      setParams,
    );
    return NextResponse.json({ success: true });
  } finally { await conn.end(); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'admissions.applicant.update', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const { id } = await params;
  const conn = await getConnection();
  try {
    const [r]: any = await conn.execute(
      `UPDATE admissions SET deleted_at = NOW()
        WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [id, session.schoolId],
    );
    if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } finally { await conn.end(); }
}
