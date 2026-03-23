import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * LEGACY endpoint — kept for backward compatibility only.
 * New code should use /api/attendance for all attendance operations.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  let connection;
  try {
    connection = await getConnection();
    const [rows] = await connection.execute(
      `SELECT sa.*, p.first_name, p.last_name
       FROM student_attendance sa
       JOIN students s ON sa.student_id = s.id
       JOIN people p ON s.person_id = p.id
       WHERE s.school_id = ? AND sa.date = ?
       ORDER BY COALESCE(p.last_name, '') ASC, COALESCE(p.first_name, '') ASC`,
      [schoolId, date]
    );
    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('Legacy attendance GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  let connection;
  try {
    const { studentId, action } = await req.json();
    if (!studentId || !action) {
      return NextResponse.json({ error: 'studentId and action are required' }, { status: 400 });
    }

    const timeField = action === 'sign_in' ? 'time_in' : 'time_out';
    const status = action === 'sign_in' ? 'present' : 'present';

    // Verify student belongs to this school
    connection = await getConnection();
    const [stuCheck]: any = await connection.execute(
      'SELECT id FROM students WHERE id = ? AND school_id = ?',
      [studentId, schoolId]
    );
    if (!stuCheck || stuCheck.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const [result]: any = await connection.execute(
      `INSERT INTO student_attendance (student_id, date, ${timeField}, status)
       VALUES (?, CURDATE(), CURTIME(), ?)
       ON DUPLICATE KEY UPDATE ${timeField} = CURTIME(), status = ?`,
      [studentId, status, status]
    );
    return NextResponse.json({ success: true, id: result.insertId });
  } catch (error: any) {
    console.error('Legacy attendance POST error:', error);
    return NextResponse.json({ error: 'Failed to record attendance' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
