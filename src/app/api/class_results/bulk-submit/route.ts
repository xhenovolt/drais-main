import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { isSubjectAllocatedToClass } from '@/lib/subject-allocation-validation';
import { checkModule } from '@/lib/auth/requireModule';
import { logResultsSubmission } from '@/lib/academics/results-submission-log';

export async function POST(req: NextRequest) {
  let connection;
  const logCtx: { schoolId?: number; submittedBy?: number } = {};
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;
    logCtx.schoolId = schoolId;
    logCtx.submittedBy = session.userId;

    const body = await req.json();
    const { entries, academic_type } = body;

    if (!entries || !Array.isArray(entries)) {
      return NextResponse.json({
        error: 'Missing required parameters: entries array'
      }, { status: 400 });
    }

    connection = await getConnection();

    let success = 0;
    const ignored: any[] = [];
    const errors: any[] = [];

    for (const entry of entries) {
      const { student_id, subject_id, score, class_id, result_type_id, term_id } = entry;

      if (!student_id || !subject_id || !class_id || !result_type_id) {
        errors.push({ entry, reason: 'Missing required fields' });
        continue;
      }

      // Verify class belongs to this school
      const [classCheck]: any = await connection.execute(
        'SELECT id FROM classes WHERE id = ? AND school_id = ?',
        [class_id, schoolId]
      );
      if (!classCheck || classCheck.length === 0) {
        ignored.push({ student_id, subject_id, reason: 'Class not found or access denied' });
        continue;
      }

      // Verify student belongs to this school
      const [stuCheck]: any = await connection.execute(
        'SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
        [student_id, schoolId]
      );
      if (!stuCheck || stuCheck.length === 0) {
        ignored.push({ student_id, subject_id, reason: 'Student not found or access denied' });
        continue;
      }

      // ENFORCE: Verify subject is allocated to this class
      const subjectAllocated = await isSubjectAllocatedToClass(connection, class_id, subject_id);
      if (!subjectAllocated) {
        ignored.push({ student_id, subject_id, reason: 'Subject not allocated to class' });
        continue;
      }

      // Check if a result already exists
      const [existing]: any = await connection.execute(
        `SELECT COUNT(*) as count FROM class_results
         WHERE class_id = ? AND subject_id = ? AND result_type_id = ? AND term_id <=> ? AND student_id = ?`,
        [class_id, subject_id, result_type_id, term_id ?? null, student_id]
      );

      // Insert or update the result
      await connection.execute(
        `INSERT INTO class_results (class_id, subject_id, result_type_id, term_id, student_id, score, academic_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE score=VALUES(score)`,
        [class_id, subject_id, result_type_id, term_id ?? null, student_id, score, academic_type]
      );
      success++;
    }

    // Log the bulk submission activity
    await connection.execute(
      'INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, changes_json, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        1, // TODO: Get actual user ID from session
        'BULK_SUBMIT_RESULTS',
        'class_results',
        null,
        JSON.stringify({
          academic_type,
          entries_submitted: entries.length,
          inserted: success,
          ignored: ignored.length,
          errors: errors.length,
          subjects_affected: [...new Set(entries.map(e => e.subject_id))].length
        }),
        req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        req.headers.get('user-agent') || 'unknown'
      ]
    );

    await logResultsSubmission({ ...logCtx, schoolId: logCtx.schoolId!, route: 'bulk_submit', status: 'success', insertedCount: success, ignoredCount: ignored.length, errorCount: errors.length });
    return NextResponse.json({
      success: true,
      inserted: success,
      ignored,
      errors,
      message: `Bulk results submitted successfully. ${success} records saved, ${ignored.length} ignored.`
    });
  } catch (error) {
    console.error('Error submitting bulk results:', error);
    if (logCtx.schoolId) {
      await logResultsSubmission({ ...logCtx, schoolId: logCtx.schoolId, route: 'bulk_submit', status: 'failed', errorCount: 1, errorMessage: error instanceof Error ? error.message : String(error) });
    }
    return NextResponse.json({ error: 'Failed to submit bulk results' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}