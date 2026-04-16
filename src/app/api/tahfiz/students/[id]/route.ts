import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const resolvedParams = await params;
    const studentId = resolvedParams.id;

    if (!studentId) {
      return NextResponse.json({ success: false, message: 'Student ID is required' }, { status: 400 });
    }

    connection = await getConnection();
    const [students] = await connection.execute(
      `
      SELECT 
        s.id,
        s.person_id,
        s.admission_no,
        CONCAT(p.first_name, ' ', p.last_name) AS name,
        p.first_name,
        p.last_name,
        p.phone,
        p.email,
        p.photo_url AS avatar,
        gm.group_id,
        g.name AS group_name,
        COALESCE(SUM(CASE WHEN r.presented = 1 THEN r.presented_length ELSE 0 END), 0) AS completed_verses,
        COALESCE(SUM(r.presented_length), 1) AS total_verses,
        MAX(r.recorded_at) AS last_session,
        s.status,
        s.admission_date,
        s.notes
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN tahfiz_group_members gm ON s.id = gm.student_id
      LEFT JOIN tahfiz_groups g ON gm.group_id = g.id
      LEFT JOIN tahfiz_records r ON s.id = r.student_id
      WHERE s.id = ? AND s.deleted_at IS NULL
      GROUP BY s.id, s.person_id, s.admission_no, p.first_name, p.last_name, p.phone, p.email, p.photo_url, gm.group_id, g.name, s.status, s.admission_date, s.notes
      `,
      [studentId]
    );

    const studentsArray = students as any[];
    if (!studentsArray.length) {
      return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: studentsArray[0] });
  } catch (error: any) {
    console.error('Error fetching student:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch student', details: error.message }, { status: 500 });
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const resolvedParams = await params;
    const studentId = resolvedParams.id;
    const body = await req.json();
    const { 
      first_name, 
      last_name, 
      phone, 
      email, 
      admission_no, 
      group_id,
      status,
      notes 
    } = body;

    if (!studentId) {
      return NextResponse.json({ success: false, message: 'Student ID is required' }, { status: 400 });
    }

    if (!first_name || !last_name) {
      return NextResponse.json({ 
        success: false, 
        message: 'first_name and last_name are required' 
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Get student's person_id
      const [studentData] = await connection.execute(
        'SELECT person_id FROM students WHERE id = ?',
        [studentId]
      );

      if (!Array.isArray(studentData) || studentData.length === 0) {
        return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
      }

      const personId = (studentData[0] as any).person_id;

      // Update person record
      await connection.execute(
        `UPDATE people SET first_name = ?, last_name = ?, phone = ?, email = ? WHERE id = ?`,
        [first_name, last_name, phone || null, email || null, personId]
      );

      // Update student record
      await connection.execute(
        `UPDATE students SET admission_no = ?, status = ?, notes = ? WHERE id = ?`,
        [admission_no || null, status || 'active', notes || null, studentId]
      );

      // Update group membership
      if (group_id !== undefined) {
        // Remove from current group
        await connection.execute(
          'DELETE FROM tahfiz_group_members WHERE student_id = ?',
          [studentId]
        );

        // Add to new group if specified
        if (group_id) {
          await connection.execute(
            'INSERT INTO tahfiz_group_members (group_id, student_id) VALUES (?, ?)',
            [group_id, studentId]
          );
        }
      }

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
    console.error('Error updating student:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to update student', 
      details: error.message 
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const resolvedParams = await params;
    const studentId = resolvedParams.id;

    if (!studentId) {
      return NextResponse.json({ success: false, message: 'Student ID is required' }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Always use soft delete - mark student and enrollments as deleted
      await connection.execute(
        'UPDATE students SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
        [studentId]
      );

      await connection.execute(
        'UPDATE enrollments SET deleted_at = CURRENT_TIMESTAMP WHERE student_id = ?',
        [studentId]
      );

      // Log audit trail
      await logAudit(session.userId, 'STUDENT_DELETED', { studentId, schoolId });

      await connection.commit();

      return NextResponse.json({ 
        success: true, 
        message: 'Student deleted successfully'
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error: any) {
    console.error('Error deleting student:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to delete student', 
      details: error.message 
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