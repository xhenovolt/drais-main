import {
  AttendancePresentationModel,
  type AttendanceExportColumn,
  type AttendancePresentationRow,
} from './AttendancePresentationModel';

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export class AttendanceCSVExporter {
  static build(
    rows: ReadonlyArray<AttendancePresentationRow>,
    columns: ReadonlyArray<AttendanceExportColumn> = AttendancePresentationModel.exportColumns(),
  ): string {
    if (rows.length === 0) {
      return '';
    }

    const headers = columns.map((column) => escapeCsv(column.header)).join(',');
    const lines = rows.map((row) =>
      columns.map((column) => escapeCsv(String(row[column.key] ?? ''))).join(','),
    );

    return [headers, ...lines].join('\n');
  }
}
