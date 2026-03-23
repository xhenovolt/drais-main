import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Sign Out API Route
 * 
 * Handles student biometric sign-out events from attendance devices.
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
  let connection = null;
  
  try {
    // Enforce authentication and school isolation
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    // Parse request body
    const body = await req.json();
    const {
      student_id,
      class_id,
      date,
      device_id,
      device_type = 'biometric',
      biometric_data,
      location,
      force_signout = false
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

      // Check if student exists and belongs to this school
      const [studentCheck] = await connection.execute(
        'SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
        [student_id, schoolId]
      );
      
      if (!studentCheck || (studentCheck as any[]).length === 0) {
        await connection.rollback();
        return NextResponse.json(
          { success: false, error: 'Student not found' },
          { status: 404 }
        );
      }

      // Check if attendance record exists for today
      const [existingRecord] = await connection.execute(
        `SELECT id, status, time_in, time_out 
         FROM student_attendance 
         WHERE student_id = ? AND class_id = ? AND date = ?`,
        [student_id, class_id, today]
      );

      // If no record exists, create one with sign-out only
      if (!existingRecord || (existingRecord as any[]).length === 0) {
        if (!force_signout) {
          await connection.rollback();
          return NextResponse.json(
            { 
              success: false, 
              error: 'No attendance record found for today. Student must sign in first.' 
            },
            { status: 400 }
          );
        }
        
        // If force_signout is true, create new record
        const [insertResult] = await connection.execute(
          `INSERT INTO student_attendance 
           (student_id, class_id, date, status, time_out, created_at, updated_at)
           VALUES (?, ?, ?, 'present', ?, NOW(), NOW())`,
          [student_id, class_id, today, currentTime]
        );
        
        await connection.commit();
        
        return NextResponse.json({
          success: true,
          message: 'Student signed out successfully (created new record)',
          data: {
            id: (insertResult as any).insertId,
            student_id,
            class_id,
            date: today,
            status: 'present',
            time_out: currentTime
          }
        });
      }

      const existing = (existingRecord as any[])[0];
      
      // If already signed out, return current status (idempotent)
      if (existing.time_out) {
        await connection.rollback();
        return NextResponse.json({
          success: true,
          message: 'Student already signed out',
          data: {
            id: existing.id,
            student_id,
            class_id,
            date: today,
            status: existing.status,
            time_in: existing.time_in,
            time_out: existing.time_out
          }
        });
      }

      // Update existing record with sign-out time
      // Status remains 'present' - sign out just records departure time
      await connection.execute(
        `UPDATE student_attendance 
         SET time_out = ?, updated_at = NOW()
         WHERE id = ?`,
        [currentTime, existing.id]
      );

      // Log biometric event if device_id provided
      if (device_id) {
        await connection.execute(
          `INSERT INTO attendance_logs 
           (student_id, device_id, event_type, event_time, location, raw_data)
           VALUES (?, ?, 'sign_out', NOW(), ?, ?)`,
          [student_id, device_id, location || null, JSON.stringify(biometric_data)]
        );
      }

      // Commit transaction
      await connection.commit();

      return NextResponse.json({
        success: true,
        message: 'Student signed out successfully',
        data: {
          id: existing.id,
          student_id,
          class_id,
          date: today,
          status: 'present',
          time_in: existing.time_in,
          time_out: currentTime
        }
      });

    } catch (dbError: any) {
      // Rollback on database error
      if (connection) await connection.rollback();
      console.error('Database error during sign-out:', dbError);
      
      return NextResponse.json(
        { success: false, error: 'Database error: ' + dbError.message },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Sign-out error:', error);
    
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

// GET handler for retrieving sign-out status
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
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
      `SELECT sa.id, sa.student_id, sa.class_id, sa.date, sa.status, sa.time_in, sa.time_out
       FROM student_attendance sa
       JOIN students s ON sa.student_id = s.id
       WHERE sa.student_id = ? AND sa.class_id = ? AND sa.date = ? AND s.school_id = ?`,
      [student_id, class_id, date, schoolId]
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
    console.error('Error fetching sign-out status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
