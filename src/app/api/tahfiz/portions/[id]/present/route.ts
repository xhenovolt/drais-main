import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const portionId = resolvedParams.id;
    const body = await request.json();
    const { 
      presented, 
      presented_length, 
      retention_score, 
      mark, 
      status, 
      notes, 
      recorded_by
    } = body;

    if (!schoolId) {
      return NextResponse.json({
        success: false,
        message: 'School ID is required'
      }, { status: 400 });
    }

    if (presented && !presented_length) {
      return NextResponse.json({
        success: false,
        message: 'Presented length is required when marking as presented'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // Get the portion details
    const [portionRows] = await connection.execute(
      'SELECT student_id FROM tahfiz_portions WHERE id = ?',
      [portionId]
    );

    if ((portionRows as any[]).length === 0) {
      await connection.rollback();
      return NextResponse.json({
        success: false,
        message: 'Portion not found'
      }, { status: 404 });
    }

    const studentId = (portionRows as any[])[0].student_id;

    // Create tahfiz_records entry
    const [recordResult] = await connection.execute(
      `INSERT INTO tahfiz_records (
        school_id, plan_id, student_id, presented, presented_length,
        retention_score, mark, status, notes, recorded_by, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        presented = VALUES(presented),
        presented_length = VALUES(presented_length),
        retention_score = VALUES(retention_score),
        mark = VALUES(mark),
        status = VALUES(status),
        notes = VALUES(notes),
        recorded_by = VALUES(recorded_by),
        recorded_at = NOW()`,

      [
        schoolId, portionId, studentId, presented ? 1 : 0, presented_length || 0,
        retention_score || null, mark || null, status || 'pending', 
        notes || null, recorded_by || null
      ]
    );

    // Update the portion status if provided
    if (status) {
      const updates: string[] = ['status = ?'];
      const params: any[] = [status];
      
      if (status === 'in_progress') {
        updates.push('started_at = COALESCE(started_at, NOW())');
      }
      
      if (status === 'completed') {
        updates.push('completed_at = COALESCE(completed_at, NOW())');
      }
      
      params.push(portionId);
      
      await connection.execute(
        `UPDATE tahfiz_portions SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: 'Presentation recorded successfully',
      data: {
        record_id: (recordResult as any).insertId,
        portion_updated: !!status
      }
    });

  } catch (error: any) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error recording presentation:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to record presentation',
      details: error.message
    }, { status: 500 });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
}
