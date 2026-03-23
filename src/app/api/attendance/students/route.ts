import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('class_id');
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!classId) {
      return NextResponse.json({ error: 'Class ID is required' }, { status: 400 });
    }

    connection = await getConnection();

    const query = `
      SELECT
        s.id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.photo_url,
        s.status,
        e.id as enrollment_id,
        c.id as class_id,
        c.name as class_name,
        st.name as stream_name,
        sa.status as attendance_status,
        sa.time_in,
        sa.time_out,
        sa.notes as attendance_notes,
        CASE
          WHEN sa.status = 'present' OR sa.time_in IS NOT NULL THEN TRUE
          ELSE FALSE
        END as is_present,
        sa.time_in as signed_in_at,
        sa.time_out as signed_out_at,
        COALESCE(
          (SELECT
            ROUND(
              (COUNT(CASE WHEN sa2.status = 'present' THEN 1 END) * 100.0) /
              NULLIF(COUNT(*), 0), 1
            )
           FROM student_attendance sa2
           WHERE sa2.student_id = s.id
           AND sa2.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          ), 0
        ) as attendance_percentage
      FROM students s
      JOIN people p ON s.person_id = p.id
      JOIN enrollments e ON s.id = e.student_id
      JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN student_attendance sa ON s.id = sa.student_id
        AND sa.date = ? AND sa.class_id = ?
      WHERE e.class_id = ?
        AND e.status = 'active'
        AND s.school_id = ?
        AND s.deleted_at IS NULL
        AND s.status IN ('active', 'suspended', 'on_leave')
      ORDER BY p.first_name, p.last_name
    `;

    const [students] = await connection.execute(query, [date, classId, classId, schoolId]);

    return NextResponse.json({ success: true, data: students, date, class_id: classId });
  } catch (error) {
    console.error('Error fetching students for attendance:', error);
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
