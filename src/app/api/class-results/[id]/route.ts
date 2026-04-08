import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const { score, grade, remarks } = body;
    const resolvedParams = await params;
    const resultId = parseInt(resolvedParams.id, 10);

    if (!resultId || isNaN(resultId)) {
      return NextResponse.json({ error: 'Invalid result ID' }, { status: 400 });
    }

    if (score !== undefined && (isNaN(parseFloat(score)) || score < 0 || score > 100)) {
      return NextResponse.json({ error: 'Score must be between 0 and 100' }, { status: 400 });
    }

    const connection = await getConnection();

    // Get the current record for audit logging
    const [currentRecordRows] = await connection.execute(
      'SELECT * FROM class_results WHERE id = ?',
      [resultId]
    ) as any[];

    if (!currentRecordRows || currentRecordRows.length === 0) {
      await connection.end();
      return NextResponse.json({ error: 'Result not found' }, { status: 404 });
    }

    const beforeData = currentRecordRows[0];

    // Update the record
    await connection.execute(
      `UPDATE class_results 
       SET score = ?, grade = ?, remarks = ?, updated_at = NOW() 
       WHERE id = ?`,
      [
        score !== undefined ? parseFloat(score) : beforeData.score,
        grade !== undefined ? grade : beforeData.grade,
        remarks !== undefined ? remarks : beforeData.remarks,
        resultId
      ]
    );

    // Get the updated record
    const [updatedRecordRows] = await connection.execute(
      'SELECT * FROM class_results WHERE id = ?',
      [resultId]
    ) as any[];

    const afterData = updatedRecordRows[0];

    // Log the change in audit_log
    const changes = {
      before: beforeData,
      after: afterData
    };

    await connection.execute(
      `INSERT INTO audit_log 
       (actor_user_id, action, entity_type, entity_id, changes_json, ip, user_agent, created_at) 
       VALUES (?, 'edit_result', 'class_result', ?, ?, ?, ?, NOW())`,
      [
        session.userId,
        resultId,
        JSON.stringify(changes),
        req.headers.get('x-forwarded-for') || 'unknown',
        req.headers.get('user-agent') || 'unknown'
      ]
    );

    await connection.end();

    // Revalidate the path to refresh cached data
    revalidatePath('/academics/results');

    return NextResponse.json({
      success: true,
      updatedResult: afterData
    });

  } catch (error) {
    console.error('Error updating class result:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
