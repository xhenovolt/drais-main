import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * POST /api/students/bulk/delete
 * 
 * Soft delete multiple students (mark as deleted_at = NOW()).
 * 
 * Request:
 * {
 *   "student_ids": [1, 2, 3]
 * }
 * 
 * Security:
 * - Requires authentication
 * - All students must belong to the school
 * - Soft delete only (records recoverable with admin access)
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    const { student_ids } = await req.json();

    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return NextResponse.json(
        { error: 'Invalid student_ids' },
        { status: 400 }
      );
    }

    // Verify all students belong to school
    const [verification]: any = await conn.execute(
      `SELECT COUNT(*) as cnt FROM students WHERE school_id = ? AND id IN (${student_ids.map(() => '?').join(',')})`,
      [schoolId, ...student_ids]
    );

    if (verification[0].cnt !== student_ids.length) {
      return NextResponse.json(
        { error: 'Some students do not belong to your school' },
        { status: 403 }
      );
    }

    // Soft delete students
    await conn.execute(
      `UPDATE students SET deleted_at = NOW() WHERE school_id = ? AND id IN (${student_ids.map(() => '?').join(',')})`,
      [schoolId, ...student_ids]
    );

    return NextResponse.json({
      success: true,
      message: `Deleted ${student_ids.length} student(s)`,
      deleted: student_ids.length
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    return NextResponse.json(
      { error: 'Failed to process bulk delete' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
