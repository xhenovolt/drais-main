import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * PATCH /api/students/:id/status
 * 
 * Update student lifecycle status:
 * - active: currently enrolled
 * - left: student departed (archived)
 * - graduated: completed program
 * - suspended: temporarily inactive
 * 
 * SECURITY: Multi-tenant isolation, requires authentication
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let conn;
  try {
    // Security: Enforce authentication
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const studentId = parseInt(resolvedParams.id, 10);
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    const body = await req.json();
    const { status, left_reason } = body;

    // Validate status
    const validStatuses = ['active', 'left', 'graduated', 'suspended'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      }, { status: 400 });
    }

    conn = await getConnection();

    // Security: Verify student belongs to user's school
    const [studentCheck]: any = await conn.execute(
      'SELECT id FROM students WHERE id = ? AND school_id = ?',
      [studentId, schoolId]
    );
    if (!studentCheck || studentCheck.length === 0) {
      return NextResponse.json(
        { error: 'Student not found or access denied' },
        { status: 403 }
      );
    }

    // Update status
    let left_at = null;
    if (status === 'left') {
      left_at = new Date();
      if (!left_reason) {
        return NextResponse.json({
          error: 'left_reason is required when marking student as left'
        }, { status: 400 });
      }
    }

    await conn.execute(
      `UPDATE students 
       SET status = ?, left_at = ?, left_reason = ?, updated_at = NOW()
       WHERE id = ? AND school_id = ?`,
      [status, left_at, left_reason || null, studentId, schoolId]
    );

    // Fetch updated student with full details
    const [updatedStudent]: any = await conn.execute(
      `SELECT 
        s.id, s.admission_no, s.status, s.left_at, s.left_reason,
        s.admission_date, s.notes,
        p.first_name, p.last_name, p.gender, p.date_of_birth, p.photo_url,
        e.class_id, c.name AS class_name,
        COUNT(DISTINCT res.id) AS total_results
       FROM students s
       JOIN people p ON s.person_id = p.id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN results res ON res.student_id = s.id
       WHERE s.id = ? AND s.school_id = ?
       GROUP BY s.id`,
      [studentId, schoolId]
    );

    if (!updatedStudent || updatedStudent.length === 0) {
      return NextResponse.json(
        { error: 'Failed to fetch updated student' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Student status updated to ${status}`,
      student: updatedStudent[0]
    });

  } catch (error) {
    console.error('Error updating student status:', error);
    return NextResponse.json(
      { error: 'Failed to update student status' },
      { status: 500 }
    );
  } finally {
    if (conn) await conn.end();
  }
}

/**
 * GET /api/students/:id/status
 * 
 * Get detailed lifecycle history for a student
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let conn;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const studentId = parseInt(resolvedParams.id, 10);
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    conn = await getConnection();

    // Fetch current status
    const [student]: any = await conn.execute(
      `SELECT 
        s.id, s.admission_no, s.status, s.left_at, s.left_reason,
        s.admission_date, s.created_at, s.updated_at,
        p.first_name, p.last_name
       FROM students s
       JOIN people p ON s.person_id = p.id
       WHERE s.id = ? AND s.school_id = ?`,
      [studentId, schoolId]
    );

    if (!student || student.length === 0) {
      return NextResponse.json(
        { error: 'Student not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      student: student[0]
    });

  } catch (error) {
    console.error('Error fetching student status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch student status' },
      { status: 500 }
    );
  } finally {
    if (conn) await conn.end();
  }
}
