/**
 * @drais/repo-contract — AttendanceRecordRepo interface.
 * `attendance_records` — one evaluated summary row per (person, day),
 * per the real table's own uk_person_day unique key. upsert(), not
 * create()/update(), matching how the real evaluator writes this table:
 * recompute the day's summary and replace it, never "create a new row
 * for this person on this day a second time."
 */
import type { AttendanceRecordRecord, UpsertAttendanceRecordInput } from './types';

export interface AttendanceRecordRepo {
  findByPersonAndDate(schoolId: number, personId: number, date: string): Promise<AttendanceRecordRecord | null>;
  listBySchoolAndDate(schoolId: number, date: string): Promise<AttendanceRecordRecord[]>;
  upsert(input: UpsertAttendanceRecordInput): Promise<AttendanceRecordRecord>;
}
