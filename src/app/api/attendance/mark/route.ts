import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/utils/database';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { student_id, class_id, date, action, method, time } = await request.json();

    if (!student_id || !class_id || !date || !action) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
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
      return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    }

    // Resolve active enrollment_id for this student+class on the given date
    const enrollmentRows = await executeQuery(
      `SELECT e.id AS enrollment_id, e.term_id
       FROM enrollments e
       WHERE e.student_id = ? AND e.class_id = ? AND e.school_id = ?
         AND e.status = 'active'
         AND (e.joined_at IS NULL OR e.joined_at <= ?)
         AND (e.end_date IS NULL OR e.end_date >= ?)
       LIMIT 1`,
      [student_id, class_id, schoolId, date, date]
    ) as any[];
    const enrollmentId: number | null = enrollmentRows[0]?.enrollment_id ?? null;
    const termId: number | null = enrollmentRows[0]?.term_id ?? null;

    // Check if attendance record exists for this student, date, and class
    const existingRecord = await executeQuery(
      'SELECT * FROM student_attendance WHERE student_id = ? AND date = ? AND class_id = ?',
      [student_id, date, class_id]
    );

    switch (action) {
      case 'sign_in':
        if ((existingRecord as any[]).length > 0) {
          // Update existing record
          query = `
            UPDATE student_attendance 
            SET status = 'present', time_in = ?, enrollment_id = COALESCE(enrollment_id, ?), term_id = COALESCE(term_id, ?), updated_at = NOW()
            WHERE student_id = ? AND date = ? AND class_id = ?
          `;
          params = [currentTime, enrollmentId, termId, student_id, date, class_id];
        } else {
          // Insert new record
          query = `
            INSERT INTO student_attendance (student_id, date, class_id, status, time_in, enrollment_id, term_id)
            VALUES (?, ?, ?, 'present', ?, ?, ?)
          `;
          params = [student_id, date, class_id, currentTime, enrollmentId, termId];
        }
        break;

      case 'sign_out':
        if ((existingRecord as any[]).length > 0) {
          query = `
            UPDATE student_attendance 
            SET time_out = ?, updated_at = NOW()
            WHERE student_id = ? AND date = ? AND class_id = ?
          `;
          params = [currentTime, student_id, date, class_id];
        } else {
          return NextResponse.json({ success: false, message: 'Student must sign in first' }, { status: 400 });
        }
        break;

      case 'mark_absent':
        if ((existingRecord as any[]).length > 0) {
          query = `
            UPDATE student_attendance 
            SET status = 'absent', time_in = NULL, time_out = NULL, enrollment_id = COALESCE(enrollment_id, ?), term_id = COALESCE(term_id, ?), updated_at = NOW()
            WHERE student_id = ? AND date = ? AND class_id = ?
          `;
          params = [enrollmentId, termId, student_id, date, class_id];
        } else {
          query = `
            INSERT INTO student_attendance (student_id, date, class_id, status, enrollment_id, term_id)
            VALUES (?, ?, ?, 'absent', ?, ?)
          `;
          params = [student_id, date, class_id, enrollmentId, termId];
        }
        break;

      default:
        return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
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
      { success: false, message: 'Failed to mark attendance' },
      { status: 500 }
    );
  }
}
