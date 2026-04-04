/**
 * Idempotency Utilities
 * 
 * Ensures sync operations can be safely retried without creating duplicates.
 * Uses database constraints and transaction handling.
 * 
 * Phase 4: Idempotency requirements for reliable sync
 */

import { getConnection } from '@/lib/db';

/**
 * Unique constraint key for attendance logs
 */
export interface LogKey {
  device_id: number;
  user_id: number;
  event_time: Date;
  event_type?: string;
}

/**
 * Idempotency check result
 */
export interface IdempotencyResult {
  isDuplicate: boolean;
  existingRecordId?: number;
  canProceed: boolean;
}

/**
 * Attendance Log Idempotency Helper
 * Prevents duplicate attendance records from being created
 */
export class AttendanceIdempotency {
  /**
   * Check if a log entry already exists (duplicate detection)
   */
  static async checkDuplicate(key: LogKey): Promise<IdempotencyResult> {
    const connection = await getConnection();
    
    try {
      const [rows] = await connection.execute(
        `SELECT id FROM attendance_logs 
         WHERE device_id = ? 
           AND user_id = ? 
           AND event_time = ?
           AND event_type = COALESCE(?, event_type)
         LIMIT 1`,
        [
          key.device_id,
          key.user_id,
          key.event_time,
          key.event_type || null
        ]
      );
      
      const records = rows as any[];
      
      if (records.length > 0) {
        return {
          isDuplicate: true,
          existingRecordId: records[0].id,
          canProceed: false
        };
      }
      
      return {
        isDuplicate: false,
        canProceed: true
      };
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Insert log with idempotency check (atomic operation)
   */
  static async insertIfNotExists(
    deviceId: number,
    userId: number,
    eventTime: Date,
    eventType: string,
    data: any
  ): Promise<{ success: boolean; recordId?: number; isDuplicate?: boolean }> {
    const connection = await getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Try to insert - will fail if duplicate due to unique constraint
      // But we also check first for cleaner logic
      const [existing] = await connection.execute(
        `SELECT id FROM attendance_logs 
         WHERE device_id = ? AND user_id = ? AND event_time = ?
         LIMIT 1 FOR UPDATE`,
        [deviceId, userId, eventTime]
      );
      
      if (existing && (existing as any[]).length > 0) {
        await connection.rollback();
        return {
          success: true,
          recordId: (existing as any[])[0].id,
          isDuplicate: true
        };
      }
      
      // Insert new record
      const [result] = await connection.execute(
        `INSERT INTO attendance_logs 
         (student_id, device_id, event_type, event_time, raw_data, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [userId, deviceId, eventType, eventTime, JSON.stringify(data)]
      );
      
      await connection.commit();
      
      return {
        success: true,
        recordId: (result as any).insertId,
        isDuplicate: false
      };
    } catch (error: any) {
      await connection.rollback();
      
      // Handle duplicate key error (race condition)
      if (error.code === 'ER_DUP_ENTRY') {
        return {
          success: true,
          isDuplicate: true
        };
      }
      
      throw error;
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Batch insert with idempotency (more efficient)
   */
  static async batchInsertIfNotExists(
    entries: Array<{
      deviceId: number;
      userId: number;
      eventTime: Date;
      eventType: string;
      data: any;
    }>
  ): Promise<{ inserted: number; duplicates: number }> {
    const connection = await getConnection();
    let inserted = 0;
    let duplicates = 0;
    
    try {
      await connection.beginTransaction();
      
      for (const entry of entries) {
        const [existing] = await connection.execute(
          `SELECT id FROM attendance_logs 
           WHERE device_id = ? AND user_id = ? AND event_time = ?
           LIMIT 1 FOR UPDATE`,
          [entry.deviceId, entry.userId, entry.eventTime]
        );
        
        if (existing && (existing as any[]).length > 0) {
          duplicates++;
          continue;
        }
        
        await connection.execute(
          `INSERT INTO attendance_logs 
           (student_id, device_id, event_type, event_time, raw_data, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [
            entry.userId,
            entry.deviceId,
            entry.eventType,
            entry.eventTime,
            JSON.stringify(entry.data)
          ]
        );
        
        inserted++;
      }
      
      await connection.commit();
      
      return { inserted, duplicates };
    } catch (error: any) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.end();
    }
  }
}

/**
 * Student Attendance Idempotency
 * Prevents duplicate daily attendance records
 */
export class StudentAttendanceIdempotency {
  /**
   * Check for existing attendance record
   */
  static async checkDuplicate(
    studentId: number,
    classId: number,
    date: string
  ): Promise<IdempotencyResult> {
    const connection = await getConnection();
    
    try {
      const [rows] = await connection.execute(
        `SELECT id FROM student_attendance 
         WHERE student_id = ? AND class_id = ? AND date = ?
         LIMIT 1`,
        [studentId, classId, date]
      );
      
      const records = rows as any[];
      
      if (records.length > 0) {
        return {
          isDuplicate: true,
          existingRecordId: records[0].id,
          canProceed: false
        };
      }
      
      return {
        isDuplicate: false,
        canProceed: true
      };
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Create or update attendance record (upsert with idempotency)
   */
  static async upsertSignIn(
    studentId: number,
    classId: number,
    date: string,
    timeIn: string,
    status: string = 'present'
  ): Promise<{ recordId: number; isNew: boolean }> {
    const connection = await getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Check for existing
      const [existing] = await connection.execute(
        `SELECT id, time_in FROM student_attendance 
         WHERE student_id = ? AND class_id = ? AND date = ?
         LIMIT 1 FOR UPDATE`,
        [studentId, classId, date]
      );
      
      let recordId: number;
      let isNew = false;
      
      if (existing && (existing as any[]).length > 0) {
        // Update only if not already signed in
        const record = (existing as any[])[0];
        if (!record.time_in) {
          await connection.execute(
            `UPDATE student_attendance 
             SET time_in = ?, status = COALESCE(status, ?), updated_at = NOW()
             WHERE id = ?`,
            [timeIn, status, record.id]
          );
        }
        recordId = record.id;
      } else {
        // Insert new
        const [result] = await connection.execute(
          `INSERT INTO student_attendance 
           (student_id, class_id, date, status, time_in, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [studentId, classId, date, status, timeIn]
        );
        recordId = (result as any).insertId;
        isNew = true;
      }
      
      await connection.commit();
      
      return { recordId, isNew };
    } catch (error: any) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Update sign-out time (idempotent)
   */
  static async upsertSignOut(
    studentId: number,
    classId: number,
    date: string,
    timeOut: string
  ): Promise<{ recordId: number; isNew: boolean }> {
    const connection = await getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Check for existing
      const [existing] = await connection.execute(
        `SELECT id, time_out FROM student_attendance 
         WHERE student_id = ? AND class_id = ? AND date = ?
         LIMIT 1 FOR UPDATE`,
        [studentId, classId, date]
      );
      
      let recordId: number;
      let isNew = false;
      
      if (existing && (existing as any[]).length > 0) {
        // Update only if not already signed out
        const record = (existing as any[])[0];
        if (!record.time_out) {
          await connection.execute(
            `UPDATE student_attendance 
             SET time_out = ?, updated_at = NOW()
             WHERE id = ?`,
            [timeOut, record.id]
          );
        }
        recordId = record.id;
      } else {
        // Create new record with sign-out only
        const [result] = await connection.execute(
          `INSERT INTO student_attendance 
           (student_id, class_id, date, status, time_out, created_at, updated_at)
           VALUES (?, ?, ?, 'present', ?, NOW(), NOW())`,
          [studentId, classId, date, timeOut]
        );
        recordId = (result as any).insertId;
        isNew = true;
      }
      
      await connection.commit();
      
      return { recordId, isNew };
    } catch (error: any) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.end();
    }
  }
}

/**
 * Sync checkpoint helper
 * Tracks last sync position to enable incremental syncs
 */
export class SyncCheckpoint {
  /**
   * Get last sync checkpoint for a device
   */
  static async getLastCheckpoint(deviceId: number): Promise<Date | null> {
    const connection = await getConnection();
    
    try {
      const [rows] = await connection.execute(
        `SELECT last_sync_time FROM device_sync_checkpoints 
         WHERE device_id = ?
         ORDER BY id DESC LIMIT 1`,
        [deviceId]
      );
      
      const records = rows as any[];
      return records.length > 0 ? new Date(records[0].last_sync_time) : null;
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Update sync checkpoint
   */
  static async updateCheckpoint(
    deviceId: number,
    syncTime: Date,
    recordsProcessed: number = 0
  ): Promise<void> {
    const connection = await getConnection();
    
    try {
      await connection.execute(
        `INSERT INTO device_sync_checkpoints 
         (device_id, last_sync_time, records_synced, created_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
           last_sync_time = ?, 
           records_synced = records_synced + ?`,
        [deviceId, syncTime, recordsProcessed, syncTime, recordsProcessed]
      );
    } finally {
      await connection.end();
    }
  }
}

const idempotencyUtils = {
  AttendanceIdempotency,
  StudentAttendanceIdempotency,
  SyncCheckpoint
};
export default idempotencyUtils;
