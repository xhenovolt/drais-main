import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function PUT(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const {
      id,
      first_name,
      last_name,
      other_name,
      gender,
      date_of_birth,
      phone,
      email,
      address,
      class_id,
      status,
      photo_url,
      person_id
    } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Student ID is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    try {
      await connection.beginTransaction();

      // Get the person_id for this student if not provided
      let actualPersonId = person_id;
      if (!actualPersonId) {
        const [studentData] = await connection.execute(
          'SELECT person_id FROM students WHERE id = ? AND school_id = ?',
          [id, schoolId]
        ) as any[];

        if (studentData.length === 0) {
          throw new Error('Student not found');
        }

        actualPersonId = studentData[0].person_id;
      }

      // Update people table
      await connection.execute(
        `UPDATE people SET 
         first_name = ?, 
         last_name = ?, 
         other_name = ?, 
         gender = ?, 
         date_of_birth = ?, 
         phone = ?, 
         email = ?, 
         address = ?, 
         photo_url = ?, 
         updated_at = NOW() 
         WHERE id = ?`,
        [
          first_name,
          last_name,
          other_name,
          gender,
          date_of_birth,
          phone,
          email,
          address,
          photo_url,
          actualPersonId
        ]
      );

      // Update students table
      await connection.execute(
        `UPDATE students SET 
         status = ?, 
         updated_at = NOW() 
         WHERE id = ?`,
        [status, id]
      );

      // Update enrollment if class_id is provided
      if (class_id) {
        // Check if enrollment exists
        const [existingEnrollment] = await connection.execute(
          'SELECT id FROM enrollments WHERE student_id = ? AND status = "active"',
          [id]
        ) as any[];

        if (existingEnrollment.length > 0) {
          // Update existing enrollment
          await connection.execute(
            'UPDATE enrollments SET class_id = ? WHERE student_id = ? AND status = "active"',
            [class_id, id]
          );
        } else {
          // Create new enrollment
          await connection.execute(
            'INSERT INTO enrollments (student_id, class_id, status) VALUES (?, ?, "active")',
            [id, class_id]
          );
        }
      }

      // Log the action in audit_log
      await connection.execute(
        `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, changes_json, ip, user_agent) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          null, // TODO: Get from session
          'student_update',
          'student',
          id,
          JSON.stringify({
            first_name,
            last_name,
            other_name,
            gender,
            date_of_birth,
            phone,
            email,
            address,
            class_id,
            status,
            photo_url
          }),
          req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
          req.headers.get('user-agent') || null
        ]
      );

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: 'Student updated successfully'
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    console.error('Student update error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update student'
    }, { status: 500 });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
}