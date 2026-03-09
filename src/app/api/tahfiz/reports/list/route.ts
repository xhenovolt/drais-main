import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/tahfiz/reports/list
 * Fetch a basic list of Tahfiz students and their details.
 */
export async function GET() {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    connection = await getConnection();

    const sql = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.gender,
        c.name as class_name,
        st.name as stream_name
      FROM students s
      INNER JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND c.name LIKE '%Tahfiz%'
      ORDER BY p.last_name, p.first_name
    `;

    const [rows] = await connection.execute(sql, [1]); // Replace 1 with dynamic schoolId if needed

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching Tahfiz students:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch Tahfiz students.' });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}