/**
 * Excel → card records, entirely in the BROWSER — no upload, no storage,
 * no server round-trip for the file itself. Built for the "Excel file"
 * source in the ID Card Studio (src/components/idcards/IdCardGenerate.tsx).
 *
 * Why this exists next to src/lib/idcards/excel.ts (server-side, `xlsx`
 * package): `xlsx` (SheetJS community edition) only reads cell VALUES — it
 * has no concept of embedded/floating images (the `xl/media/` +
 * `xl/drawings/` parts of an .xlsx), so a school pasting learner photos
 * directly into a "Photo" column got nothing; only an https:// link in the
 * cell text worked. `exceljs` DOES read embedded images
 * (worksheet.getImages() + workbook.model.media), and — this is the part
 * that matters here — it runs perfectly well in a browser bundle, so the
 * whole pipeline (parse sheet, guess header, map columns, extract rows,
 * resolve each row's photo) can happen without the workbook ever leaving
 * the device. The mapping/validation logic itself (guessHeaderRow,
 * suggestMapping, formatDisplayDate, CARD_FIELDS) is reused as-is from
 * excel.ts — none of it is `xlsx`-specific.
 */
import ExcelJS from 'exceljs';
import type { CardRecord } from './spec';
import {
  guessHeaderRow, uniqueHeaders, suggestMapping, formatDisplayDate, CARD_FIELDS,
  type Grid, type RowIssue, type ExtractedRow, type Extraction,
} from './excel';

export { CARD_FIELDS, suggestMapping };

export const MAX_ROWS = 2000;
const MAX_COLS = 60;
const MAX_CELL_CHARS = 200;
/** Formats a browser <img> can actually render. exceljs also reports emf/wmf
 *  (Windows metafile clipart occasionally pasted into a cell) — silently
 *  skipped rather than producing a broken image. */
const SUPPORTED_IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif']);

export interface SheetInfo {
  name: string;
  hidden: boolean;
  rowCount: number;
  colCount: number;
  headerRow: number;   // 1-based guess
  headers: string[];
  sample: string[][];
  /** True if ANY embedded image was found anchored anywhere on this sheet —
   *  surfaced in the UI so "no photos found" isn't a silent mystery when a
   *  school expected them. */
  hasImages: boolean;
}

const clean = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CELL_CHARS);

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'object') {
    // Rich text / hyperlink / formula-result objects.
    const anyV = v as any;
    if (typeof anyV.text === 'string') return clean(anyV.text);
    if (Array.isArray(anyV.richText)) return clean(anyV.richText.map((r: any) => r.text ?? '').join(''));
    if (anyV.result !== undefined) return clean(String(anyV.result));
    if (anyV.hyperlink) return clean(String(anyV.text ?? anyV.hyperlink));
    return '';
  }
  return clean(String(v));
}

/** MIME type for an <img> src from exceljs's reported file extension, or
 *  null when the format can't be rendered in a browser (e.g. emf/wmf). */
function imageMime(extension: string): string | null {
  const e = extension.toLowerCase();
  if (!SUPPORTED_IMAGE_EXT.has(e)) return null;
  return e === 'jpg' ? 'image/jpeg' : `image/${e}`;
}

function bufferToBase64(buf: ArrayBuffer | Uint8Array | Buffer): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
  // btoa needs a binary string; chunk to avoid a call-stack blowup on large images.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Every embedded image on a worksheet, keyed by its anchor cell "row,col"
 *  (0-based, matching the Grid convention below) → a ready-to-use data URI.
 *  An image anchored so its top-left straddles a cell is attributed to
 *  that cell (nativeRow/nativeCol from exceljs is already the floor). */
function imagesByCell(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet): Map<string, string> {
  const out = new Map<string, string>();
  const media = (wb as unknown as { model?: { media?: Array<{ type: string; extension: string; buffer: ArrayBuffer | Uint8Array }> } }).model?.media ?? [];
  for (const img of ws.getImages()) {
    const m = media[(img as unknown as { imageId: number }).imageId];
    if (!m) continue;
    const mime = imageMime(m.extension);
    if (!mime) continue;
    const range = (img as unknown as { range: { tl: { nativeRow: number; nativeCol: number } } }).range;
    const row = range?.tl?.nativeRow;
    const col = range?.tl?.nativeCol;
    if (row == null || col == null) continue;
    out.set(`${row},${col}`, `data:${mime};base64,${bufferToBase64(m.buffer)}`);
  }
  return out;
}

async function loadWorkbook(data: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  return wb;
}

function gridOfSheet(ws: ExcelJS.Worksheet): Grid {
  const maxR = Math.min(ws.rowCount, MAX_ROWS + 20);
  const maxC = Math.min(ws.columnCount, MAX_COLS);
  const out: Grid = [];
  for (let r = 1; r <= maxR; r++) {
    const row: string[] = [];
    const wsRow = ws.getRow(r);
    for (let c = 1; c <= maxC; c++) {
      row.push(cellToString(wsRow.getCell(c)));
    }
    out.push(row);
  }
  return out;
}

export async function inspectWorkbookClient(data: ArrayBuffer): Promise<{ sheets: SheetInfo[] }> {
  const wb = await loadWorkbook(data);
  const sheets: SheetInfo[] = [];
  wb.eachSheet((ws) => {
    const grid = gridOfSheet(ws);
    const headerIdx = guessHeaderRow(grid);
    const headers = uniqueHeaders(grid[headerIdx] ?? []);
    const dataRows = grid.slice(headerIdx + 1).filter((r) => r.some((c) => c !== ''));
    const hasImages = ws.getImages().length > 0;
    sheets.push({
      name: ws.name,
      hidden: ws.state === 'hidden' || ws.state === 'veryHidden',
      rowCount: dataRows.length,
      colCount: headers.length,
      headerRow: headerIdx + 1,
      headers,
      sample: dataRows.slice(0, 5),
      hasImages,
    });
  });
  return { sheets };
}

export interface ExtractOptsClient {
  sheetName: string;
  headerRow: number;                 // 1-based
  mapping: Record<string, string>;   // field key -> header
  requiredFields?: string[];
  schoolName?: string;
  academicYear?: string;
}

export async function extractRowsClient(data: ArrayBuffer, opts: ExtractOptsClient): Promise<Extraction> {
  const wb = await loadWorkbook(data);
  const ws = wb.getWorksheet(opts.sheetName);
  if (!ws) throw new Error(`Worksheet "${opts.sheetName}" not found`);

  const grid = gridOfSheet(ws);
  const images = imagesByCell(wb, ws);
  const hIdx = Math.max(0, opts.headerRow - 1);
  const headers = uniqueHeaders(grid[hIdx] ?? []);
  const colOf = new Map(headers.map((h, i) => [h, i]));
  const required = opts.requiredFields ?? ['full_name'];
  const photoHeader = opts.mapping['photo_url'];
  const photoCol = photoHeader !== undefined ? colOf.get(photoHeader) : undefined;

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
    const rowNo = hIdx + 2 + i;         // spreadsheet row number (1-based, after header)
    const sheetRowIdx = hIdx + 1 + i;   // 0-based row index into the Grid, matching imagesByCell's key
    if (!cells.some((c) => c !== '')) { blank++; continue; }
    taken++;

    const rec: CardRecord = {};
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

    // Photo: an embedded image anchored in the mapped column wins outright
    // (this is the whole point — a school pasted an actual picture, not a
    // link). Otherwise fall back to the cell text IF it's a real https
    // link, matching the same rule the server-side path has always used.
    const embedded = photoCol !== undefined ? images.get(`${sheetRowIdx},${photoCol}`) : undefined;
    if (embedded) {
      rec.photo_url = embedded;
    } else if (rec.photo_url && !/^https:\/\/[^\s"'<>]+$/.test(rec.photo_url)) {
      flag('photo_url', 'warning', 'Photo must be a pasted image or an https:// link; the photo will be left blank');
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
