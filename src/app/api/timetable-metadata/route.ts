import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Returns all dropdown data needed by the timetable UI:
 * classes, streams, subjects, teachers, periods
 */
export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    connection = await getConnection();
    const schoolId = session.schoolId;

    const [classes] = await connection.execute(
      'SELECT id, name, class_level FROM classes WHERE school_id = ? ORDER BY class_level, name', [schoolId]
    );
    const [streams] = await connection.execute(
      'SELECT id, name, class_id FROM streams WHERE school_id = ? ORDER BY name', [schoolId]
    );
    const [subjects] = await connection.execute(
      'SELECT id, name, code, subject_type FROM subjects WHERE school_id = ? ORDER BY name', [schoolId]
    );
    const [teachers] = await connection.execute(
      `SELECT s.id, s.staff_no, s.position,
              COALESCE(CONCAT(p.first_name, ' ', p.last_name), CONCAT('Staff ', s.id)) as name
       FROM staff s
       LEFT JOIN people p ON s.person_id = p.id
       WHERE s.school_id = ? AND s.status = 'active'
       ORDER BY name`,
      [schoolId]
    );
    const [periods] = await connection.execute(
      'SELECT id, name, short_name, start_time, end_time, period_order, is_break FROM timetable_periods WHERE school_id = ? ORDER BY period_order', [schoolId]
    );

    return NextResponse.json({
      success: true,
      data: { classes, streams, subjects, teachers, periods }
    });
  } catch (e: any) {
    console.error('Timetable metadata GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
