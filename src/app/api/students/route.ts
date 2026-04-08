import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { NotificationMiddleware } from '@/lib/middleware/notificationMiddleware';
import { logAudit, AuditAction } from '@/lib/audit';
import { getSessionSchoolId } from '@/lib/auth';
export async function POST(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { first_name,
      last_name,
      email,
      phone,
      class_id,
      academic_year_id,
      term_id,
      stream_id } = body;

    // Validate required fields
    if (!first_name || !last_name) {
      return NextResponse.json({ success: false, message: 'Missing required fields: first_name, last_name' }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Insert person record
      const [personResult] = await connection.execute(
        `INSERT INTO people (school_id, first_name, last_name, email, phone)
         VALUES (?, ?, ?, ?, ?)`,
        [schoolId, first_name, last_name, email || null, phone || null]
      );

      const personId = personResult.insertId;

      // Insert student record (no class_id — class lives in enrollments)
      const [studentResult] = await connection.execute(
        `INSERT INTO students (school_id, person_id, status, admission_date)
         VALUES (?, ?, 'active', NOW())`,
        [schoolId, personId]
      );

      const studentId = studentResult.insertId;

      // Create enrollment if class_id provided.
      // Uses the full column set (requires migration 020 to have run).
      // Falls back to the minimal guaranteed-schema INSERT if any column is
      // missing (migration 020 not yet applied) so the student creation never
      // fails due to a schema gap in the enrollments table.
      let enrollmentId: number | null = null;
      if (class_id) {
        try {
          const [enrollResult]: any = await connection.execute(
            `INSERT INTO enrollments
               (school_id, student_id, class_id, stream_id, academic_year_id, term_id, status, enrollment_date, enrolled_at)
             VALUES (?, ?, ?, ?, ?, ?, 'active', CURDATE(), NOW())`,
            [schoolId, studentId, class_id, stream_id || null, academic_year_id || null, term_id || null]
          );
          enrollmentId = enrollResult.insertId;
        } catch (enrollErr: any) {
          // If the error is an unknown-column error (MySQL errno 1054) the
          // migration has not yet run — retry with the minimal column set.
          if (enrollErr?.errno === 1054 || String(enrollErr?.message).includes('Unknown column')) {
            console.warn('[students/POST] enrollments has missing columns (run migration 020). Falling back to minimal INSERT.');
            const [enrollResult]: any = await connection.execute(
              `INSERT INTO enrollments
                 (school_id, student_id, class_id, stream_id, academic_year_id, term_id, status)
               VALUES (?, ?, ?, ?, ?, ?, 'active')`,
              [schoolId, studentId, class_id, stream_id || null, academic_year_id || null, term_id || null]
            );
            enrollmentId = enrollResult.insertId;
          } else {
            throw enrollErr;
          }
        }
      }

      await connection.commit();

      // Audit log for student enrollment
      try {
        await logAudit({
          schoolId,
          userId: session.userId,
          action: AuditAction.ENROLLED_STUDENT,
          entityType: 'student',
          entityId: studentId,
          details: { first_name, last_name, class_id: class_id || null },
        });
      } catch (auditErr) {
        console.error('Audit log failed (non-fatal):', auditErr);
      }

      // Prepare response data
      const responseData = {
        success: true,
        student_id: studentId,
        person_id: personId,
        enrollment_id: enrollmentId,
        message: 'Student created successfully'
      };

      // Send notification to admins
      try {
        const adminRecipients = await NotificationMiddleware.getAdminRecipients(schoolId);
        await NotificationMiddleware.notifyOnAction(req, {
          action: 'student_enrolled',
          entity_type: 'student',
          entity_id: studentId,
          actor_user_id: session.userId,
          school_id: schoolId,
          recipients: adminRecipients,
          metadata: {
            student_name: `${first_name} ${last_name}`,
            class_id
          }
        }, responseData);
      } catch (notificationError) {
        console.warn('Notification failed but student was created:', notificationError);
      }

      return NextResponse.json(responseData);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating student:', error);
    return NextResponse.json({ success: false, message: 'Failed to create student' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}