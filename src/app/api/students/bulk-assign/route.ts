import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  try {
    const body = await req.json();
    const { learnerIds, classId } = body;

    if (!learnerIds || !Array.isArray(learnerIds) || learnerIds.length === 0) {
      return NextResponse.json({ error: 'No learners selected.' }, { status: 400 });
    }

    if (!classId) {
      return NextResponse.json({ error: 'Class ID is required.' }, { status: 400 });
    }

    const connection = await getConnection();

    try {
      await connection.beginTransaction();

      for (const learnerId of learnerIds) {
        const [rows] = (await connection.execute(
          'SELECT id FROM enrollments WHERE student_id = ? AND class_id = ?',
          [learnerId, classId]
        )) as any[]; // Explicitly cast rows to any[] to access length property

        if (rows.length === 0) {
          await connection.execute(
            'INSERT INTO enrollments (student_id, class_id, status) VALUES (?, ?, ?)',
            [learnerId, classId, 'active']
          );
        } else {
          await connection.execute(
            'UPDATE enrollments SET class_id = ? WHERE student_id = ?',
            [classId, learnerId]
          );
        }
      }

      await connection.commit();
      await connection.end();

      return NextResponse.json({ success: true });
    } catch (error) {
      await connection.rollback();
      await connection.end();
      return NextResponse.json({ error: 'Failed to assign class.' }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
}