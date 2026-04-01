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
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

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

  const conn = await getConnection();
  try {
    // Confirm the student belongs to this school
    const [owned] = await conn.execute(
      'SELECT id FROM students WHERE id = ? AND school_id = ? LIMIT 1',
      [studentId, schoolId]
    ) as any[];
    if ((owned as any[]).length === 0) {
      return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    }

    // Find existing active enrollment
    const [existing] = await conn.execute(
      'SELECT id, class_id FROM enrollments WHERE student_id = ? AND school_id = ? AND status = "active" LIMIT 1',
      [studentId, schoolId]
    ) as any[];

    let action: 'updated' | 'inserted';
    let enrollmentId: number;

    await conn.beginTransaction();
    try {
      if ((existing as any[]).length > 0) {
        enrollmentId = (existing as any[])[0].id;
        const oldClassId = (existing as any[])[0].class_id;

        await conn.execute(
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
        action = 'updated';

        // Resolve class names for message
        const [classRows] = await conn.execute(
          'SELECT name FROM classes WHERE id IN (?, ?) AND school_id = ?',
          [oldClassId, classId, schoolId]
        ) as any[];
        const classNames = Object.fromEntries(
          (classRows as any[]).map((r: any) => [r.id ?? r.name, r.name])
        );
        await conn.commit();

        logAudit({
          schoolId,
          userId: session.userId,
          action: AuditAction.REASSIGNED_CLASS,
          entityType: 'enrollment',
          entityId: enrollmentId,
          details: { studentId, from_class_id: oldClassId, to_class_id: classId, streamId, academicYearId, termId },
          ip: req.headers.get('x-forwarded-for') || null,
          userAgent: req.headers.get('user-agent') || null,
        }).catch(() => { /* non-critical */ });

        return NextResponse.json({
          success: true,
          action,
          enrollmentId,
          message: `Student moved to new class`,
        });
      } else {
        // Insert brand new enrollment
        let resolvedYearId = academicYearId ?? null;
        let resolvedTermId = termId ?? null;

        if (!resolvedYearId) {
          const [yr] = await conn.execute(
            'SELECT id FROM academic_years WHERE school_id = ? AND status = "active" ORDER BY id DESC LIMIT 1',
            [schoolId]
          ) as any[];
          resolvedYearId = (yr as any[])[0]?.id ?? null;
        }
        if (!resolvedTermId) {
          const [tr] = await conn.execute(
            'SELECT id FROM terms WHERE school_id = ? AND (is_active = 1 OR status = "active") ORDER BY id DESC LIMIT 1',
            [schoolId]
          ) as any[];
          resolvedTermId = (tr as any[])[0]?.id ?? null;
        }

        const [inserted] = await conn.execute(
          `INSERT INTO enrollments
             (school_id, student_id, class_id, stream_id, academic_year_id, term_id,
              enrollment_type, enrollment_date, enrolled_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), NOW(), 'active')`,
          [schoolId, studentId, classId, streamId ?? null, resolvedYearId, resolvedTermId,
           enrollmentType ?? 'new']
        ) as any[];
        enrollmentId = (inserted as any).insertId;
        action = 'inserted';

        await conn.commit();

        logAudit({
          schoolId,
          userId: session.userId,
          action: AuditAction.ENROLLED_STUDENT,
          entityType: 'enrollment',
          entityId: enrollmentId,
          details: { studentId, classId, streamId, academicYearId: resolvedYearId, termId: resolvedTermId, enrollmentType: enrollmentType ?? 'new' },
          ip: req.headers.get('x-forwarded-for') || null,
          userAgent: req.headers.get('user-agent') || null,
        }).catch(() => { /* non-critical */ });

        return NextResponse.json({
          success: true,
          action,
          enrollmentId,
          message: 'Student enrolled successfully',
        });
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  } catch (err: any) {
    console.error('[enroll] error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to enroll student' }, { status: 500 });
  } finally {
    try { await conn.end(); } catch { /* ignore */ }
  }
}
