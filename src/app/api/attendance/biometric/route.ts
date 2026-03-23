import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const body = await req.json();
    const { credential_id, authenticator_data, client_data_json, signature, date } = body;

    if (!credential_id || !authenticator_data || !signature) {
      return NextResponse.json({
        success: false,
        error: 'Missing biometric verification data'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Find student by credential_id
    const [fingerprintResult] = await connection.execute(
      'SELECT student_id FROM student_fingerprints WHERE credential_id = ? AND is_active = 1',
      [credential_id]
    );

    if (!Array.isArray(fingerprintResult) || fingerprintResult.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Fingerprint not found or inactive'
      }, { status: 404 });
    }

    const studentId = fingerprintResult[0].student_id;
    const attendanceDate = date || new Date().toISOString().split('T')[0];

    // Update last used timestamp
    await connection.execute(
      'UPDATE student_fingerprints SET last_used_at = CURRENT_TIMESTAMP, counter = counter + 1 WHERE credential_id = ?',
      [credential_id]
    );

    // Get student's class
    const [classResult] = await connection.execute(
      'SELECT class_id FROM enrollments WHERE student_id = ? AND status = "active" LIMIT 1',
      [studentId]
    );

    const classId = Array.isArray(classResult) && classResult.length > 0 
      ? classResult[0].class_id : null;

    const now = new Date();
    const timeIn = now.toTimeString().split(' ')[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Determine if late (after 8:30 AM)
    const isLate = currentHour > 8 || (currentHour === 8 && currentMinute > 30);
    const status = isLate ? 'late' : 'present';

    // Mark attendance
    await connection.execute(
      `INSERT INTO student_attendance (student_id, date, status, method, time_in, class_id, marked_at)
       VALUES (?, ?, ?, 'biometric', ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         status = VALUES(status),
         method = VALUES(method),
         time_in = VALUES(time_in),
         marked_at = VALUES(marked_at)`,
      [studentId, attendanceDate, status, timeIn, classId, now]
    );

    // Get student details for response
    const [studentResult] = await connection.execute(
      'SELECT p.first_name, p.last_name FROM students s JOIN people p ON s.person_id = p.id WHERE s.id = ?',
      [studentId]
    );

    const studentName = Array.isArray(studentResult) && studentResult.length > 0
      ? `${studentResult[0].first_name} ${studentResult[0].last_name}`
      : 'Unknown Student';

    return NextResponse.json({
      success: true,
      message: `${studentName} marked as ${status}`,
      data: {
        student_id: studentId,
        student_name: studentName,
        status: status,
        time_in: timeIn,
        method: 'biometric'
      }
    });

  } catch (error: any) {
    console.error('Biometric attendance error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process biometric attendance'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
