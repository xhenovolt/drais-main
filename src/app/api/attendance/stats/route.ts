import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('class_id');
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    connection = await getConnection();

    let sql = `
      SELECT 
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'present' THEN 1 END) as present,
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'absent' THEN 1 END) as absent,
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'late' THEN 1 END) as late,
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'not_marked' THEN 1 END) as not_marked,
        COUNT(s.id) as total,
        COUNT(CASE WHEN sa.method = 'biometric' THEN 1 END) as biometric_count,
        COUNT(CASE WHEN sa.method = 'manual' THEN 1 END) as manual_count
      FROM students s
      JOIN enrollments e ON s.id = e.student_id
      LEFT JOIN student_attendance sa ON s.id = sa.student_id AND sa.date = ?
      WHERE e.status = 'active'
        AND s.status IN ('active', 'suspended', 'on_leave')
        AND s.deleted_at IS NULL
    `;

    const params = [date];

    if (classId) {
      sql += ` AND e.class_id = ?`;
      params.push(classId);
    }

    const [result] = await connection.execute(sql, params);
    const stats = Array.isArray(result) ? result[0] : result;

    // Calculate percentage
    const total = parseInt(stats.total, 10) || 0;
    const present = parseInt(stats.present, 10) || 0;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        present: present,
        absent: parseInt(stats.absent, 10) || 0,
        late: parseInt(stats.late, 10) || 0,
        not_marked: parseInt(stats.not_marked, 10) || 0,
        total: total,
        percentage: percentage,
        biometric_count: parseInt(stats.biometric_count, 10) || 0,
        manual_count: parseInt(stats.manual_count, 10) || 0
      }
    });

  } catch (error: any) {
    console.error('Stats fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch attendance statistics'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
