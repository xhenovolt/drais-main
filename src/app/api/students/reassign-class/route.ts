import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * POST /api/students/reassign-class
 * 
 * Reassign students to a different class within the same term.
 * 
 * Request body:
 * {
 *   student_ids: number[],      // Array of student IDs to reassign
 *   new_class_id: number,       // Target class ID
 *   reason: string,             // Reason for reassignment
 *   term_id?: number            // Optional: Override current term
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   message: string,
 *   data?: {
 *     success_count: number,
 *     failed_count: number,
 *     failed_students: Array<{ student_id, error_code, error_message }>
 *   },
 *   error_code?: string          // For complete failures
 * }
 */
export async function POST(req: NextRequest) {
  const conn = await getConnection();
  const startTime = Date.now();

  try {
    // Authenticate session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Not authenticated', error_code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const schoolId = session.schoolId;
    const userId = session.userId;
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
    const userAgent = req.headers.get('user-agent') || '';

    // Parse and validate request body
    const body = await req.json();
    const { student_ids, new_class_id, reason, term_id } = body;

    // Validate input
    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid input: student_ids must be a non-empty array',
          error_code: 'INVALID_INPUT',
        },
        { status: 400 }
      );
    }

    if (!new_class_id || typeof new_class_id !== 'number') {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid input: new_class_id is required',
          error_code: 'INVALID_INPUT',
        },
        { status: 400 }
      );
    }

    // Validate class exists and is active (classes uses deleted_at, not is_active)
    const [classCheck]: any = await conn.execute(
      'SELECT id, name FROM classes WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
      [new_class_id, schoolId]
    );

    if (!classCheck || classCheck.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Target class not found or is inactive',
          error_code: 'INVALID_CLASS',
        },
        { status: 404 }
      );
    }

    const newClassName = classCheck[0].name;

    // Process each student
    const successList: number[] = [];
    const failedList: Array<{ student_id: number; error_code: string; error_message: string }> = [];
    const historyRecords: Array<any> = [];

    await conn.execute('START TRANSACTION');

    try {
      for (const studentId of student_ids) {
        try {
          // Fetch current active enrollment (same term if term_id specified, otherwise latest)
          const whereClause = term_id
            ? 'WHERE e.student_id = ? AND e.school_id = ? AND e.status = "active" AND e.term_id = ?'
            : 'WHERE e.student_id = ? AND e.school_id = ? AND e.status = "active" ORDER BY e.term_id DESC LIMIT 1';

          const params = term_id
            ? [studentId, schoolId, term_id]
            : [studentId, schoolId];

          const [enrollments]: any = await conn.execute(
            `SELECT e.id, e.class_id, e.term_id, e.academic_year_id
             FROM enrollments e
             ${whereClause}`,
            params as any[]
          );

          if (!enrollments || enrollments.length === 0) {
            failedList.push({
              student_id: studentId,
              error_code: 'NO_ENROLLMENT',
              error_message: 'Student has no active enrollment',
            });
            continue;
          }

          const enrollment = enrollments[0];
          const oldClassId = enrollment.class_id;
          const enrollmentId = enrollment.id;
          const enrollmentTermId = enrollment.term_id;

          // Check if already in the target class
          if (oldClassId === new_class_id) {
            failedList.push({
              student_id: studentId,
              error_code: 'SAME_CLASS',
              error_message: 'Student is already in target class',
            });
            continue;
          }

          // Update enrollment with new class
          await conn.execute(
            `UPDATE enrollments 
             SET class_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND school_id = ?`,
            [new_class_id, enrollmentId, schoolId]
          );

          // Record in enrollment history
          await conn.execute(
            `INSERT INTO enrollment_history 
             (school_id, enrollment_id, student_id, old_class_id, new_class_id, changed_by, reason, metadata, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
              schoolId,
              enrollmentId,
              studentId,
              oldClassId,
              new_class_id,
              userId,
              reason || null,
              JSON.stringify({
                academic_year_id: enrollment.academic_year_id,
                term_id: enrollmentTermId,
                timestamp: new Date().toISOString(),
              }),
            ]
          );

          successList.push(studentId);
          historyRecords.push({
            enrollment_id: enrollmentId,
            student_id: studentId,
            old_class_id: oldClassId,
            new_class_id,
            term_id: enrollmentTermId,
          });
        } catch (studentError) {
          console.error(`Error reassigning student ${studentId}:`, studentError);
          failedList.push({
            student_id: studentId,
            error_code: 'PROCESS_ERROR',
            error_message: 'Failed to reassign student',
          });
        }
      }

      // All operations succeeded, commit transaction
      await conn.execute('COMMIT');

      // Log audit entry
      try {
        await logAudit({
          schoolId,
          userId,
          action: AuditAction.REASSIGNED_CLASS,
          entityType: 'enrollments',
          entityId: null,
          details: {
            operation_type: 'bulk_reassign',
            student_ids: student_ids,
            success_count: successList.length,
            failed_count: failedList.length,
            new_class_id,
            new_class_name: newClassName,
            reason: reason || null,
            timestamp: new Date().toISOString(),
          },
          ip: ip as string,
          userAgent: userAgent as string,
        });
      } catch (auditError) {
        // Log audit failure but don't crash the response
        console.error('Audit logging failed:', auditError);
      }

      // Insert notification for admins
      if (successList.length > 0) {
        try {
          await conn.execute(
            `INSERT INTO notifications (school_id, actor_user_id, action, entity_type, title, message, priority, channel, created_at)
             VALUES (?, ?, 'REASSIGNED_CLASS', 'students', ?, ?, 'normal', 'in_app', NOW())`,
            [
              schoolId,
              userId,
              'Class Reassignment',
              `${successList.length} student(s) moved to ${newClassName}${reason ? ': ' + reason : ''}`,
            ]
          );
        } catch (notifError) {
          console.error('Notification insert failed (non-fatal):', notifError);
        }
      }

      // Construct response
      const allSucceeded = failedList.length === 0;
      const allFailed = successList.length === 0;

      if (allFailed) {
        return NextResponse.json(
          {
            success: false,
            message: `Failed to reassign ${failedList.length} student(s)`,
            error_code: 'ALL_FAILED',
            data: {
              success_count: 0,
              failed_count: failedList.length,
              failed_students: failedList,
            },
          },
          { status: 400 }
        );
      }

      if (allSucceeded) {
        return NextResponse.json({
          success: true,
          message: `✅ ${successList.length} student(s) reassigned to ${newClassName}`,
          data: {
            success_count: successList.length,
            failed_count: 0,
            failed_students: [],
          },
        });
      }

      // Partial success
      return NextResponse.json(
        {
          success: false,
          message: `Partial success: ${successList.length} reassigned, ${failedList.length} failed`,
          error_code: 'PARTIAL_SUCCESS',
          data: {
            success_count: successList.length,
            failed_count: failedList.length,
            failed_students: failedList,
          },
        },
        { status: 207 } // Multi-Status
      );
    } catch (txError) {
      await conn.execute('ROLLBACK');
      console.error('Transaction error:', txError);
      throw txError;
    }
  } catch (error) {
    console.error('Error in reassign-class endpoint:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
        error_code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
