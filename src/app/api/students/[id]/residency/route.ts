import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { checkAnyPermission } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';

const VALID_STATUSES = ['day', 'boarding'] as const;

/**
 * PATCH /api/students/:id/residency
 *
 * Set a student's day-scholar/boarding classification. This is a stable,
 * explicit, per-STUDENT attribute (students.residency_status, migration
 * 048) — deliberately separate from enrollments.study_mode_id, which is
 * per-enrollment and resets on re-enrollment/promotion. It is never
 * inferred from biometric activity; only an authorized admin sets it here.
 *
 * Feeds attendance_rules.boarding_scope via src/lib/attendance/residency.ts
 * and src/lib/attendance/engine.ts — a school that has configured a
 * boarding-only or day-only attendance rule will only start seeing it
 * apply correctly to a student once they're classified here.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let conn;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const denied = await checkAnyPermission(session.userId, schoolId, ['academics.residency.manage'], session.isSuperAdmin);
    if (denied) return denied;

    const resolvedParams = await params;
    const studentId = parseInt(resolvedParams.id, 10);
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    const body = await req.json();
    const { residency_status } = body;
    if (!residency_status || !VALID_STATUSES.includes(residency_status)) {
      return NextResponse.json(
        { error: `Invalid residency_status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }

    conn = await getConnection();

    const [existingRows]: any = await conn.execute(
      `SELECT id, residency_status FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [studentId, schoolId],
    );
    if (!existingRows || existingRows.length === 0) {
      return NextResponse.json({ error: 'Student not found or access denied' }, { status: 404 });
    }
    const previousStatus = existingRows[0].residency_status;

    await conn.execute(
      `UPDATE students
          SET residency_status = ?, residency_status_updated_at = NOW(), residency_status_updated_by = ?
        WHERE id = ? AND school_id = ?`,
      [residency_status, session.userId, studentId, schoolId],
    );

    if (previousStatus !== residency_status) {
      void logAudit({
        schoolId,
        userId: session.userId,
        action: AuditAction.RESIDENCY_STATUS_CHANGED,
        entityType: 'student',
        entityId: studentId,
        details: { old: previousStatus, new: residency_status },
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
        userAgent: req.headers.get('user-agent'),
      });
    }

    return NextResponse.json({
      success: true,
      student_id: studentId,
      residency_status,
      previous_status: previousStatus,
    });
  } catch (error) {
    console.error('Error updating student residency status:', error);
    return NextResponse.json({ error: 'Failed to update residency status' }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}

/**
 * GET /api/students/:id/residency — current classification + who/when it
 * was last changed.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let conn;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const studentId = parseInt(resolvedParams.id, 10);
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    conn = await getConnection();
    const [rows]: any = await conn.execute(
      `SELECT s.id, s.residency_status, s.residency_status_updated_at,
              s.residency_status_updated_by,
              TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS updated_by_name
         FROM students s
         LEFT JOIN users u ON u.id = s.residency_status_updated_by
        WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL`,
      [studentId, schoolId],
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...rows[0] });
  } catch (error) {
    console.error('Error fetching student residency status:', error);
    return NextResponse.json({ error: 'Failed to fetch residency status' }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
