import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;
  try {
    const { id } = await params;
    connection = await getConnection();

    const [rows] = await connection.execute(
      `SELECT * FROM attendance_sessions WHERE id = ?`,
      [id]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Attendance session not found'
      }, { status: 404 });
    }

    const session = rows[0];

    // Get attendance details for this session
    const [attendanceDetails] = await connection.execute(
      `SELECT 
        sa.id,
        sa.student_id,
        sa.status,
        sa.notes,
        sa.time_in,
        sa.time_out,
        sa.method,
        sa.is_locked,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        p.photo_url
      FROM student_attendance sa
      JOIN students s ON sa.student_id = s.id
      JOIN people p ON s.person_id = p.id
      WHERE sa.attendance_session_id = ?
      ORDER BY p.last_name, p.first_name`,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: {
        ...session,
        attendance_records: attendanceDetails || []
      }
    });

  } catch (error: any) {
    console.error('Session fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch session'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      session_start_time,
      session_end_time,
      session_type,
      attendance_type,
      status,
      notes
    } = body;

    connection = await getConnection();

    // Build update query
    let updateQuery = 'UPDATE attendance_sessions SET ';
    const updateValues: any[] = [];
    const updateFields: string[] = [];

    if (session_start_time !== undefined) {
      updateFields.push('session_start_time = ?');
      updateValues.push(session_start_time);
    }
    if (session_end_time !== undefined) {
      updateFields.push('session_end_time = ?');
      updateValues.push(session_end_time);
    }
    if (session_type !== undefined) {
      updateFields.push('session_type = ?');
      updateValues.push(session_type);
    }
    if (attendance_type !== undefined) {
      updateFields.push('attendance_type = ?');
      updateValues.push(attendance_type);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    if (notes !== undefined) {
      updateFields.push('notes = ?');
      updateValues.push(notes);
    }

    if (updateFields.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No fields to update'
      }, { status: 400 });
    }

    updateFields.push('updated_at = NOW()');
    updateQuery += updateFields.join(', ') + ' WHERE id = ?';
    updateValues.push(id);

    await connection.execute(updateQuery, updateValues);

    return NextResponse.json({
      success: true,
      message: 'Attendance session updated successfully'
    });

  } catch (error: any) {
    console.error('Session update error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update session'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Submit an attendance session for review
 * Marks all records as frozen for final editing
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action?: string }> }
) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  
  if (action === 'submit') {
    return submitSession(req, params);
  } else if (action === 'lock') {
    return lockSession(req, params);
  } else if (action === 'finalize') {
    return finalizeSession(req, params);
  }

  return NextResponse.json({
    success: false,
    error: 'Invalid action. Use ?action=submit|lock|finalize'
  }, { status: 400 });
}

async function submitSession(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  let connection;
  try {
    const { id } = await params;
    const body = await req.json();
    const { submitted_by } = body;

    connection = await getConnection();

    // Check if all students are marked
    const [unmarkCount] = await connection.execute(
      `SELECT COUNT(*) as count FROM student_attendance 
       WHERE attendance_session_id = ? AND status = 'not_marked'`,
      [id]
    );

    await connection.execute(
      `UPDATE attendance_sessions 
       SET status = 'submitted', submitted_at = NOW(), submitted_by = ?
       WHERE id = ?`,
      [submitted_by, id]
    );

    return NextResponse.json({
      success: true,
      message: 'Attendance session submitted successfully',
      unmarked_count: (unmarkCount as any)[0]?.count || 0
    });

  } catch (error: any) {
    console.error('Session submit error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to submit session'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

async function lockSession(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  let connection;
  try {
    const { id } = await params;
    const body = await req.json();
    const { locked_by } = body;

    connection = await getConnection();

    // Lock all attendance records in this session
    await connection.execute(
      `UPDATE student_attendance 
       SET is_locked = 1, locked_at = NOW()
       WHERE attendance_session_id = ?`,
      [id]
    );

    await connection.execute(
      `UPDATE attendance_sessions 
       SET status = 'locked'
       WHERE id = ?`,
      [id]
    );

    return NextResponse.json({
      success: true,
      message: 'Attendance session locked successfully'
    });

  } catch (error: any) {
    console.error('Session lock error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to lock session'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

async function finalizeSession(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  let connection;
  try {
    const { id } = await params;
    const body = await req.json();
    const { finalized_by } = body;

    connection = await getConnection();

    await connection.execute(
      `UPDATE attendance_sessions 
       SET status = 'finalized', finalized_at = NOW(), finalized_by = ?
       WHERE id = ?`,
      [finalized_by, id]
    );

    return NextResponse.json({
      success: true,
      message: 'Attendance session finalized successfully'
    });

  } catch (error: any) {
    console.error('Session finalize error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to finalize session'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
