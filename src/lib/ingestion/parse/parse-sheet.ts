/**
 * Turn one worksheet into a ParsedSource, given an ALREADY-DETECTED header
 * row index (from inspectWorkbook / detectHeaderRow). Deliberately does not
 * re-run header detection — the analysis step and the actual parse step
 * must agree on where the data starts, or a school could see one preview
 * and get a different result on commit. The caller decides the header row
 * once (auto-detected, or corrected by the user) and passes it through.
 */
import * as XLSX from 'xlsx';
import type { ParsedSource, RawCellValue } from '../types';

export function parseSheetToSource(
  buffer: Buffer,
  filename: string,
  sheetName: string,
  headerRowIndex: number,
): ParsedSource {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`sheet "${sheetName}" not found in workbook`);

  const grid = XLSX.utils.sheet_to_json<RawCellValue[]>(ws, { header: 1, blankrows: true, defval: null }) as unknown as RawCellValue[][];
  const headerRow = grid[headerRowIndex] ?? [];
  const headers = headerRow.map((c) => (c === null || c === undefined ? '' : String(c).trim())).filter(Boolean);

  const rows: ParsedSource['rows'] = [];
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const arr = grid[i] ?? [];
    if (arr.every((v) => v === null || v === undefined || String(v).trim() === '')) continue; // skip blank rows
    const row: Record<string, RawCellValue> = {};
    headerRow.forEach((h, idx) => {
      const key = h === null || h === undefined ? '' : String(h).trim();
      if (key) row[key] = arr[idx] ?? null;
    });
    rows.push({
      ...row,
      __provenance: { sourceRowIndex: i + 1, sourceFile: filename, sourceSheet: sheetName },
    } as ParsedSource['rows'][number]);
  }

  const isCsv = filename.toLowerCase().endsWith('.csv');
  return { rows, headers, detectedFormat: isCsv ? 'csv' : 'xlsx' };
}
