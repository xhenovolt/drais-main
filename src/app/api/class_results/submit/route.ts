import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { userCan } from '@/lib/rbac';
import { isSubjectAllocatedToClass } from '@/lib/subject-allocation-validation';
import { canEnterSubject, denyReason } from '@/lib/academics/comment-gating';
import { checkModule } from '@/lib/auth/requireModule';
import { logResultsSubmission } from '@/lib/academics/results-submission-log';

export async function POST(req: NextRequest) {
  let connection;
  // Best-effort context for the submission-outcome log (results-submission-log.ts).
  // Populated as it becomes known; a failure before schoolId is known can't be
  // attributed to a school and is simply not logged — same as any other
  // failure this route already can't attribute (e.g. malformed request body).
  const logCtx: { schoolId?: number; classId?: number; subjectId?: number; resultTypeId?: number; termId?: number; submittedBy?: number } = {};
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;
    logCtx.schoolId = schoolId;
    logCtx.submittedBy = session.userId;

    const body = await req.json();
    const { class_id, subject_id, result_type_id, term_id, entries } = body;
    logCtx.classId = class_id; logCtx.subjectId = subject_id; logCtx.resultTypeId = result_type_id; logCtx.termId = term_id;
    const academic_type: string = ['secular', 'theology'].includes(body.academic_type)
      ? body.academic_type
      : 'secular';

    if (!class_id || !subject_id || !result_type_id || !entries || !Array.isArray(entries)) {
      return NextResponse.json({
        error: 'Missing required parameters: class_id, subject_id, result_type_id, entries'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Verify class belongs to this school
    const [classCheck]: any = await connection.execute(
      'SELECT id FROM classes WHERE id = ? AND school_id = ?',
      [class_id, schoolId]
    );
    if (!classCheck || classCheck.length === 0) {
      return NextResponse.json({ error: 'Class not found or access denied' }, { status: 403 });
    }

    // ENFORCE: Verify subject is allocated to this class
    const subjectAllocated = await isSubjectAllocatedToClass(connection, class_id, subject_id);
    if (!subjectAllocated) {
      const [subjectName]: any = await connection.execute(
        'SELECT name FROM subjects WHERE id = ?',
        [subject_id]
      );
      const subjName = subjectName?.length > 0 ? subjectName[0].name : `ID: ${subject_id}`;
      return NextResponse.json({
        error: `Subject Allocation Violation: "${subjName}" is not allocated to this class. Results cannot be entered for subjects not in the class allocation.`,
        code: 'SUBJECT_NOT_ALLOCATED'
      }, { status: 400 });
    }

    // Phase 6 — teacher-level gate: an ordinary teacher may only enter results
    // for subjects they are actively allocated to teach. Privileged callers
    // (super-admin or academics.allocations.manage holders — admins/HODs) bypass.
    const isPrivileged = session.isSuperAdmin
      || (await userCan(session.userId, schoolId, 'academics.allocations.manage'));
    if (!isPrivileged) {
      const [myAlloc]: any = await connection.execute(
        `SELECT DISTINCT subject_id FROM class_subjects
          WHERE class_id = ? AND teacher_id = ?
            AND (valid_to IS NULL OR valid_to > CURDATE())
            AND (status IS NULL OR status = 'active')`,
        [class_id, session.staffId ?? -1],
      );
      const allocatedSubjectIds = (myAlloc || []).map((r: any) => Number(r.subject_id));
      const ctx = { isPrivileged, allocatedSubjectIds, subjectId: Number(subject_id) };
      if (!canEnterSubject(ctx)) {
        return NextResponse.json({ error: denyReason(ctx), code: 'TEACHER_NOT_ALLOCATED' }, { status: 403 });
      }
    }

    let success = 0;
    const ignored: any[] = [];

    for (const entry of entries) {
      const { student_id } = entry;
      if (!student_id) {
        ignored.push({ student_id, reason: 'Missing student_id in entry' });
        continue;
      }

      const score = entry.score !== undefined ? entry.score : null;
      const grade = entry.grade !== undefined ? entry.grade : null;
      const remarks = entry.remarks !== undefined ? entry.remarks : null;

      // Verify student belongs to this school
      const [stuCheck]: any = await connection.execute(
        'SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
        [student_id, schoolId]
      );
      if (!stuCheck || stuCheck.length === 0) {
        ignored.push({ student_id, reason: 'Student not found or access denied' });
        continue;
      }

      // Check if a result already exists
      const [existing]: any = await connection.execute(
        `SELECT COUNT(*) as count FROM class_results
         WHERE class_id = ? AND subject_id = ? AND result_type_id = ? AND term_id <=> ? AND student_id = ?`,
        [class_id, subject_id, result_type_id, term_id ?? null, student_id]
      );

      if (existing[0].count > 0) {
        ignored.push({ student_id, reason: 'Results already exist' });
        continue;
      }

      await connection.execute(
        `INSERT INTO class_results (class_id, subject_id, result_type_id, term_id, student_id, score, grade, remarks, academic_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE score=VALUES(score), grade=VALUES(grade), remarks=VALUES(remarks)`,
        [class_id, subject_id, result_type_id, term_id ?? null, student_id, score, grade, remarks, academic_type]
      );
      success++;
    }

    await logResultsSubmission({ ...logCtx, schoolId: logCtx.schoolId!, route: 'submit', status: 'success', insertedCount: success, ignoredCount: ignored.length });
    return NextResponse.json({ success: true, inserted: success, ignored, message: 'Results submitted successfully' });
  } catch (error) {
    console.error('Error submitting results:', error);
    if (logCtx.schoolId) {
      await logResultsSubmission({ ...logCtx, schoolId: logCtx.schoolId, route: 'submit', status: 'failed', errorCount: 1, errorMessage: error instanceof Error ? error.message : String(error) });
    }
    return NextResponse.json({ error: 'Failed to submit results' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
