/**
 * DRAIS Attendance Engine
 * Central processor for all attendance records from any device type
 * Ensures validation, tenant isolation, and duplicate prevention
 */

import { getConnection } from '@/lib/db';

export interface AttendanceRecord {
  schoolId: number;
  studentId: number;
  deviceId: number;
  deviceType: string;
  method: string;
  scanType: string;
  timestamp: Date;
}

export interface ProcessResult {
  success: boolean;
  message: string;
  isDuplicate?: boolean;
  attendanceId?: number;
}

/**
 * Process a single attendance record
 * Validates tenant isolation, student mapping, and prevents duplicates
 */
export async function processAttendance(record: AttendanceRecord): Promise<ProcessResult> {
  let connection;
  
  try {
    connection = await getConnection();
    
    // STEP 1: Validate school isolation
    const [studentCheck] = await connection.execute(
      `SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
      [record.studentId, record.schoolId]
    ) as any;
    
    if (!studentCheck || studentCheck.length === 0) {
      return {
        success: false,
        message: `Student ${record.studentId} not found in school ${record.schoolId}`
      };
    }
    
    // STEP 2: Check for duplicate scan (within 60 seconds)
    const duplicateWindow = new Date(record.timestamp.getTime() - 60 * 1000);
    const [duplicateCheck] = await connection.execute(
      `SELECT id FROM attendance 
       WHERE student_id = ? 
       AND school_id = ? 
       AND timestamp >= ? 
       AND timestamp <= ?
       LIMIT 1`,
      [record.studentId, record.schoolId, duplicateWindow, record.timestamp]
    ) as any;
    
    if (duplicateCheck && duplicateCheck.length > 0) {
      return {
        success: true,
        message: 'Duplicate scan ignored (within 60 seconds)',
        isDuplicate: true
      };
    }
    
    // STEP 3: Insert attendance record
    const [result] = await connection.execute(
      `INSERT INTO attendance 
       (school_id, student_id, device_id, device_type, method, scan_type, timestamp, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'present')`,
      [
        record.schoolId,
        record.studentId,
        record.deviceId,
        record.deviceType,
        record.method,
        record.scanType,
        record.timestamp
      ]
    ) as any;
    
    return {
      success: true,
      message: 'Attendance recorded successfully',
      isDuplicate: false,
      attendanceId: result.insertId
    };
    
  } catch (error: any) {
    console.error('[AttendanceEngine] Error processing attendance:', error);
    return {
      success: false,
      message: error.message || 'Failed to process attendance'
    };
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Process multiple attendance records in batch
 */
export async function processAttendanceBatch(records: AttendanceRecord[]): Promise<{
  total: number;
  processed: number;
  duplicates: number;
  failed: number;
  results: ProcessResult[];
}> {
  const results: ProcessResult[] = [];
  let processed = 0;
  let duplicates = 0;
  let failed = 0;
  
  for (const record of records) {
    const result = await processAttendance(record);
    results.push(result);
    
    if (result.success) {
      if (result.isDuplicate) {
        duplicates++;
      } else {
        processed++;
      }
    } else {
      failed++;
    }
  }
  
  return {
    total: records.length,
    processed,
    duplicates,
    failed,
    results
  };
}

/**
 * Map device user ID to student ID
 */
export async function mapDeviceUserToStudent(
  deviceId: number,
  deviceUserId: string,
  schoolId: number
): Promise<number | null> {
  let connection;
  
  try {
    connection = await getConnection();
    
    const [mapping] = await connection.execute(
      `SELECT student_id FROM device_users 
       WHERE device_id = ? 
       AND device_user_id = ? 
       AND school_id = ? 
       LIMIT 1`,
      [deviceId, deviceUserId, schoolId]
    ) as any;
    
    if (mapping && mapping.length > 0) {
      return mapping[0].student_id;
    }
    
    return null;
    
  } catch (error) {
    console.error('[AttendanceEngine] Error mapping device user:', error);
    return null;
  } finally {
    if (connection) await connection.end();
  }
}
