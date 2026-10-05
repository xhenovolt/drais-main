import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { NotificationMiddleware } from '@/lib/middleware/notificationMiddleware';
import { logAudit, AuditAction } from '@/lib/audit';
import { getSessionSchoolId } from '@/lib/auth';
import { checkCapacity } from '@/lib/entitlements/limits';
import { getDbMode } from '@/lib/db/db-mode';

/**
 * local-sqlite branch — Phase 7 sub-effort 28, the §25a branching pattern
 * (same as /api/auth/login, /api/auth/me) applied for the first time to a
 * non-auth route. Everything below this function is completely unmodified
 * online behavior. Dynamic import so better-sqlite3 never loads into this
 * route's module graph in online/local-mysql mode.
 */
async function handleOfflineCreate(req: NextRequest, schoolId: number, userId: number, body: any) {
  const { first_name, last_name, other_name, gender, date_of_birth, email, phone, class_id, academic_year_id, term_id, stream_id } = body;
  if (!first_name || !last_name) {
    return NextResponse.json({ success: false, message: 'Missing required fields: first_name, last_name' }, { status: 400 });
  }
  try {
    const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
    const { createSqliteRepos } = await import('@/lib/repo/sqlite');
    const { admitOfflineStudent } = await import('@/lib/repo/offline-students');
    const repos = createSqliteRepos(getSqliteDb());
    const result = await admitOfflineStudent(repos, schoolId, {
      firstName: first_name, lastName: last_name, otherName: other_name ?? null,
      gender: gender ?? null, dateOfBirth: date_of_birth ?? null, email: email ?? null, phone: phone ?? null,
      classId: class_id ?? null,
    });
    return NextResponse.json({
      success: true, student_id: result.studentId, person_id: result.personId,
      enrollment_id: result.enrollmentCreated ? result.studentId : null, message: 'Student created successfully',
    });
  } catch (error: any) {
    const status = error?.code === 'DUPLICATE' ? 409 : error?.code === 'INVALID_INPUT' ? 400 : 500;
    return NextResponse.json({ success: false, message: error?.message || 'Failed to create student' }, { status });
  }
}

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

    if (getDbMode() === 'local-sqlite') {
      return handleOfflineCreate(req, schoolId, session.userId, body);
    }

    // Plan capacity. Checked before any work so a school at its ceiling gets a
    // clear, actionable message rather than a half-created learner.
    const overCapacity = await checkCapacity(schoolId, 'learners');
    if (overCapacity) return overCapacity;

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

    // Plan-limit enforcement (safe by default — off unless enabled). Blocks a
    // new learner only when the school's plan cap is reached and enforcement is on.
    const { enforcePlanLimit } = await import('@/lib/control/plan-enforcement');
    const gate = await enforcePlanLimit(schoolId, 'learners');
    if (!gate.allowed) return NextResponse.json({ success: false, message: gate.reason }, { status: 403 });

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