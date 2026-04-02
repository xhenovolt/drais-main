/**
 * POST /api/students/enroll
 *
 * Upsert enrollment for an existing student.
 * Behaviour:
 *   - Finds the student's current active enrollment (school-scoped).
 *   - If found → updates class_id (and optionally stream_id / academic_year_id).
 *   - If not found → inserts a new active enrollment.
 *   - Previous active enrollments remain for history; only the latest is active.
 *
 * Body:
 *   studentId        number   (required)
 *   classId          number   (required)
 *   streamId?        number
 *   academicYearId?  number
 *   termId?          number
 *   enrollmentType?  'new' | 'continuing' | 're-admitted'
 *
 * Response:
 *   { success, action: 'updated' | 'inserted', enrollmentId, message }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { queryTenant, withTenantTransaction } from '@/lib/dbTenant';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { studentId, classId, streamId, academicYearId, termId, enrollmentType } = body;

  if (!studentId || !classId) {
    return NextResponse.json({ success: false, error: 'studentId and classId are required' }, { status: 400 });
  }

  try {
    // Confirm the student belongs to this school
    const owned = await queryTenant(
      'SELECT id FROM students WHERE id = ? AND school_id = ? LIMIT 1',
      [studentId, schoolId], schoolId
    );
    if (owned.length === 0) {
      return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    }

    const result = await withTenantTransaction(schoolId, async ({ exec, query: tq }) => {
      // Find existing active enrollment
      const existing = await tq(
        'SELECT id, class_id FROM enrollments WHERE student_id = ? AND school_id = ? AND status = "active" LIMIT 1',
        [studentId, schoolId]
      );

      if (existing.length > 0) {
        const enrollmentId = existing[0].id;
        const oldClassId = existing[0].class_id;

        await exec(
          `UPDATE enrollments
           SET class_id = ?,
               stream_id          = COALESCE(?, stream_id),
               academic_year_id   = COALESCE(?, academic_year_id),
               term_id            = COALESCE(?, term_id),
               enrollment_type    = COALESCE(?, enrollment_type),
               updated_at         = NOW()
           WHERE id = ? AND school_id = ?`,
          [classId, streamId ?? null, academicYearId ?? null, termId ?? null, enrollmentType ?? null, enrollmentId, schoolId]
        );

        return { action: 'updated' as const, enrollmentId, oldClassId };
      } else {
        // Resolve defaults for year and term
        let resolvedYearId = academicYearId ?? null;
        let resolvedTermId = termId ?? null;

        if (!resolvedYearId) {
          const yr = await tq(
            'SELECT id FROM academic_years WHERE school_id = ? AND status = "active" ORDER BY id DESC LIMIT 1',
            [schoolId]
          );
          resolvedYearId = yr[0]?.id ?? null;
        }
        if (!resolvedTermId) {
          const tr = await tq(
            'SELECT id FROM terms WHERE school_id = ? AND (is_active = 1 OR status = "active") ORDER BY id DESC LIMIT 1',
            [schoolId]
          );
          resolvedTermId = tr[0]?.id ?? null;
        }

        const inserted = await exec(
          `INSERT INTO enrollments
             (school_id, student_id, class_id, stream_id, academic_year_id, term_id,
              enrollment_type, enrollment_date, enrolled_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), NOW(), 'active')`,
          [schoolId, studentId, classId, streamId ?? null, resolvedYearId, resolvedTermId,
           enrollmentType ?? 'new']
        );

        return {
          action: 'inserted' as const,
          enrollmentId: inserted.insertId,
          resolvedYearId,
          resolvedTermId,
        };
      }
    });

    // Audit (non-blocking)
    const auditAction = result.action === 'updated' ? AuditAction.REASSIGNED_CLASS : AuditAction.ENROLLED_STUDENT;
    const auditDetails = result.action === 'updated'
      ? { studentId, from_class_id: result.oldClassId, to_class_id: classId, streamId, academicYearId, termId }
      : { studentId, classId, streamId, academicYearId: result.resolvedYearId, termId: result.resolvedTermId, enrollmentType: enrollmentType ?? 'new' };

    logAudit({
      schoolId,
      userId: session.userId,
      action: auditAction,
      entityType: 'enrollment',
      entityId: result.enrollmentId,
      details: auditDetails,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
    }).catch(() => { /* non-critical */ });

    return NextResponse.json({
      success: true,
      action: result.action,
      enrollmentId: result.enrollmentId,
      message: result.action === 'updated' ? 'Student moved to new class' : 'Student enrolled successfully',
    });
  } catch (err: any) {
    console.error('[enroll] error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to enroll student' }, { status: 500 });
  }
}
