import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('class_id');
    const streamId = searchParams.get('stream_id');
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    connection = await getConnection();
    let where = 'WHERE e.status = "active" AND s.school_id = ? AND s.deleted_at IS NULL';
    const params: any[] = [date, schoolId];

    if (classId) {
      where += ' AND e.class_id = ?';
      params.push(classId);
    }
    if (streamId) {
      where += ' AND e.stream_id = ?';
      params.push(streamId);
    }

    const [rows] = await connection.execute(
      `SELECT
        s.id as student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.photo_url,
        e.class_id,
        e.id as enrollment_id,
        e.stream_id,
        a.id as attendance_id,
        a.status as attendance_status,
        a.time_in,
        a.time_out
      FROM students s
      JOIN people p ON p.id = s.person_id
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
      LEFT JOIN student_attendance a
        ON a.student_id = s.id AND a.date = ?
      ${where}
      ORDER BY p.last_name, p.first_name`,
      params
    );

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('Attendance list error:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance list' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
