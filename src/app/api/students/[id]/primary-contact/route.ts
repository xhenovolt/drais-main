import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Quick endpoint to create or update a student's primary contact by phone
 * This is used for inline contact editing in the student list
 * POST /api/students/[id]/primary-contact - Create/update primary contact
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;

  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { id } = await params;
    const studentId = parseInt(id, 10);

    if (isNaN(studentId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid student ID'
      }, { status: 400 });
    }

    const body = await req.json();
    const { contact_phone, contact_first_name = '', contact_last_name = '', relationship = 'Guardian' } = body;

    if (!contact_phone) {
      return NextResponse.json({
        success: false,
        error: 'Phone number is required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Get student's school_id
      const [student]: any = await connection.execute(
        'SELECT school_id FROM students WHERE id = ?',
        [studentId]
      );

      if (student.length === 0) {
        throw new Error('Student not found');
      }

      const schoolId = student[0].school_id;

      // Check if primary contact exists
      const [existing]: any = await connection.execute(
        `SELECT sc.contact_id, c.person_id FROM student_contacts sc
         JOIN contacts c ON sc.contact_id = c.id
         WHERE sc.student_id = ? AND sc.is_primary = 1`,
        [studentId]
      );

      if (existing.length > 0) {
        // Update existing primary contact
        const personId = existing[0].person_id;
        const contactId = existing[0].contact_id;

        await connection.execute(
          `UPDATE people SET phone = ?, first_name = ?, last_name = ? WHERE id = ?`,
          [contact_phone, contact_first_name, contact_last_name, personId]
        );

        await connection.execute(
          `UPDATE student_contacts SET relationship = ? WHERE contact_id = ? AND student_id = ?`,
          [relationship, contactId, studentId]
        );

        await connection.commit();

        return NextResponse.json({
          success: true,
          message: 'Primary contact updated successfully',
          data: { contact_id: contactId }
        });
      } else {
        // Create new primary contact
        const [personResult]: any = await connection.execute(
          `INSERT INTO people (school_id, first_name, last_name, phone)
           VALUES (?, ?, ?, ?)`,
          [schoolId, contact_first_name, contact_last_name, contact_phone]
        );

        const personId = personResult.insertId;

        const [contactResult]: any = await connection.execute(
          `INSERT INTO contacts (school_id, person_id, contact_type, alive_status)
           VALUES (?, ?, 'guardian', 'alive')`,
          [schoolId, personId]
        );

        const contactId = contactResult.insertId;

        await connection.execute(
          `INSERT INTO student_contacts (student_id, contact_id, relationship, is_primary)
           VALUES (?, ?, ?, 1)`,
          [studentId, contactId, relationship]
        );

        await connection.commit();

        return NextResponse.json({
          success: true,
          message: 'Primary contact created successfully',
          data: { contact_id: contactId }
        });
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error: any) {
    console.error('Primary contact error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save contact' },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
