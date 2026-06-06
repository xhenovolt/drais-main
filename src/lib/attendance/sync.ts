/**
 * Attendance Sync Layer
 *
 * Synchronizes Phase 3 canonical records (attendance_records) to legacy UI tables
 * (student_attendance, staff_attendance) for backward compatibility during migration.
 *
 * This is the missing link in the 10-step attendance pipeline:
 * Phase 3 evaluatePunch() → [THIS SYNC LAYER] → UI reads legacy tables
 *
 * Fire-and-forget: All errors are logged but never throw. The zk-handler
 * must never crash due to sync failures.
 */

import { query } from '@/lib/db';

export interface AttendanceRecord {
  id: number;
  schoolId: number;
  personId: number;
  roleType: 'student' | 'staff';
  attendanceDate: Date;
  firstInAt: Date | null;
  lastOutAt: Date | null;
  firstInDevice: string | null;
  lastOutDevice: string | null;
  status: 'present' | 'late' | 'absent' | 'half_day' | 'early_leave' | 'holiday' | 'weekend';
  lateMinutes: number;
  earlyMinutes: number;
  totalMinutes: number;
  rawEventCount: number;
}

/**
 * Sync Phase 3 attendance_records to legacy student_attendance table.
 *
 * Maps columns:
 *   attendance_records.person_id → student_attendance.student_id
 *   attendance_records.attendance_date → student_attendance.date
 *   attendance_records.first_in_at → student_attendance.time_in
 *   attendance_records.last_out_at → student_attendance.time_out
 *   attendance_records.status → student_attendance.status
 *
 * Uses UPSERT (INSERT ... ON DUPLICATE KEY UPDATE) keyed on (student_id, date)
 * to ensure idempotency—same Phase 3 record synced twice creates one legacy row.
 */
export async function syncRecordToStudentAttendance(
  record: AttendanceRecord,
): Promise<void> {
  try {
    if (record.roleType !== 'student') return;

    const timeIn = record.firstInAt
      ? new Date(record.firstInAt).toTimeString().substring(0, 8)
      : null;

    const timeOut = record.lastOutAt
      ? new Date(record.lastOutAt).toTimeString().substring(0, 8)
      : null;

    const syncDate = new Date(record.attendanceDate).toISOString().split('T')[0];

    // Upsert into student_attendance.
    // Uses unique key (student_id, date) so sync is idempotent.
    await query(
      `INSERT INTO student_attendance
        (school_id, student_id, date, status, time_in, time_out, method, marked_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'biometric', NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         time_in = COALESCE(VALUES(time_in), time_in),
         time_out = COALESCE(VALUES(time_out), time_out),
         method = 'biometric',
         updated_at = NOW()`,
      [
        record.schoolId,
        record.personId,
        syncDate,
        normalizeStatus(record.status),
        timeIn,
        timeOut,
      ],
    );

    console.log('[attendance-sync]', 'SYNC_STUDENT_ATTENDANCE_OK', {
      personId: record.personId,
      date: syncDate,
      status: record.status,
    });
  } catch (error) {
    // Never throw—log and continue.
    console.warn('[attendance-sync]', 'SYNC_STUDENT_ATTENDANCE_FAILED', {
      personId: record.personId,
      date: record.attendanceDate,
      error: String(error),
    });
  }
}

/**
 * Sync Phase 3 attendance_records to legacy staff_attendance table.
 *
 * Same pattern as syncRecordToStudentAttendance but targets staff_attendance.
 */
export async function syncRecordToStaffAttendance(
  record: AttendanceRecord,
): Promise<void> {
  try {
    if (record.roleType !== 'staff') return;

    const timeIn = record.firstInAt
      ? new Date(record.firstInAt).toTimeString().substring(0, 8)
      : null;

    const timeOut = record.lastOutAt
      ? new Date(record.lastOutAt).toTimeString().substring(0, 8)
      : null;

    const syncDate = new Date(record.attendanceDate).toISOString().split('T')[0];

    // Upsert into staff_attendance.
    // Keyed on (staff_id, date) for idempotency.
    await query(
      `INSERT INTO staff_attendance
        (school_id, staff_id, date, status, time_in, time_out, method, marked_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'biometric', NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         time_in = COALESCE(VALUES(time_in), time_in),
         time_out = COALESCE(VALUES(time_out), time_out),
         method = 'biometric',
         updated_at = NOW()`,
      [
        record.schoolId,
        record.personId,
        syncDate,
        normalizeStatus(record.status),
        timeIn,
        timeOut,
      ],
    );

    console.log('[attendance-sync]', 'SYNC_STAFF_ATTENDANCE_OK', {
      personId: record.personId,
      date: syncDate,
      status: record.status,
    });
  } catch (error) {
    console.warn('[attendance-sync]', 'SYNC_STAFF_ATTENDANCE_FAILED', {
      personId: record.personId,
      date: record.attendanceDate,
      error: String(error),
    });
  }
}

/**
 * Normalize Phase 3 status values to legacy UI table values.
 *
 * Phase 3 uses: present, late, absent, half_day, early_leave, holiday, weekend
 * Legacy uses: present, absent, late, excused, not_marked
 *
 * Map:
 *   present → present
 *   late → late
 *   absent → absent
 *   half_day → excused
 *   early_leave → excused
 *   holiday → excused
 *   weekend → excused
 */
function normalizeStatus(
  phase3Status: string,
): 'present' | 'absent' | 'late' | 'excused' | 'not_marked' {
  switch (phase3Status) {
    case 'present':
      return 'present';
    case 'late':
      return 'late';
    case 'absent':
      return 'absent';
    case 'half_day':
    case 'early_leave':
    case 'holiday':
    case 'weekend':
      return 'excused';
    default:
      return 'not_marked';
  }
}

/**
 * Sync an existing attendance_records row by its ID.
 *
 * Fetches the full record from attendance_records and routes to sync functions.
 * Used when evaluatePunch() completes and needs to sync the result.
 */
export async function syncByAttendanceRecordId(recordId: number): Promise<void> {
  try {
    const rows = await query(
      `SELECT
        id, school_id AS schoolId, person_id AS personId, role_type AS roleType,
        DATE(attendance_date) AS attendanceDate,
        first_in_at AS firstInAt, last_out_at AS lastOutAt,
        first_in_device AS firstInDevice, last_out_device AS lastOutDevice,
        status, late_minutes AS lateMinutes, early_minutes AS earlyMinutes,
        total_minutes AS totalMinutes, raw_event_count AS rawEventCount
       FROM attendance_records
       WHERE id = ?`,
      [recordId],
    );

    if (!rows || rows.length === 0) {
      console.warn('[attendance-sync]', 'SYNC_RECORD_NOT_FOUND', { recordId });
      return;
    }

    const record = rows[0] as AttendanceRecord;

    if (record.roleType === 'student') {
      await syncRecordToStudentAttendance(record);
    } else if (record.roleType === 'staff') {
      await syncRecordToStaffAttendance(record);
    }
  } catch (error) {
    console.warn('[attendance-sync]', 'SYNC_BY_ID_FAILED', { recordId, error: String(error) });
  }
}

/**
 * Batch sync all unsynced records from today.
 *
 * Used for catch-up or backfill. Finds all attendance_records created/updated
 * in the last hour and syncs them to legacy tables.
 *
 * Returns count of records synced.
 */
export async function syncRecentRecords(
  schoolId?: number,
  minutesBack: number = 60,
): Promise<number> {
  try {
    const rows = await query(
      `SELECT
        id, school_id AS schoolId, person_id AS personId, role_type AS roleType,
        DATE(attendance_date) AS attendanceDate,
        first_in_at AS firstInAt, last_out_at AS lastOutAt,
        first_in_device AS firstInDevice, last_out_device AS lastOutDevice,
        status, late_minutes AS lateMinutes, early_minutes AS earlyMinutes,
        total_minutes AS totalMinutes, raw_event_count AS rawEventCount
       FROM attendance_records
       WHERE evaluated_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
       ${schoolId ? 'AND school_id = ?' : ''}
       ORDER BY evaluated_at DESC`,
      schoolId ? [minutesBack, schoolId] : [minutesBack],
    );

    if (!rows || rows.length === 0) {
      return 0;
    }

    let synced = 0;
    for (const record of rows as AttendanceRecord[]) {
      if (record.roleType === 'student') {
        await syncRecordToStudentAttendance(record);
      } else if (record.roleType === 'staff') {
        await syncRecordToStaffAttendance(record);
      }
      synced++;
    }

    console.log('[attendance-sync]', 'SYNC_RECENT_COMPLETE', { synced, minutesBack, schoolId });
    return synced;
  } catch (error) {
    console.warn('[attendance-sync]', 'SYNC_RECENT_FAILED', {
      minutesBack,
      schoolId,
      error: String(error),
    });
    return 0;
  }
}

/**
 * Bulk sync all attendance_records for a specific date range.
 *
 * Used for full resync or data recovery. Caution: can be slow for large date ranges.
 * Returns count of records synced.
 */
export async function syncRecordsForDateRange(
  schoolId: number,
  fromDate: Date,
  toDate: Date,
): Promise<number> {
  try {
    const from = fromDate.toISOString().split('T')[0];
    const to = toDate.toISOString().split('T')[0];

    const rows = await query(
      `SELECT
        id, school_id AS schoolId, person_id AS personId, role_type AS roleType,
        DATE(attendance_date) AS attendanceDate,
        first_in_at AS firstInAt, last_out_at AS lastOutAt,
        first_in_device AS firstInDevice, last_out_device AS lastOutDevice,
        status, late_minutes AS lateMinutes, early_minutes AS earlyMinutes,
        total_minutes AS totalMinutes, raw_event_count AS rawEventCount
       FROM attendance_records
       WHERE school_id = ? AND DATE(attendance_date) BETWEEN ? AND ?
       ORDER BY attendance_date DESC`,
      [schoolId, from, to],
    );

    if (!rows || rows.length === 0) {
      return 0;
    }

    let synced = 0;
    for (const record of rows as AttendanceRecord[]) {
      if (record.roleType === 'student') {
        await syncRecordToStudentAttendance(record);
      } else if (record.roleType === 'staff') {
        await syncRecordToStaffAttendance(record);
      }
      synced++;
    }

    console.log('[attendance-sync]', 'SYNC_DATE_RANGE_COMPLETE', { synced, from, to, schoolId });
    return synced;
  } catch (error) {
    console.warn('[attendance-sync]', 'SYNC_DATE_RANGE_FAILED', {
      fromDate,
      toDate,
      schoolId,
      error: String(error),
    });
    return 0;
  }
}
