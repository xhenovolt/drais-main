import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/utils/database';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  try {
    const { class_id, date, action } = await request.json();

    if (!class_id || !date || !action) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    // Get all active students in the class with their enrollment details
    const studentsQuery = `
      SELECT s.id, e.id AS enrollment_id, e.term_id
      FROM students s
      JOIN enrollments e ON s.id = e.student_id
      WHERE e.class_id = ? 
        AND e.status = 'active'
        AND s.status IN ('active', 'suspended', 'on_leave')
        AND (e.joined_at IS NULL OR e.joined_at <= ?)
        AND (e.end_date IS NULL OR e.end_date >= ?)
    `;
    const students = await executeQuery(studentsQuery, [class_id, date, date]) as any[];

    if (students.length === 0) {
      return NextResponse.json({ success: false, message: 'No students found in this class' }, { status: 404 });
    }

    const currentTime = new Date().toTimeString().split(' ')[0];
    let successCount = 0;
    let errorCount = 0;

    for (const student of students) {
      try {
        // Check if attendance record exists
        const existingRecord = await executeQuery(
          'SELECT id FROM student_attendance WHERE student_id = ? AND date = ? AND class_id = ?',
          [student.id, date, class_id]
        ) as any[];

        let query = '';
        let params: any[] = [];

        if (action === 'mark_all_present') {
          if (existingRecord.length > 0) {
            query = `
              UPDATE student_attendance 
              SET status = 'present', time_in = ?, enrollment_id = COALESCE(enrollment_id, ?), term_id = COALESCE(term_id, ?), updated_at = NOW()
              WHERE student_id = ? AND date = ? AND class_id = ?
            `;
            params = [currentTime, student.enrollment_id, student.term_id, student.id, date, class_id];
          } else {
            query = `
              INSERT INTO student_attendance (student_id, date, class_id, status, time_in, enrollment_id, term_id)
              VALUES (?, ?, ?, 'present', ?, ?, ?)
            `;
            params = [student.id, date, class_id, currentTime, student.enrollment_id, student.term_id];
          }
        } else if (action === 'mark_all_absent') {
          if (existingRecord.length > 0) {
            query = `
              UPDATE student_attendance 
              SET status = 'absent', time_in = NULL, time_out = NULL, enrollment_id = COALESCE(enrollment_id, ?), term_id = COALESCE(term_id, ?), updated_at = NOW()
              WHERE student_id = ? AND date = ? AND class_id = ?
            `;
            params = [student.enrollment_id, student.term_id, student.id, date, class_id];
          } else {
            query = `
              INSERT INTO student_attendance (student_id, date, class_id, status, enrollment_id, term_id)
              VALUES (?, ?, ?, 'absent', ?, ?)
            `;
            params = [student.id, date, class_id, student.enrollment_id, student.term_id];
          }
        }

        await executeQuery(query, params);
        successCount++;

      } catch (error) {
        console.error(`Error updating attendance for student ${student.id}:`, error);
        errorCount++;
      }
    }

    // Log bulk action
    const logQuery = `
      INSERT INTO audit_log (action, entity_type, entity_id, changes_json, created_at)
      VALUES (?, 'bulk_attendance', ?, ?, NOW())
    `;
    await executeQuery(logQuery, [
      action,
      class_id,
      JSON.stringify({ 
        class_id, 
        date, 
        action, 
        success_count: successCount,
        error_count: errorCount,
        timestamp: new Date().toISOString() 
      })
    ]);

    return NextResponse.json({
      success: true,
      message: `Bulk attendance update completed`,
      data: {
        total_students: students.length,
        success_count: successCount,
        error_count: errorCount,
        class_id,
        date,
        action
      }
    });

  } catch (error) {
    console.error('Error in bulk attendance operation:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update bulk attendance' },
      { status: 500 }
    );
  }
}
