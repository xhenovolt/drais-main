import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Sign In API Route
 * 
 * Handles student biometric sign-in events from attendance devices.
 * Supports multiple device types through adapter abstraction.
 * 
 * Phase 4: Enhanced with:
 * - Input validation
 * - Error handling
 * - Device abstraction
 * - Audit logging
 * - Idempotency support
 */

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection = null;
  
  try {
    // Parse request body
    const body = await req.json();
    const { 
      student_id, 
      class_id, 
      date, 
      device_id,
      device_type = 'biometric',
      biometric_data,
      location 
    } = body;

    // Validate required fields
    if (!student_id) {
      return NextResponse.json(
        { success: false, error: 'student_id is required' },
        { status: 400 }
      );
    }

    if (!class_id) {
      return NextResponse.json(
        { success: false, error: 'class_id is required' },
        { status: 400 }
      );
    }

    // Use provided date or default to today
    const today = date || new Date().toISOString().split('T')[0];
    const currentTime = new Date().toTimeString().split(' ')[0]; // HH:MM:SS

    // Get database connection
    connection = await getConnection();
    
    try {
      // Start transaction for atomic operation
      await connection.beginTransaction();

      // Check if student exists
      const [studentCheck] = await connection.execute(
        'SELECT id, first_name, last_name FROM students WHERE id = ?',
        [student_id]
      );
      
      if (!studentCheck || (studentCheck as any[]).length === 0) {
        await connection.rollback();
        return NextResponse.json(
          { success: false, error: 'Student not found' },
          { status: 404 }
        );
      }

      const student = (studentCheck as any[])[0];

      // Check if attendance record already exists for today
      const [existingRecord] = await connection.execute(
        `SELECT id, status, time_in, time_out 
         FROM student_attendance 
         WHERE student_id = ? AND class_id = ? AND date = ?`,
        [student_id, class_id, today]
      );

      let recordId: number;
      let message: string;

      if (existingRecord && (existingRecord as any[]).length > 0) {
        const existing = (existingRecord as any[])[0];
        recordId = existing.id;
        
        // If already signed in, return current status (idempotent)
        if (existing.time_in) {
          await connection.rollback();
          return NextResponse.json({
            success: true,
            message: 'Student already signed in',
            data: {
              id: recordId,
              student_id,
              class_id,
              date: today,
              status: existing.status,
              time_in: existing.time_in,
              time_out: existing.time_out
            }
          });
        }

        // Update existing record
        await connection.execute(
          `UPDATE student_attendance 
           SET status = 'present', time_in = ?, updated_at = NOW()
           WHERE id = ?`,
          [currentTime, recordId]
        );
        message = 'Student sign-in updated';
      } else {
        // Insert new attendance record
        const [insertResult] = await connection.execute(
          `INSERT INTO student_attendance 
           (student_id, class_id, date, status, time_in, created_at, updated_at)
           VALUES (?, ?, ?, 'present', ?, NOW(), NOW())`,
          [student_id, class_id, today, currentTime]
        );
        recordId = (insertResult as any).insertId;
        message = 'Student signed in successfully';
      }

      // Log biometric event if device_id provided
      if (device_id) {
        await connection.execute(
          `INSERT INTO attendance_logs 
           (student_id, device_id, event_type, event_time, location, raw_data)
           VALUES (?, ?, 'sign_in', NOW(), ?, ?)`,
          [student_id, device_id, location || null, JSON.stringify(biometric_data)]
        );
      }

      // Commit transaction
      await connection.commit();

      return NextResponse.json({
        success: true,
        message,
        data: {
          id: recordId,
          student_id,
          class_id,
          date: today,
          status: 'present',
          time_in: currentTime
        }
      });

    } catch (dbError: any) {
      // Rollback on database error
      if (connection) await connection.rollback();
      console.error('Database error during sign-in:', dbError);
      
      return NextResponse.json(
        { success: false, error: 'Database error: ' + dbError.message },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Sign-in error:', error);
    
    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Internal server error: ' + error.message },
      { status: 500 }
    );
  } finally {
    // Always close connection
    if (connection) {
      await connection.end();
    }
  }
}

// GET handler for retrieving sign-in status
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  const { searchParams } = new URL(req.url);
  const student_id = searchParams.get('student_id');
  const class_id = searchParams.get('class_id');
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  if (!student_id || !class_id) {
    return NextResponse.json(
      { success: false, error: 'student_id and class_id are required' },
      { status: 400 }
    );
  }

  let connection = null;
  
  try {
    connection = await getConnection();
    
    const [rows] = await connection.execute(
      `SELECT id, student_id, class_id, date, status, time_in, time_out, created_at, updated_at
       FROM student_attendance 
       WHERE student_id = ? AND class_id = ? AND date = ?`,
      [student_id, class_id, date]
    );

    if (!rows || (rows as any[]).length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No attendance record found for this date'
      });
    }

    return NextResponse.json({
      success: true,
      data: (rows as any[])[0]
    });

  } catch (error: any) {
    console.error('Error fetching sign-in status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
