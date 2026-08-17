/**
 * Workbook inspection — the ONE place an xlsx/csv buffer gets read for
 * intelligence purposes. Every existing importer independently does
 * `XLSX.read(buffer)` then `wb.Sheets[wb.SheetNames[0]]`, hardcoding sheet 0
 * and row 0 as the header. This module replaces that assumption with real
 * inspection: every sheet, a detected header row per sheet, an inferred
 * purpose per sheet, and sheet-name-derived context — all with confidence
 * scores, none of it applied silently.
 *
 * Foundation-only (readiness-audit Phase A of the import redesign): this
 * module does not yet change what any existing route does. It is wired
 * into an actual import flow in Phase B, alongside the new preview UI that
 * shows this inspection to the user before anything is written.
 *
 * No DB access. The only I/O is reading the workbook buffer itself.
 */
import * as XLSX from 'xlsx';
import type { RawCellValue } from '../types';
import { detectHeaderRow, type HeaderDetectionResult } from './header-detect';
import { inferContextFromSheetName, type SheetNameContext } from './sheet-name-context';
import { guessSheetPurpose, type PurposeGuess } from './purpose-guess';

export interface SheetInspection {
  sheetName: string;
  /** 0-based sheet position in the workbook. */
  sheetIndex: number;
  rowCount: number;
  columnCount: number;
  header: HeaderDetectionResult;
  /** Header labels at the detected header row, in column order. Empty if
   *  the sheet has no plausible header (headerless / blank sheet). */
  headers: string[];
  /** A handful of data rows immediately below the header, for a UI preview. */
  sampleDataRows: RawCellValue[][];
  purpose: PurposeGuess;
  nameContext: SheetNameContext;
  /** True if the sheet is entirely empty or has no data rows below the header. */
  isEmpty: boolean;
}

export interface WorkbookInspection {
  sheetCount: number;
  sheets: SheetInspection[];
  /** Sheets whose combined purpose+name-context signals suggest they're not
   *  data at all (e.g. a lone "Read Me" or "Instructions" sheet) — surfaced
   *  so the review UI can deprioritize them, never auto-excluded. */
  likelyNonDataSheets: string[];
}

const SAMPLE_ROWS = 5;

function sheetToGrid(ws: XLSX.WorkSheet): RawCellValue[][] {
  return XLSX.utils.sheet_to_json<RawCellValue[]>(ws, { header: 1, blankrows: true, defval: null }) as unknown as RawCellValue[][];
}

function inspectSheet(ws: XLSX.WorkSheet, sheetName: string, sheetIndex: number): SheetInspection {
  const grid = sheetToGrid(ws);
  const rowCount = grid.length;
  const columnCount = grid.reduce((max, row) => Math.max(max, row.length), 0);

  const header = detectHeaderRow(grid);
  const headerRow = grid[header.headerRowIndex] ?? [];
  const headers = headerRow.map((c) => (c === null || c === undefined ? '' : String(c).trim()));
  const dataRows = grid.slice(header.headerRowIndex + 1).filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));

  return {
    sheetName,
    sheetIndex,
    rowCount,
    columnCount,
    header,
    headers,
    sampleDataRows: dataRows.slice(0, SAMPLE_ROWS),
    purpose: guessSheetPurpose(headers),
    nameContext: inferContextFromSheetName(sheetName),
    isEmpty: dataRows.length === 0,
  };
}

/** name-only heuristic used for the non-data-sheet callout, independent of
 *  purpose-guessing so an empty/junk sheet doesn't need real headers to be
 *  flagged. */
function looksLikeNonDataSheetName(name: string): boolean {
  return /\b(read\s*me|instructions?|notes?|cover|guide|template|legend|key)\b/i.test(name);
}

export function inspectWorkbook(buffer: Buffer): WorkbookInspection {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets = wb.SheetNames.map((name, i) => inspectSheet(wb.Sheets[name], name, i));

  const likelyNonDataSheets = sheets
    .filter((s) => s.isEmpty || looksLikeNonDataSheetName(s.sheetName))
    .map((s) => s.sheetName);

  return { sheetCount: sheets.length, sheets, likelyNonDataSheets };
}
