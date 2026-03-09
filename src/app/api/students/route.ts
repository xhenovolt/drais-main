import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { NotificationMiddleware } from '@/lib/middleware/notificationMiddleware';

import { getSessionSchoolId } from '@/lib/auth';
export async function POST(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { first_name,
      last_name,
      email,
      phone,
      class_id } = body;

    // Validate required fields
    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'Missing required fields: first_name, last_name' }, { status: 400 });
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

      // Insert student record
      const [studentResult] = await connection.execute(
        `INSERT INTO students (school_id, person_id, class_id, status, admission_date)
         VALUES (?, ?, ?, 'active', NOW())`,
        [schoolId, personId, class_id || null]
      );

      const studentId = studentResult.insertId;

      await connection.commit();

      // Prepare response data
      const responseData = {
        success: true,
        student_id: studentId,
        person_id: personId,
        message: 'Student created successfully'
      };

      // Send notification to admins
      try {
        const adminRecipients = await NotificationMiddleware.getAdminRecipients(schoolId);
        await NotificationMiddleware.notifyOnAction(req, {
          action: 'student_enrolled',
          entity_type: 'student',
          entity_id: studentId,
          actor_user_id: 1, // TODO: Get from session
          schoolId,
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
    return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}