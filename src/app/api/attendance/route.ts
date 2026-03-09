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
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const classId = searchParams.get('class_id');
    const status = searchParams.get('status');

    connection = await getConnection();

    let sql = `
      SELECT DISTINCT
        s.id as student_id,
        p.first_name,
        p.last_name,
        p.other_name,
        p.photo_url,
        c.name as class_name,
        st.name as stream_name,
        e.class_id,
        e.stream_id,
        COALESCE(sa.status, 'not_marked') as attendance_status,
        sa.method,
        sa.time_in,
        sa.time_out,
        sa.notes,
        sa.marked_at,
        CASE WHEN sf.id IS NOT NULL THEN 1 ELSE 0 END as has_fingerprint
      FROM students s
      JOIN people p ON s.person_id = p.id
      JOIN enrollments e ON s.id = e.student_id
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN student_attendance sa ON s.id = sa.student_id AND sa.date = ?
      LEFT JOIN student_fingerprints sf ON s.id = sf.student_id AND sf.is_active = 1
      WHERE e.status = 'active' 
        AND s.status IN ('active', 'suspended', 'on_leave')
        AND s.deleted_at IS NULL
        AND s.school_id = ?
    `;

    const params: any[] = [date, schoolId];

    if (classId) {
      sql += ` AND e.class_id = ?`;
      params.push(classId);
    }

    if (status) {
      sql += ` AND COALESCE(sa.status, 'not_marked') = ?`;
      params.push(status);
    }

    sql += ` ORDER BY p.first_name, p.last_name`;

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows,
      date: date
    });

  } catch (error: any) {
    console.error('Attendance fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch attendance data'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { student_id, date, status, method = 'manual', notes, marked_by } = body;

    if (!student_id || !date || !status) {
      return NextResponse.json({
        success: false,
        error: 'student_id, date, and status are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Verify student belongs to this school
    const [studentCheck] = await connection.execute(
      'SELECT id FROM students WHERE id = ? AND school_id = ?',
      [student_id, schoolId]
    );
    if (!Array.isArray(studentCheck) || studentCheck.length === 0) {
      return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    }

    // Get student's class for the attendance record
    const [classResult] = await connection.execute(
      'SELECT class_id FROM enrollments WHERE student_id = ? AND status = "active" LIMIT 1',
      [student_id]
    );

    const classId = Array.isArray(classResult) && classResult.length > 0 
      ? classResult[0].class_id : null;

    const now = new Date();
    const timeIn = status === 'present' || status === 'late' ? now.toTimeString().split(' ')[0] : null;

    // Insert or update attendance record
    await connection.execute(
      `INSERT INTO student_attendance (student_id, date, status, method, time_in, notes, class_id, marked_by, marked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         status = VALUES(status),
         method = VALUES(method),
         time_in = VALUES(time_in),
         notes = VALUES(notes),
         marked_by = VALUES(marked_by),
         marked_at = VALUES(marked_at)`,
      [student_id, date, status, method, timeIn, notes, classId, marked_by, now]
    );

    return NextResponse.json({
      success: true,
      message: 'Attendance updated successfully'
    });

  } catch (error: any) {
    console.error('Attendance update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update attendance'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
