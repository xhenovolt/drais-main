import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await request.json();
    const { score, grade, remarks } = body;
    const resolvedParams = await params;
    const resultId = parseInt(resolvedParams.id, 10);

    if (isNaN(resultId)) {
      return NextResponse.json({ error: 'Invalid result ID' }, { status: 400 });
    }
    if (score !== null && score !== undefined && (isNaN(Number(score)) || Number(score) < 0 || Number(score) > 100)) {
      return NextResponse.json({ error: 'Score must be between 0 and 100' }, { status: 400 });
    }

    connection = await getConnection();

    // Verify the result belongs to this school via student ownership
    const [check]: any = await connection.execute(
      `SELECT cr.id FROM class_results cr
       JOIN students s ON cr.student_id = s.id
       WHERE cr.id = ? AND s.school_id = ?`,
      [resultId, schoolId]
    );
    if (!check || check.length === 0) {
      return NextResponse.json({ error: 'Result not found or access denied' }, { status: 404 });
    }

    await connection.execute(
      `UPDATE class_results SET score = ?, grade = ?, remarks = ?, updated_at = NOW() WHERE id = ?`,
      [score !== undefined ? score : null, grade || null, remarks || null, resultId]
    );

    return NextResponse.json({ success: true, message: 'Result updated successfully' });
  } catch (error) {
    console.error('Error updating class result:', error);
    return NextResponse.json({ error: 'Failed to update result' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const resultId = parseInt(resolvedParams.id, 10);
    if (isNaN(resultId)) {
      return NextResponse.json({ error: 'Invalid result ID' }, { status: 400 });
    }

    connection = await getConnection();

    const [check]: any = await connection.execute(
      `SELECT cr.id FROM class_results cr
       JOIN students s ON cr.student_id = s.id
       WHERE cr.id = ? AND s.school_id = ?`,
      [resultId, schoolId]
    );
    if (!check || check.length === 0) {
      return NextResponse.json({ error: 'Result not found or access denied' }, { status: 404 });
    }

    await connection.execute('DELETE FROM class_results WHERE id = ?', [resultId]);

    return NextResponse.json({ success: true, message: 'Result deleted' });
  } catch (error) {
    console.error('Error deleting class result:', error);
    return NextResponse.json({ error: 'Failed to delete result' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
