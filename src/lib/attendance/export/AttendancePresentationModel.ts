import { AttendanceFormatter } from './AttendanceFormatter';

export interface AttendanceHistoryBaseRow {
  id: number;
  device_sn: string | null;
  device_user_id: string;
  check_time: string | Date | null;
  verify_type: number | null;
  matched: number | boolean | null;
  role_type: string | null;
  derived_event: string | null;
  derived_detail: string | null;
  class_name: string | null;
  person_name: string | null;
  staff_position?: string | null;
  staff_department?: string | null;
}

export interface AttendancePresentationRow {
  date: string;
  time: string;
  timestamp: string;
  name: string;
  designation: string;
  department: string;
  category: string;
  className: string;
  deviceId: string;
  school: string;
  verificationMethod: string;
  attendanceStatus: string;
  statusDetail: string;
  matchStatus: string;
  verified: string;
}

export interface AttendanceExportColumn {
  key: keyof AttendancePresentationRow;
  header: string;
}

const EXPORT_COLUMNS: ReadonlyArray<AttendanceExportColumn> = [
  { key: 'date', header: 'Date' },
  { key: 'time', header: 'Time' },
  { key: 'name', header: 'Name' },
  { key: 'designation', header: 'Designation' },
  { key: 'department', header: 'Department' },
  { key: 'category', header: 'Category' },
  { key: 'className', header: 'Class' },
  { key: 'deviceId', header: 'Device ID' },
  { key: 'school', header: 'School' },
  { key: 'verificationMethod', header: 'Verification Method' },
  { key: 'attendanceStatus', header: 'Attendance Status' },
  { key: 'statusDetail', header: 'Status Detail' },
  { key: 'matchStatus', header: 'Match Status' },
  { key: 'verified', header: 'Verified' },
];

export class AttendancePresentationModel {
  static exportColumns(): ReadonlyArray<AttendanceExportColumn> {
    return EXPORT_COLUMNS;
  }

  static fromHistoryRow(
    row: AttendanceHistoryBaseRow,
    formatter: AttendanceFormatter,
  ): AttendancePresentationRow {
    const name = row.person_name || `UID: ${row.device_user_id}`;

    return {
      date: formatter.formatDate(row.check_time),
      time: formatter.formatTime(row.check_time),
      timestamp: formatter.formatDateTime(row.check_time),
      name,
      designation: formatter.formatNullable(row.staff_position ?? null),
      department: formatter.formatNullable(row.staff_department ?? null),
      category: formatter.formatCategory(row.role_type || 'unmatched'),
      className: formatter.formatNullable(row.class_name),
      deviceId: formatter.formatNullable(row.device_user_id),
      school: formatter.formatNullable(formatter.schoolName),
      verificationMethod: formatter.formatVerificationMethod(row.verify_type),
      attendanceStatus: formatter.formatAttendanceStatus(row.derived_event),
      statusDetail: formatter.formatNullable(row.derived_detail),
      matchStatus: formatter.formatMatchStatus(row.matched),
      verified: formatter.formatBoolean(Boolean(row.matched)),
    };
  }

  static fromHistoryRows(
    rows: ReadonlyArray<AttendanceHistoryBaseRow>,
    formatter: AttendanceFormatter,
  ): AttendancePresentationRow[] {
    return rows.map((row) => this.fromHistoryRow(row, formatter));
  }

  static toExportRecords(
    rows: ReadonlyArray<AttendancePresentationRow>,
    columns: ReadonlyArray<AttendanceExportColumn> = EXPORT_COLUMNS,
  ): Array<Record<string, string>> {
    return rows.map((row) => {
      const record: Record<string, string> = {};
      for (const column of columns) {
        record[column.header] = row[column.key];
      }
      return record;
    });
  }
}
