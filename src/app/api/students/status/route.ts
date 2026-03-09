import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const body = await req.json();
  const { student_id, new_status } = body;

  if (!student_id || !new_status) {
    return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
  }

  const connection = await getConnection();

  try {
    // Verify student belongs to this school
    const [check] = await connection.execute('SELECT id FROM students WHERE id = ? AND school_id = ?', [student_id, schoolId]);
    if (!Array.isArray(check) || check.length === 0) {
      return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    }

    await connection.execute(
      `UPDATE students SET status = ? WHERE id = ? AND school_id = ?`,
      [new_status, student_id, schoolId]
    );

    await connection.execute(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, changes_json) VALUES (?, ?, ?, ?, ?)`,
      [null, 'update_status', 'students', student_id, JSON.stringify({ status: new_status })]
    );

    return NextResponse.json({ success: true, message: 'Student status updated successfully' });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to update student status' }, { status: 500 });
  } finally {
    await connection.end();
  }
}
