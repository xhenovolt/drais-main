import {
  AttendancePresentationModel,
  type AttendanceExportColumn,
  type AttendancePresentationRow,
} from './AttendancePresentationModel';

function clampWidth(width: number): number {
  return Math.min(Math.max(width, 12), 40);
}

export class AttendanceExcelExporter {
  static async download(
    rows: ReadonlyArray<AttendancePresentationRow>,
    filename: string,
    columns: ReadonlyArray<AttendanceExportColumn> = AttendancePresentationModel.exportColumns(),
    heading: ReadonlyArray<string> = [],
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    const XLSX = await import('xlsx');
    const worksheet = this.buildWorksheet(XLSX, rows, columns, heading);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  }

  private static buildWorksheet(
    XLSX: typeof import('xlsx'),
    rows: ReadonlyArray<AttendancePresentationRow>,
    columns: ReadonlyArray<AttendanceExportColumn>,
    heading: ReadonlyArray<string> = [],
  ) {
    const titleRows = heading.length ? [...heading.map((h) => [h]), ['']] : [];
    const matrix = [
      ...titleRows,
      columns.map((column) => column.header),
      ...rows.map((row) => columns.map((column) => row[column.key] ?? '')),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(matrix);
    const lastColumn = columns.length - 1;
    const lastRow = matrix.length - 1;
    const range = XLSX.utils.encode_range({
      s: { c: 0, r: 0 },
      e: { c: lastColumn, r: lastRow },
    });

    worksheet['!cols'] = columns.map((column) => {
      const maxCellLength = Math.max(
        column.header.length,
        ...rows.map((row) => String(row[column.key] ?? '').length),
      );
      return { wch: clampWidth(maxCellLength + 2) };
    });
    worksheet['!autofilter'] = { ref: range };
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    for (let index = 0; index < columns.length; index += 1) {
      const headerRef = XLSX.utils.encode_cell({ c: index, r: 0 });
      if (worksheet[headerRef]) {
        worksheet[headerRef].s = {
          font: { bold: true },
          alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        };
      }
    }

    for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const cellRef = XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex });
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = {
            alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
          };
        }
      }
    }

    return worksheet;
  }
}
