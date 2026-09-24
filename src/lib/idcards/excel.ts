/**
 * Excel → card records for the ID Card Studio.
 *
 * Deliberately DB-free: nothing here (or in the routes that use it) creates or
 * updates students/people/enrollments. It parses, suggests a column mapping,
 * validates and returns plain records for rendering.
 *
 * Hardening: xlsx 0.18.x is parse-only here — no formulas evaluated, no styles or
 * HTML, row/column caps applied before any conversion, and a hard upload size cap
 * enforced by the caller.
 */
import * as XLSX from 'xlsx';
import type { CardRecord } from './spec';

export const MAX_XLSX_BYTES = 4 * 1024 * 1024;   // fits a single TiDB row comfortably
export const MAX_ROWS = 2000;
const MAX_COLS = 60;
const HEADER_SCAN_ROWS = 15;
const MAX_CELL_CHARS = 200;

export type Grid = string[][];

export interface SheetInfo {
  name: string;
  hidden: boolean;
  rowCount: number;
  colCount: number;
  headerRow: number;        // 1-based guess
  headers: string[];
  sample: string[][];       // up to 5 data rows under the header
}

/** Zip/OOXML (xlsx) and CFB (legacy xls) magic bytes. */
export function looksLikeWorkbook(buf: Buffer): 'xlsx' | 'xls' | null {
  if (buf.length < 8) return null;
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'xlsx';
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return 'xls';
  return null;
}

function readWorkbook(buf: Buffer): XLSX.WorkBook {
  return XLSX.read(buf, {
    type: 'buffer', cellFormula: false, cellHTML: false, cellStyles: false,
    cellNF: true, cellDates: false, bookVBA: false, sheetRows: MAX_ROWS + HEADER_SCAN_ROWS + 5,
  });
}

const clean = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CELL_CHARS);

function isoFromSerial(serial: number): string | null {
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d || !d.y) return null;
  return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
}

function gridOf(ws: XLSX.WorkSheet): Grid {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const maxR = Math.min(range.e.r, range.s.r + MAX_ROWS + HEADER_SCAN_ROWS + 4);
  const maxC = Math.min(range.e.c, range.s.c + MAX_COLS - 1);
  const out: Grid = [];
  for (let r = range.s.r; r <= maxR; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= maxC; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      let v = '';
      if (cell && cell.v !== undefined && cell.v !== null) {
        if (cell.t === 'n' && typeof cell.v === 'number' && cell.z && XLSX.SSF.is_date(String(cell.z))) {
          v = isoFromSerial(cell.v) ?? String(cell.w ?? cell.v);
        } else if (cell.t === 'e') {
          v = '';
        } else {
          v = String(cell.w ?? cell.v);
        }
      }
      row.push(clean(v));
    }
    out.push(row);
  }
  return out;
}

/** The row (0-based) most likely to be the header: many short non-numeric text cells. */
export function guessHeaderRow(grid: Grid): number {
  let best = 0; let bestScore = -1;
  for (let r = 0; r < Math.min(grid.length, HEADER_SCAN_ROWS); r++) {
    const cells = grid[r].filter((c) => c !== '');
    if (cells.length < 2) continue;
    const textual = cells.filter((c) => Number.isNaN(Number(c)) && c.length <= 40).length;
    const score = textual * 2 + cells.length;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

export function uniqueHeaders(row: string[]): string[] {
  const seen = new Map<string, number>();
  return row.map((h, i) => {
    const base = h || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

export function inspectWorkbook(buf: Buffer): { sheets: SheetInfo[] } {
  const wb = readWorkbook(buf);
  const hiddenMap = new Map<string, boolean>();
  (wb.Workbook?.Sheets ?? []).forEach((s) => hiddenMap.set(s.name, !!s.Hidden));
  const sheets: SheetInfo[] = [];
  for (const name of wb.SheetNames) {
    const grid = gridOf(wb.Sheets[name]);
    const headerIdx = guessHeaderRow(grid);
    const headers = uniqueHeaders(grid[headerIdx] ?? []);
    const data = grid.slice(headerIdx + 1).filter((r) => r.some((c) => c !== ''));
    sheets.push({
      name, hidden: !!hiddenMap.get(name),
      rowCount: data.length, colCount: headers.length,
      headerRow: headerIdx + 1, headers,
      sample: data.slice(0, 5),
    });
  }
  return { sheets };
}

// ── Mapping ────────────────────────────────────────────────────────────────

import { CARD_FIELDS } from './fields';
export { CARD_FIELDS };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** field key → suggested header (only confident matches; each header used once). */
export function suggestMapping(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  const normed = headers.map(norm);
  // exact synonym pass first, then "contains" pass for unmatched fields
  for (const pass of [0, 1]) {
    for (const f of CARD_FIELDS) {
      if (out[f.key]) continue;
      const names = [norm(f.key), norm(f.label), ...f.synonyms];
      // "contains" matching is too loose for the generic full-name field ("Middle Name" contains "name")
      if (pass === 1 && f.key === 'full_name') continue;
      const idx = normed.findIndex((h, i) => !used.has(headers[i]) && h !== '' &&
        (pass === 0 ? names.includes(h) : names.some((n) => n.length >= 4 && h.includes(n))));
      if (idx >= 0) { out[f.key] = headers[idx]; used.add(headers[idx]); }
    }
  }
  return out;
}

// ── Extraction + validation ────────────────────────────────────────────────

export interface RowIssue {
  row: number;                 // spreadsheet row number
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ExtractedRow {
  row: number;                 // spreadsheet row number
  record: CardRecord;
  status: 'ok' | 'warning' | 'error';
}

export interface Extraction {
  rows: ExtractedRow[];
  issues: RowIssue[];
  totalRows: number;
  truncated: boolean;
  blankRowsSkipped: number;
  headers: string[];
}

export function formatDisplayDate(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    const t = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(v);
    if (!t) return null;
    d = +t[1]; mo = +t[2]; y = +t[3]; if (y < 100) y += y > 50 ? 1900 : 2000;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1];
  return `${String(d).padStart(2, '0')} ${mon} ${y}`;
}

export function extractRows(
  buf: Buffer,
  opts: {
    sheetName: string;
    headerRow: number;                        // 1-based
    mapping: Record<string, string>;          // field key → header
    requiredFields?: string[];                // default: full_name
    schoolName?: string;
    academicYear?: string;
  },
): Extraction {
  const wb = readWorkbook(buf);
  const ws = wb.Sheets[opts.sheetName];
  if (!ws) throw new Error(`Worksheet "${opts.sheetName}" not found`);
  const grid = gridOf(ws);
  const hIdx = Math.max(0, opts.headerRow - 1);
  const headers = uniqueHeaders(grid[hIdx] ?? []);
  const colOf = new Map(headers.map((h, i) => [h, i]));
  const required = opts.requiredFields ?? ['full_name'];

  const issues: RowIssue[] = [];
  const rows: ExtractedRow[] = [];
  let blank = 0;
  const seenAdm = new Map<string, number>();

  const body = grid.slice(hIdx + 1);
  const total = body.filter((r) => r.some((c) => c !== '')).length;
  const truncated = total > MAX_ROWS;

  let taken = 0;
  for (let i = 0; i < body.length && taken < MAX_ROWS; i++) {
    const cells = body[i];
    const rowNo = hIdx + 2 + i;
    if (!cells.some((c) => c !== '')) { blank++; continue; }
    taken++;

    const rec: CardRecord = {};
    // every column is reachable as {col:<Header>} whether or not it's mapped
    headers.forEach((h, c) => { rec[`col:${h}`] = cells[c] ?? ''; });
    for (const [field, header] of Object.entries(opts.mapping)) {
      const c = colOf.get(header);
      if (c !== undefined) rec[field] = cells[c] ?? '';
    }
    if (!rec.full_name) {
      const composed = [rec.first_name, rec.middle_name, rec.last_name].filter(Boolean).join(' ').trim();
      if (composed) rec.full_name = composed;
    }
    if (rec.full_name && !rec.first_name) rec.first_name = rec.full_name.split(' ')[0] ?? '';
    if (rec.class === undefined) rec.class = '';
    rec.school = opts.schoolName ?? '';
    rec.academic_year = rec.academic_year || opts.academicYear || '';

    let status: ExtractedRow['status'] = 'ok';
    const flag = (field: string, severity: 'error' | 'warning', message: string) => {
      issues.push({ row: rowNo, field, severity, message });
      if (severity === 'error') status = 'error'; else if (status === 'ok') status = 'warning';
    };

    for (const f of required) {
      if (!rec[f]) flag(f, 'error', `Missing ${CARD_FIELDS.find((x) => x.key === f)?.label ?? f}`);
    }
    for (const dateField of ['dob', 'valid_until'] as const) {
      const raw = rec[dateField];
      if (raw) {
        const pretty = formatDisplayDate(raw);
        if (pretty) rec[dateField] = pretty;
        else flag(dateField, 'warning', `Could not read "${raw.slice(0, 30)}" as a date; printed as-is`);
      }
    }
    if (rec.photo_url && !/^https:\/\/[^\s"'<>]+$/.test(rec.photo_url)) {
      flag('photo_url', 'warning', 'Photo must be an https:// link; the photo will be left blank');
      rec.photo_url = '';
    }
    if (rec.admission_no) {
      const key = rec.admission_no.toLowerCase();
      const first = seenAdm.get(key);
      if (first !== undefined) flag('admission_no', 'warning', `Duplicate of row ${first}`);
      else seenAdm.set(key, rowNo);
    }
    rows.push({ row: rowNo, record: rec, status });
  }

  return { rows, issues, totalRows: total, truncated, blankRowsSkipped: blank, headers };
}
