import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { 
  parseDahuaRawData, 
  generateMockDahuaData,
  formatToMySQLDateTime,
  determineAttendanceStatus,
  NormalizedDahuaRecord
} from '@/lib/dahua';
import { getSessionSchoolId } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/attendance/dahua/[id]/logs
 * Fetch and normalize logs from a specific Dahua device
 * 
 * Query params:
 * - mock: boolean - use mock data for testing
 * - limit: number - limit number of records returned
 * - date: string - filter by date (YYYY-MM-DD)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const useMock = searchParams.get('mock') === 'true';
    const limit = parseInt(searchParams.get('limit', 10) || '100', 10);
    const dateFilter = searchParams.get('date');

    connection = await getConnection();

    // Get device configuration
    const [devices] = await connection.execute(
      'SELECT * FROM dahua_devices WHERE id = ?',
      [id]
    );

    if (!Array.isArray(devices) || devices.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Device not found'
      }, { status: 404 });
    }

    const device = devices[0] as any;

    // Try to fetch data from actual device if not using mock
    let rawData: string;
    
    if (useMock) {
      // Use mock data for testing
      rawData = generateMockDahuaData(limit);
    } else {
      // Try to fetch from actual device
      try {
        const response = await fetch(`${device.protocol}://${device.ip_address}:${device.port}${device.api_url}`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${device.username || ''}:${device.password || ''}`).toString('base64')}`,
            'Content-Type': 'text/plain'
          },
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        if (!response.ok) {
          throw new Error(`Device API returned ${response.status}`);
        }

        rawData = await response.text();
      } catch (fetchError: any) {
        // If device is unreachable, return recent logs from database
        console.warn('Device unreachable, returning cached logs:', fetchError.message);
        
        const [cachedLogs] = await connection.execute(
          `SELECT 
            dal.*,
            s.first_name,
            s.last_name,
            p.other_name
          FROM dahua_attendance_logs dal
          LEFT JOIN students s ON dal.student_id = s.id
          LEFT JOIN people p ON s.person_id = p.id
          WHERE dal.device_id = ? 
          ORDER BY dal.event_time DESC 
          LIMIT ?`,
          [id, limit]
        );

        return NextResponse.json({
          success: true,
          data: {
            source: 'cached',
            device_id: id,
            device_name: device.device_name,
            records: cachedLogs || [],
            message: 'Returning cached logs - device is currently unreachable'
          }
        });
      }
    }

    // Parse raw data
    const parseResult = parseDahuaRawData(rawData);

    // Store raw log
    const [rawLogResult] = await connection.execute(
      `INSERT INTO dahua_raw_logs (device_id, raw_data, record_count, parsed_successfully, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [id, rawData, parseResult.found, parseResult.success ? 1 : 0]
    );

    const rawLogId = (rawLogResult as any).insertId;

    // If parsing failed, return error
    if (!parseResult.success) {
      await connection.execute(
        `UPDATE dahua_devices SET last_sync_status = 'failed', last_error_message = ? WHERE id = ?`,
        [parseResult.errors.join(', '), id]
      );

      return NextResponse.json({
        success: false,
        error: 'Failed to parse device data',
        details: parseResult.errors
      }, { status: 400 });
    }

    // Process and normalize records
    const processedRecords = [];
    const errors: any[] = [];

    for (const record of parseResult.records) {
      try {
        // Try to match with student by card_no
        let studentId: number | null = null;
        
        if (record.cardNo) {
          // First check students table directly
          const [students] = await connection.execute(
            `SELECT s.id FROM students s 
             WHERE s.card_no = ? OR s.admission_number = ? 
             LIMIT 1`,
            [record.cardNo, record.cardNo]
          );

          if (Array.isArray(students) && students.length > 0) {
            studentId = (students[0] as any).id;
          } else {
            // Check student_fingerprints for biometric match
            const [fingerprints] = await connection.execute(
              `SELECT sf.student_id FROM student_fingerprints sf 
               WHERE sf.biometric_uuid = ? AND sf.status = 'active' 
               LIMIT 1`,
              [record.cardNo]
            );

            if (Array.isArray(fingerprints) && fingerprints.length > 0) {
              studentId = (fingerprints[0] as any).student_id;
            }
          }
        }

        // Determine attendance status based on time
        const status = determineAttendanceStatus(
          record.createTime,
          device.late_threshold_minutes || 30
        );

        // Insert normalized log
        const [insertResult] = await connection.execute(
          `INSERT INTO dahua_attendance_logs (
            device_id, student_id, card_no, user_id, event_time, event_type,
            method, status, raw_log_id, matched_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            id,
            studentId,
            record.cardNo,
            record.userId,
            formatToMySQLDateTime(record.createTime),
            record.type,
            record.methodType,
            status,
            rawLogId
          ]
        );

        // Also insert into main student_attendance if student matched
        if (studentId && record.type === 'Entry') {
          const attendanceDate = record.createTime.toISOString().split('T')[0];
          const attendanceTime = record.createTime.toTimeString().split(' ')[0];

          // Check if student has active enrollment
          const [enrollments] = await connection.execute(
            `SELECT class_id, stream_id, academic_year_id FROM enrollments 
             WHERE student_id = ? AND status = 'active' LIMIT 1`,
            [studentId]
          );

          if (Array.isArray(enrollments) && enrollments.length > 0) {
            const enrollment = enrollments[0] as any;

            // Check if attendance already exists for today
            const [existing] = await connection.execute(
              `SELECT id FROM student_attendance 
               WHERE student_id = ? AND date = ? AND method = 'biometric'`,
              [studentId, attendanceDate]
            );

            if (Array.isArray(existing) && existing.length > 0) {
              // Update existing record
              await connection.execute(
                `UPDATE student_attendance 
                 SET status = ?, time_in = ?, device_id = ?, method = 'biometric', marked_at = NOW()
                 WHERE id = ?`,
                [status, attendanceTime, id, (existing[0] as any).id]
              );
            } else {
              // Create new attendance record
              await connection.execute(
                `INSERT INTO student_attendance (
                  student_id, date, class_id, stream_id, academic_year_id,
                  status, time_in, device_id, method, marked_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'biometric', NOW())`,
                [
                  studentId, attendanceDate, 
                  enrollment.class_id, enrollment.stream_id, enrollment.academic_year_id,
                  status, attendanceTime, id
                ]
              );
            }
          }
        }

        processedRecords.push({
          ...record,
          student_id: studentId,
          status
        });

      } catch (recordError: any) {
        errors.push({
          record: record.recNo,
          error: recordError.message
        });
      }
    }

    // Update device sync status
    await connection.execute(
      `UPDATE dahua_devices 
       SET last_sync = NOW(), last_sync_status = 'success', 
           last_error_message = NULL 
       WHERE id = ?`,
      [id]
    );

    // Record sync history
    await connection.execute(
      `INSERT INTO dahua_sync_history (
        device_id, sync_type, records_fetched, records_processed, 
        records_failed, status, started_at, completed_at
      ) VALUES (?, 'manual', ?, ?, ?, 'success', NOW(), NOW())`,
      [id, parseResult.found, processedRecords.length, errors.length]
    );

    return NextResponse.json({
      success: true,
      data: {
        source: useMock ? 'mock' : 'device',
        device_id: id,
        device_name: device.device_name,
        total_records: parseResult.found,
        processed_records: processedRecords.length,
        failed_records: errors.length,
        records: processedRecords,
        parse_errors: parseResult.errors
      }
    });

  } catch (error: any) {
    console.error('Dahua logs fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch device logs'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}