import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * POST /api/attendance/biometric/sync
 * Sync attendance data from biometric device
 * This endpoint receives attendance logs from the fingerprint machine
 */
export async function POST(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const {
      device_id,
      attendance_records,  // Array of: { biometric_uuid, timestamp, quality_score? }
      initiated_by
    } = body;

    if (!device_id || !Array.isArray(attendance_records) || attendance_records.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'device_id and attendance_records array are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Create sync log entry
    const [syncLogResult] = await connection.execute(
      `INSERT INTO device_sync_logs (
        school_id, device_id, sync_type, sync_direction, status,
        records_processed, initiated_by, started_at
      ) VALUES (?, ?, 'attendance_download', 'pull', 'in_progress', ?, ?, NOW())`,
      [schoolId, device_id, attendance_records.length, initiated_by]
    );

    const syncLogId = (syncLogResult as any).insertId;

    let processedCount = 0;
    let syncedCount = 0;
    let failedCount = 0;
    const errors: any[] = [];

    // Process each attendance record
    for (const record of attendance_records) {
      try {
        const { biometric_uuid, timestamp, quality_score = 0 } = record;

        // Find student with this biometric UUID
        const [students] = await connection.execute(
          `SELECT sf.student_id, s.school_id
           FROM student_fingerprints sf
           JOIN students s ON sf.student_id = s.id
           WHERE sf.biometric_uuid = ? AND sf.status = 'active'
           LIMIT 1`,
          [biometric_uuid]
        );

        if (!Array.isArray(students) || students.length === 0) {
          failedCount++;
          errors.push({
            biometric_uuid,
            timestamp,
            error: 'No matching student found'
          });
          continue;
        }

        const { student_id, schoolId: studentSchoolId } = (students[0] as any);
        const attendanceDate = new Date(timestamp).toISOString().split('T')[0];
        const attendanceTime = new Date(timestamp).toTimeString().split(' ')[0];

        // Get student's active enrollment for this date
        const [enrollments] = await connection.execute(
          `SELECT e.id, e.class_id, e.stream_id, e.academic_year_id
           FROM enrollments e
           WHERE e.student_id = ? AND e.status = 'active'
           LIMIT 1`,
          [student_id]
        );

        if (!Array.isArray(enrollments) || enrollments.length === 0) {
          failedCount++;
          errors.push({
            biometric_uuid,
            timestamp,
            error: 'Student has no active enrollment'
          });
          continue;
        }

        const { class_id, stream_id, academic_year_id } = (enrollments[0] as any);

        // Check if attendance already recorded for this student today
        const [existingAttendance] = await connection.execute(
          `SELECT id FROM student_attendance
           WHERE student_id = ? AND date = ? AND method = 'biometric'`,
          [student_id, attendanceDate]
        );

        if (Array.isArray(existingAttendance) && existingAttendance.length > 0) {
          // Update existing record
          await connection.execute(
            `UPDATE student_attendance
             SET status = 'present', time_in = ?, device_id = ?,
                 biometric_timestamp = FROM_UNIXTIME(?),
                 confidence_score = ?, method = 'biometric'
             WHERE id = ?`,
            [attendanceTime, device_id, Math.floor(new Date(timestamp).getTime() / 1000),
             quality_score, (existingAttendance[0] as any).id]
          );
        } else {
          // Create new attendance record
          await connection.execute(
            `INSERT INTO student_attendance (
              student_id, date, class_id, stream_id, academic_year_id,
              status, time_in, device_id, biometric_timestamp,
              confidence_score, method, marked_at
            ) VALUES (?, ?, ?, ?, ?, 'present', ?, ?, FROM_UNIXTIME(?), ?, 'biometric', NOW())`,
            [student_id, attendanceDate, class_id, stream_id, academic_year_id,
             attendanceTime, device_id, Math.floor(new Date(timestamp).getTime() / 1000),
             quality_score]
          );
        }

        syncedCount++;
        processedCount++;

      } catch (recordError: any) {
        failedCount++;
        processedCount++;
        errors.push({
          record,
          error: recordError.message
        });
      }
    }

    // Update sync log with completion status
    const durationSeconds = Math.floor((Date.now() - new Date().getTime()) / 1000);
    await connection.execute(
      `UPDATE device_sync_logs
       SET status = 'success',
           records_processed = ?, records_synced = ?, records_failed = ?,
           details_json = ?, completed_at = NOW(), duration_seconds = ?
       WHERE id = ?`,
      [
        processedCount,
        syncedCount,
        failedCount,
        JSON.stringify({ errors }),
        durationSeconds,
        syncLogId
      ]
    );

    // Update device sync status
    await connection.execute(
      `UPDATE biometric_devices
       SET last_sync_at = NOW(), sync_status = 'synced',
           last_sync_record_count = ?, enrollment_count = enrollment_count + ?
       WHERE id = ?`,
      [syncedCount, syncedCount, device_id]
    );

    return NextResponse.json({
      success: true,
      message: `Biometric sync completed: ${syncedCount}/${attendance_records.length} records synced`,
      data: {
        sync_log_id: syncLogId,
        total_records: attendance_records.length,
        synced_count: syncedCount,
        failed_count: failedCount,
        sync_percentage: Math.round((syncedCount / attendance_records.length) * 100)
      }
    });

  } catch (error: any) {
    console.error('Biometric sync error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to sync biometric attendance'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * GET /api/attendance/biometric/sync-status
 * Check sync status for a device
 */
export async function GET(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get('device_id');
    // school_id derived from session below

    connection = await getConnection();

    let query = `
      SELECT 
        bd.id,
        bd.device_name,
        bd.device_code,
        bd.status,
        bd.last_sync_at,
        bd.sync_status,
        bd.last_sync_record_count,
        bd.enrollment_count,
        COUNT(dsl.id) as total_syncs,
        COUNT(CASE WHEN dsl.status = 'success' THEN 1 END) as successful_syncs,
        COUNT(CASE WHEN dsl.status = 'failed' THEN 1 END) as failed_syncs,
        MAX(dsl.started_at) as last_sync_time
      FROM biometric_devices bd
      LEFT JOIN device_sync_logs dsl ON bd.id = dsl.device_id
      WHERE bd.school_id = ?
    `;

    const params: any[] = [schoolId];

    if (deviceId) {
      query += ` AND bd.id = ?`;
      params.push(deviceId);
    }

    query += ` GROUP BY bd.id ORDER BY bd.device_name`;

    const [rows] = await connection.execute(query, params);

    return NextResponse.json({
      success: true,
      data: rows || []
    });

  } catch (error: any) {
    console.error('Sync status fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch sync status'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
