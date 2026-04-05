import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { 
  parseDahuaRawData, 
  generateMockDahuaData,
  formatToMySQLDateTime,
  determineAttendanceStatus
} from '@/lib/dahua';
import { getSessionSchoolId } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/attendance/dahua/[id]/sync
 * Trigger a sync operation for a specific Dahua device
 * 
 * Body params:
 * - mock: boolean - use mock data for testing
 * - records: array - manually provided records (optional)
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { id } = await params;
    const body = await req.json();
    const { mock = false, records: manualRecords } = body;

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

    // Create sync history entry
    const [syncResult] = await connection.execute(
      `INSERT INTO dahua_sync_history (
        device_id, sync_type, records_fetched, status, started_at
      ) VALUES (?, 'manual', 0, 'in_progress', NOW())`,
      [id]
    );

    const syncId = (syncResult as any).insertId;

    // Try to fetch data from device
    let rawData: string;
    let source = 'device';

    if (manualRecords && Array.isArray(manualRecords)) {
      // Use manually provided records
      rawData = `found=${manualRecords.length}\n` + 
        manualRecords.map((r: any, i: number) => 
          `records[${i}].RecNo=${i + 1}\nrecords[${i}].CardNo=${r.cardNo || ''}\nrecords[${i}].CreateTime=${r.createTime}\nrecords[${i}].Method=${r.method || '1'}\nrecords[${i}].Type=${r.type || 'Entry'}\nrecords[${i}].AttendanceState=0`
        ).join('\n');
      source = 'manual';
    } else if (mock) {
      // Use mock data for testing
      rawData = generateMockDahuaData(20);
      source = 'mock';
    } else {
      // Try to fetch from actual device
      try {
        const response = await fetch(`${device.protocol}://${device.ip_address}:${device.port}${device.api_url}`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${device.username || ''}:${device.password || ''}`).toString('base64')}`,
            'Content-Type': 'text/plain'
          },
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
          throw new Error(`Device API returned ${response.status}`);
        }

        rawData = await response.text();
      } catch (fetchError: any) {
        // Update sync history with error
        await connection.execute(
          `UPDATE dahua_sync_history 
           SET status = 'failed', error_details = ?, completed_at = NOW() 
           WHERE id = ?`,
          [fetchError.message, syncId]
        );

        // Update device status
        await connection.execute(
          `UPDATE dahua_devices 
           SET last_sync_status = 'failed', last_error_message = ? 
           WHERE id = ?`,
          [fetchError.message, id]
        );

        return NextResponse.json({
          success: false,
          error: 'Failed to connect to device',
          details: fetchError.message,
          device_status: 'offline'
        }, { status: 502 });
      }
    }

    // Store raw log
    const parseResult = parseDahuaRawData(rawData);

    const [rawLogResult] = await connection.execute(
      `INSERT INTO dahua_raw_logs (device_id, raw_data, record_count, parsed_successfully, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [id, rawData, parseResult.found, parseResult.success ? 1 : 0]
    );

    const rawLogId = (rawLogResult as any).insertId;

    if (!parseResult.success) {
      await connection.execute(
        `UPDATE dahua_sync_history 
         SET status = 'failed', records_fetched = ?, error_details = ?, completed_at = NOW() 
         WHERE id = ?`,
        [parseResult.found, parseResult.errors.join('; '), syncId]
      );

      return NextResponse.json({
        success: false,
        error: 'Failed to parse device data',
        details: parseResult.errors
      }, { status: 400 });
    }

    // Process records
    let processedCount = 0;
    let failedCount = 0;
    const errors: any[] = [];

    for (const record of parseResult.records) {
      try {
        // Match with student by card_no
        let studentId: number | null = null;

        if (record.cardNo) {
          // Check students table
          const [students] = await connection.execute(
            `SELECT s.id FROM students s 
             WHERE s.card_no = ? OR s.admission_number = ? 
             LIMIT 1`,
            [record.cardNo, record.cardNo]
          );

          if (Array.isArray(students) && students.length > 0) {
            studentId = (students[0] as any).id;
          } else {
            // Check fingerprints table
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

        // Determine attendance status
        const status = determineAttendanceStatus(
          record.createTime,
          device.late_threshold_minutes || 30
        );

        // Insert normalized log
        await connection.execute(
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

        // Update main attendance table if student matched and it's an entry
        if (studentId && record.type === 'Entry') {
          const attendanceDate = record.createTime.toISOString().split('T')[0];
          const attendanceTime = record.createTime.toTimeString().split(' ')[0];

          // Get student's enrollment
          const [enrollments] = await connection.execute(
            `SELECT class_id, stream_id, academic_year_id FROM enrollments 
             WHERE student_id = ? AND status = 'active' LIMIT 1`,
            [studentId]
          );

          if (Array.isArray(enrollments) && enrollments.length > 0) {
            const enrollment = enrollments[0] as any;

            // Check for existing attendance
            const [existing] = await connection.execute(
              `SELECT id FROM student_attendance 
               WHERE student_id = ? AND date = ?`,
              [studentId, attendanceDate]
            );

            if (Array.isArray(existing) && existing.length > 0) {
              // Update - only if new status is earlier in the day or present
              await connection.execute(
                `UPDATE student_attendance 
                 SET status = ?, time_in = ?, device_id = ?, method = 'biometric', marked_at = NOW()
                 WHERE id = ?`,
                [status, attendanceTime, id, (existing[0] as any).id]
              );
            } else {
              // Insert new attendance
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

        processedCount++;

      } catch (recordError: any) {
        failedCount++;
        errors.push({
          record: record.recNo,
          error: recordError.message
        });
      }
    }

    // Update sync history
    const syncStatus = failedCount > 0 ? (processedCount > 0 ? 'partial' : 'failed') : 'success';
    
    await connection.execute(
      `UPDATE dahua_sync_history 
       SET records_fetched = ?, records_processed = ?, records_failed = ?, 
           status = ?, completed_at = NOW() 
       WHERE id = ?`,
      [parseResult.found, processedCount, failedCount, syncStatus, syncId]
    );

    // Update device status
    await connection.execute(
      `UPDATE dahua_devices 
       SET last_sync = NOW(), last_sync_status = ?, 
           last_error_message = ? 
       WHERE id = ?`,
      [syncStatus, errors.length > 0 ? errors.map(e => e.error).join('; ') : null, id]
    );

    return NextResponse.json({
      success: true,
      message: `Sync completed: ${processedCount}/${parseResult.found} records processed`,
      data: {
        sync_id: syncId,
        source,
        device_id: id,
        device_name: device.device_name,
        total_fetched: parseResult.found,
        processed: processedCount,
        failed: failedCount,
        status: syncStatus,
        errors: errors.slice(0, 10) // Limit errors in response
      }
    });

  } catch (error: any) {
    console.error('Dahua sync error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to sync device'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * GET /api/attendance/dahua/[id]/sync
 * Get sync history for a device
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit', 10) || '20', 10);

    connection = await getConnection();

    const [rows] = await connection.execute(
      `SELECT 
        ds.*,
        d.device_name
      FROM dahua_sync_history ds
      JOIN dahua_devices d ON ds.device_id = d.id
      WHERE ds.device_id = ?
      ORDER BY ds.started_at DESC
      LIMIT ?`,
      [id, limit]
    );

    return NextResponse.json({
      success: true,
      data: rows || []
    });

  } catch (error: any) {
    console.error('Dahua sync history error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch sync history'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
