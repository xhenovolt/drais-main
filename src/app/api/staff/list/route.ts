import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const connection = await getConnection();
    const [results] = await connection.execute(
      `SELECT s.id, s.staff_no, p.first_name, p.last_name, s.position, s.status
       FROM staff s
       JOIN people p ON s.person_id = p.id
       WHERE s.school_id = ?`,
      [schoolId]
    );
    await connection.end();

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Error fetching staff list:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch staff list.', error: error.message }, { status: 500 });
  }
}