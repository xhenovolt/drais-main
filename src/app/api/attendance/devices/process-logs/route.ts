import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Attendance Log Processing Service
 * Matches device logs with students/staff and processes attendance records
 */

/**
 * POST /api/attendance/devices/process-logs
 * Process pending logs and match with students/staff
 */
export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { device_id = null, limit = 100 } = await req.json();

    if (!schoolId) {
      return NextResponse.json(
        { success: false, error: 'School ID is required' },
        { status: 400 }
      );
    }

    connection = await getConnection();

    // Get pending logs
    let query = `
      SELECT al.id, al.device_id, al.device_log_id, al.scan_timestamp, 
             al.raw_data, bd.location_name, bd.location_type
      FROM attendance_logs al
      LEFT JOIN biometric_devices bd ON al.device_id = bd.id
      WHERE al.school_id = ? AND al.processing_status = 'pending'
    `;

    const params: any[] = [schoolId];

    if (device_id) {
      query += ' AND al.device_id = ?';
      params.push(device_id);
    }

    query += ' ORDER BY al.scan_timestamp DESC LIMIT ?';
    params.push(limit);

    const [logs] = await connection.execute(query, params);

    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending logs to process',
        processed: 0,
      });
    }

    let processed = 0;
    let matched = 0;
    let unmatched = 0;

    for (const log of logs as any[]) {
      try {
        const rawData = typeof log.raw_data === 'string' 
          ? JSON.parse(log.raw_data) 
          : log.raw_data;

        // Try to match with student or staff
        let matchedPersonId: number | null = null;
        let personType: 'student' | 'teacher' | null = null;

        // Try matching by CardNo
        if (rawData.CardNo) {
          [matchedPersonId, personType] = await matchByCardNo(
            connection,
            schoolId,
            rawData.CardNo
          );
        }

        // Try matching by UserID if not found
        if (!matchedPersonId && rawData.UserID) {
          [matchedPersonId, personType] = await matchByUserId(
            connection,
            schoolId,
            rawData.UserID
          );
        }

        // Update log with match result
        if (matchedPersonId) {
          await connection.execute(
            `UPDATE attendance_logs 
             SET processing_status = 'processed', 
                 mapped_device_user_id = ?, 
                 device_user_id = ?
             WHERE id = ?`,
            [matchedPersonId, rawData.UserID || null, log.id]
          );

          // Create daily attendance record if it doesn't exist
          await createOrUpdateDailyAttendance(
            connection,
            schoolId,
            personType,
            matchedPersonId,
            new Date(log.scan_timestamp),
            log.location_type
          );

          matched++;
        } else {
          // Mark as processed but unmatched
          await connection.execute(
            `UPDATE attendance_logs 
             SET processing_status = 'processed'
             WHERE id = ?`,
            [log.id]
          );

          unmatched++;
        }

        processed++;
      } catch (error: any) {
        console.error('Error processing log:', error);
        await connection.execute(
          `UPDATE attendance_logs 
           SET processing_status = 'error', 
               process_error_message = ?
           WHERE id = ?`,
          [error.message, log.id]
        );
        processed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processed} logs`,
      processed,
      matched,
      unmatched,
    });

  } catch (error: any) {
    console.error('Log processing error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process logs' },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Match log by card number
 */
async function matchByCardNo(
  connection: any,
  schoolId: number,
  cardNo: string
): Promise<[number | null, 'student' | 'teacher' | null]> {
  try {
    // Try students first
    const [students] = await connection.execute(
      `SELECT s.id FROM students s
       WHERE s.school_id = ? 
       AND (s.student_id_number = ? OR s.id = ?)
       LIMIT 1`,
      [schoolId, cardNo, parseInt(cardNo, 10) || 0]
    );

    if ((students as any[]).length > 0) {
      return [(students as any[])[0].id, 'student'];
    }

    // Try teachers
    const [teachers] = await connection.execute(
      `SELECT t.id FROM teachers t
       WHERE t.school_id = ? 
       AND (t.teacher_id_number = ? OR t.id = ?)
       LIMIT 1`,
      [schoolId, cardNo, parseInt(cardNo, 10) || 0]
    );

    if ((teachers as any[]).length > 0) {
      return [(teachers as any[])[0].id, 'teacher'];
    }

    return [null, null];
  } catch (error) {
    console.error('Match by CardNo error:', error);
    return [null, null];
  }
}

/**
 * Match log by user ID
 */
async function matchByUserId(
  connection: any,
  schoolId: number,
  userId: number
): Promise<[number | null, 'student' | 'teacher' | null]> {
  try {
    // Check device_users table first
    const [deviceUsers] = await connection.execute(
      `SELECT person_id, person_type FROM device_users
       WHERE school_id = ? AND device_user_id = ? AND is_enrolled = TRUE
       LIMIT 1`,
      [schoolId, userId]
    );

    if ((deviceUsers as any[]).length > 0) {
      const { person_id, person_type } = (deviceUsers as any[])[0];
      return [person_id, person_type];
    }

    return [null, null];
  } catch (error) {
    console.error('Match by UserID error:', error);
    return [null, null];
  }
}

/**
 * Create or update daily attendance record
 */
async function createOrUpdateDailyAttendance(
  connection: any,
  schoolId: number,
  personType: 'student' | 'teacher',
  personId: number,
  scanTime: Date,
  locationType?: string
): Promise<void> {
  try {
    const attendanceDate = new Date(scanTime);
    attendanceDate.setHours(0, 0, 0, 0);

    // Check if record exists
    const [existing] = await connection.execute(
      `SELECT id, first_arrival_time FROM daily_attendance
       WHERE school_id = ? AND person_type = ? AND person_id = ? 
       AND attendance_date = ?
       LIMIT 1`,
      [schoolId, personType, personId, attendanceDate]
    );

    const scanTimeObj = new Date(scanTime);
    const timeStr = scanTimeObj.toTimeString().split(' ')[0]; // HH:MM:SS

    if ((existing as any[]).length > 0) {
      // Update existing - set last_departure_time if exit, first_arrival_time if entry
      const record = (existing as any[])[0];
      if (!record.first_arrival_time) {
        await connection.execute(
          `UPDATE daily_attendance
           SET first_arrival_time = ?, status = 'present'
           WHERE id = ?`,
          [timeStr, record.id]
        );
      } else {
        await connection.execute(
          `UPDATE daily_attendance
           SET last_departure_time = ?
           WHERE id = ?`,
          [timeStr, record.id]
        );
      }
    } else {
      // Create new record
      await connection.execute(
        `INSERT INTO daily_attendance
         (schoolId, person_type, person_id, attendance_date, 
          first_arrival_time, status, arrival_device_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [schoolId, personType, personId, attendanceDate, timeStr, 'present', null]
      );
    }
  } catch (error: any) {
    console.error('Error creating daily attendance:', error);
    // Don't throw - continue processing other records
  }
}
