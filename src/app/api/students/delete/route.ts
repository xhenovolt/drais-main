import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, message: 'Student ID is required.' }, { status: 400 });
    }

    const connection = await getConnection();

    // Verify student belongs to this school
    const [check] = await connection.execute('SELECT id FROM students WHERE id = ? AND school_id = ?', [id, schoolId]);
    if (!Array.isArray(check) || check.length === 0) {
      return NextResponse.json({ success: false, message: 'Student not found.' }, { status: 404 });
    }

    // Soft delete the student by setting `deleted_at`
    await connection.execute(
      `UPDATE students SET deleted_at = NOW() WHERE id = ? AND school_id = ?`,
      [id, schoolId]
    );

    await connection.end();

    return NextResponse.json({ success: true, message: 'Student deleted successfully.' });
  } catch (error: any) {
    console.error('Error deleting student:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete student.', error: error.message }, { status: 500 });
  }
}