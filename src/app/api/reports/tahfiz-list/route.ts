import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const searchParams = request.nextUrl.searchParams;
    // schoolId now from session auth (above)
    if (!schoolId) {
      return NextResponse.json(
        { error: 'School ID is required' },
        { status: 400 }
      );
    }

    connection = await getConnection();
    
    const [students] = await connection.execute(
      `SELECT 
        s.id,
        CONCAT(p.first_name, ' ', p.last_name) as name,
        s.admission_no as reg_no,
        p.photo_url,
        tg.name as group_name,
        COUNT(DISTINCT tr.id) as portions_completed,
        COALESCE(SUM(tr.score), 0) as total_pages
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN tahfiz_group_members tgm ON s.id = tgm.student_id
      LEFT JOIN tahfiz_groups tg ON tgm.group_id = tg.id
      LEFT JOIN tahfiz_records tr ON s.id = tr.student_id
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY s.id, p.first_name, p.last_name, s.admission_no, p.photo_url, tg.name
      ORDER BY p.first_name ASC`,
      [schoolId]
    );

    return NextResponse.json({ success: true, students });
  } catch (error) {
    console.error('Tahfiz list fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tahfiz students' },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
