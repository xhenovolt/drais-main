import { AttendanceCSVExporter } from './AttendanceCSVExporter';
import { AttendanceExcelExporter } from './AttendanceExcelExporter';
import { AttendancePresentationModel, type AttendancePresentationRow } from './AttendancePresentationModel';

export interface AttendanceExportRequest {
  format: 'csv' | 'excel';
  filename: string;
  rows: ReadonlyArray<AttendancePresentationRow>;
  /** Optional report title lines placed above the table (school, scope, dates). */
  heading?: ReadonlyArray<string>;
}

function downloadCsv(csvContent: string, filename: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = `${filename}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export class AttendanceExportService {
  static buildCsv(rows: ReadonlyArray<AttendancePresentationRow>): string {
    return AttendanceCSVExporter.build(rows, AttendancePresentationModel.exportColumns());
  }

  static async exportVisibleRows(request: AttendanceExportRequest): Promise<void> {
    if (request.rows.length === 0) {
      return;
    }

    const heading = request.heading ?? [];
    if (request.format === 'csv') {
      downloadCsv(AttendanceCSVExporter.build(request.rows, AttendancePresentationModel.exportColumns(), heading), request.filename);
      return;
    }

    await AttendanceExcelExporter.download(
      request.rows,
      request.filename,
      AttendancePresentationModel.exportColumns(),
      heading,
    );
  }
}
