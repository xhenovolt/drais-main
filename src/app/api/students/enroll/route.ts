/**
 * POST /api/students/enroll
 *
 * Upsert enrollment for an existing student.
 * Delegates to enrollmentService — single source of truth.
 *
 * Body:
 *   studentId        number   (required)
 *   classId          number   (required)
 *   streamId?        number
 *   academicYearId?  number
 *   termId?          number
 *   studyModeId?     number
 *   curriculumId?    number
 *   programId?       number
 *   programIds?      number[]
 *   enrollmentType?  'new' | 'continuing' | 'repeat' | 're-admitted'
 *
 * Response:
 *   { success, action: 'updated' | 'inserted' | 'skipped', enrollmentId, message }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { enrollStudent } from '@/services/enrollmentService';

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

  const {
    studentId, classId, streamId, academicYearId, termId,
    studyModeId, curriculumId, programId, programIds,
    enrollmentType,
  } = body;

  if (!studentId || !classId) {
    return NextResponse.json({ success: false, error: 'studentId and classId are required' }, { status: 400 });
  }

  try {
    const result = await enrollStudent(schoolId, {
      studentId,
      classId,
      streamId,
      academicYearId,
      termId,
      studyModeId,
      curriculumId,
      programId,
      programIds,
      enrollmentType,
      closePrevious: false, // Upsert mode: update existing if found
    });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        action: result.action,
        enrollmentId: result.enrollmentId,
        error: result.message,
      }, { status: result.action === 'skipped' ? 409 : 400 });
    }

    // Audit (non-blocking)
    const auditAction = result.action === 'updated' ? AuditAction.REASSIGNED_CLASS : AuditAction.ENROLLED_STUDENT;
    logAudit({
      schoolId,
      userId: session.userId,
      action: auditAction,
      entityType: 'enrollment',
      entityId: result.enrollmentId!,
      details: { studentId, classId, streamId, academicYearId: result.resolvedYearId, termId: result.resolvedTermId, enrollmentType },
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
    }).catch(() => { /* non-critical */ });

    return NextResponse.json({
      success: true,
      action: result.action,
      enrollmentId: result.enrollmentId,
      message: result.message,
    });
  } catch (err: any) {
    console.error('[enroll] error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to enroll student' }, { status: 500 });
  }
}
