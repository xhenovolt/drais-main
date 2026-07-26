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
    heading: ReadonlyArray<string> = [],
  ): string {
    if (rows.length === 0) {
      return '';
    }

    const headers = columns.map((column) => escapeCsv(column.header)).join(',');
    const lines = rows.map((row) =>
      columns.map((column) => escapeCsv(String(row[column.key] ?? ''))).join(','),
    );

    // Optional report heading (title / scope / date range / generated-at),
    // each on its own row, then a blank separator, then the table.
    const titleRows = heading.length ? [...heading.map((h) => escapeCsv(h)), ''] : [];
    return [...titleRows, headers, ...lines].join('\n');
  }
}
