import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/utils/database';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { student_id, class_id, date, action, method, time } = await request.json();

    if (!student_id || !class_id || !date || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const currentTime = new Date().toTimeString().split(' ')[0]; // HH:MM:SS format
    const currentDateTime = new Date();

    let query = '';
    let params: any[] = [];

    // Verify student belongs to this school
    const studentCheck = await executeQuery(
      'SELECT id FROM students WHERE id = ? AND school_id = ?',
      [student_id, schoolId]
    );
    if (!Array.isArray(studentCheck) || studentCheck.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Check if attendance record exists for this student, date, and class
    const existingRecord = await executeQuery(
      'SELECT * FROM student_attendance WHERE student_id = ? AND date = ? AND class_id = ?',
      [student_id, date, class_id]
    );

    switch (action) {
      case 'sign_in':
        if (existingRecord.length > 0) {
          // Update existing record
          query = `
            UPDATE student_attendance 
            SET status = 'present', time_in = ?, updated_at = NOW()
            WHERE student_id = ? AND date = ? AND class_id = ?
          `;
          params = [currentTime, student_id, date, class_id];
        } else {
          // Insert new record
          query = `
            INSERT INTO student_attendance (student_id, date, class_id, status, time_in)
            VALUES (?, ?, ?, 'present', ?)
          `;
          params = [student_id, date, class_id, currentTime];
        }
        break;

      case 'sign_out':
        if (existingRecord.length > 0) {
          query = `
            UPDATE student_attendance 
            SET time_out = ?, updated_at = NOW()
            WHERE student_id = ? AND date = ? AND class_id = ?
          `;
          params = [currentTime, student_id, date, class_id];
        } else {
          return NextResponse.json({ error: 'Student must sign in first' }, { status: 400 });
        }
        break;

      case 'mark_absent':
        if (existingRecord.length > 0) {
          query = `
            UPDATE student_attendance 
            SET status = 'absent', time_in = NULL, time_out = NULL, updated_at = NOW()
            WHERE student_id = ? AND date = ? AND class_id = ?
          `;
          params = [student_id, date, class_id];
        } else {
          query = `
            INSERT INTO student_attendance (student_id, date, class_id, status)
            VALUES (?, ?, ?, 'absent')
          `;
          params = [student_id, date, class_id];
        }
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await executeQuery(query, params);

    // Log the attendance action
    const logQuery = `
      INSERT INTO audit_log (action, entity_type, entity_id, changes_json, created_at)
      VALUES (?, 'attendance', ?, ?, NOW())
    `;
    await executeQuery(logQuery, [
      `attendance_${action}`,
      student_id,
      JSON.stringify({ 
        student_id, 
        class_id, 
        date, 
        action, 
        method, 
        timestamp: currentDateTime.toISOString() 
      })
    ]);

    return NextResponse.json({
      success: true,
      message: `Student attendance ${action.replace('_', ' ')} successfully`,
      data: {
        student_id,
        class_id,
        date,
        action,
        time: currentTime
      }
    });

  } catch (error) {
    console.error('Error marking attendance:', error);
    return NextResponse.json(
      { error: 'Failed to mark attendance' },
      { status: 500 }
    );
  }
}
