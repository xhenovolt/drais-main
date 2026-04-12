import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { enrollStudentsBulk } from '@/services/enrollmentService';

/**
 * POST /api/students/bulk/enroll
 *
 * Bulk enroll multiple students.
 * Delegates to enrollmentService for consistent behavior.
 *
 * Request:
 * {
 *   "student_ids": [1, 2, 3],
 *   "class_id": 5 (optional),
 *   "stream_id": 10 (optional),
 *   "academic_year_id": number (optional — defaults to active),
 *   "term_id": number (optional — defaults to active),
 *   "study_mode_id": number (optional),
 *   "curriculum_id": number (optional),
 *   "program_id": number (optional),
 *   "program_ids": number[] (optional),
 *   "enrollment_type": string (optional)
 * }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const schoolId = session.schoolId;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    student_ids,
    class_id,
    stream_id,
    academic_year_id,
    term_id,
    study_mode_id,
    curriculum_id,
    program_id,
    program_ids,
    enrollment_type,
  } = body;

  if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
    return NextResponse.json({ error: 'Invalid student_ids' }, { status: 400 });
  }

  try {
    const result = await enrollStudentsBulk(schoolId, {
      studentIds: student_ids,
      classId: class_id || null,
      streamId: stream_id || null,
      academicYearId: academic_year_id || null,
      termId: term_id || null,
      studyModeId: study_mode_id || null,
      curriculumId: curriculum_id || null,
      programId: program_id || null,
      programIds: program_ids,
      enrollmentType: enrollment_type || 'continuing',
    });

    // Audit (non-blocking)
    logAudit({
      schoolId,
      userId: session.userId,
      action: AuditAction.ENROLLED_STUDENT,
      entityType: 'enrollment',
      entityId: 0,
      details: {
        bulk: true,
        count: student_ids.length,
        enrolled: result.enrolled,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
      },
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
    }).catch(() => { /* non-critical */ });

    return NextResponse.json({
      success: result.success,
      message: result.message,
      enrolled: result.enrolled,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error('Bulk enroll error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process bulk enroll' },
      { status: 500 }
    );
  }
}
