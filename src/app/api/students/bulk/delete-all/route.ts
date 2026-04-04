import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * DELETE /api/students/bulk/delete-all
 *
 * Soft-deletes ALL students for the authenticated school.
 * This is a destructive operation — confirmation must be done client-side.
 *
 * Returns:
 *   { success: true, deleted: number }
 */
export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;

    // Count first so we can return a meaningful number
    const [countResult]: any = await conn.execute(
      'SELECT COUNT(*) as cnt FROM students WHERE school_id = ? AND deleted_at IS NULL',
      [schoolId],
    );
    const total: number = countResult[0].cnt;

    if (total === 0) {
      return NextResponse.json({ success: true, deleted: 0, message: 'No learners to delete.' });
    }

    await conn.execute(
      'UPDATE students SET deleted_at = NOW() WHERE school_id = ? AND deleted_at IS NULL',
      [schoolId],
    );

    return NextResponse.json({
      success: true,
      deleted: total,
      message: `${total} learner${total !== 1 ? 's' : ''} removed.`,
    });
  } catch (error) {
    console.error('Delete-all learners error:', error);
    return NextResponse.json({ error: 'Failed to remove learners' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
