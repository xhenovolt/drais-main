/**
 * Header-row detection — deterministic, no I/O, no DB.
 *
 * Every existing importer assumes row 0 (or row 1) of a sheet is the
 * header row. Real school exports routinely have a title row ("ABC
 * Primary School — 2026 Term 1 Roll"), blank spacer rows, or a merged
 * banner above the real table. This module scores candidate rows and
 * picks the one that looks most like a header, instead of assuming.
 *
 * Deliberately deterministic (per the "don't overengineer with an LLM"
 * requirement) — a handful of cheap, explainable heuristics rather than
 * a model. Every score comes with a `reason` so the review UI (Phase B)
 * can explain itself, matching the existing FieldMapping.reason pattern
 * in schema-inference.
 */
import type { RawCellValue } from '../types';

export interface HeaderDetectionResult {
  /** 0-based index into the row grid. */
  headerRowIndex: number;
  /** 0..1 — how confident the detector is that this is really the header. */
  confidence: number;
  /** Human-readable explanation, for the review UI / audit log. */
  reason: string;
  /** Row indices (0-based) the detector skipped as title/blank/junk before
   *  the header, so callers can show "3 rows skipped above the header". */
  skippedRows: number[];
}

const MAX_ROWS_TO_SCAN = 15; // real exports don't bury the header past this
const MIN_COLUMNS_FOR_CANDIDATE = 2; // a 1-cell row is a title, not a header

function isBlankRow(row: RawCellValue[]): boolean {
  return row.every((c) => c === null || c === undefined || String(c).trim() === '');
}

function nonEmptyCells(row: RawCellValue[]): RawCellValue[] {
  return row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '');
}

/** A cell "looks like a label" if it's text, short-ish, and not purely numeric/date-shaped. */
function looksLikeLabel(cell: RawCellValue): boolean {
  if (cell === null || cell === undefined) return false;
  const s = String(cell).trim();
  if (s === '') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return false; // pure number
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(s)) return false; // date-shaped
  return s.length <= 40; // headers are short; a long sentence is probably a note/title
}

/** A cell "looks like data" if it's numeric, date-shaped, or a long free-text value. */
function looksLikeData(cell: RawCellValue): boolean {
  if (cell === null || cell === undefined) return false;
  const s = String(cell).trim();
  if (s === '') return false;
  return /^-?\d+(\.\d+)?$/.test(s) || /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(s) || s.length > 40;
}

// A short, domain-agnostic vocabulary of words that show up in real header
// rows across student/fee/result exports. Deliberately generic (not the
// full CanonicalField synonym lists — this module stays a low-level,
// dependency-free utility that schema-inference and purpose-guessing build
// ON TOP OF, not the reverse). This is the signal that actually
// distinguishes "First Name" (a header) from "Mary" (a same-shaped data
// value) — shape alone (short, non-numeric text) can't tell those apart.
const KNOWN_HEADER_WORDS = [
  'name', 'first', 'last', 'other', 'middle', 'surname', 'given',
  'admission', 'adm', 'reg', 'registration', 'number', 'no', 'id', 'index', 'roll', 'stamp',
  'class', 'grade', 'form', 'stream', 'section', 'level', 'year',
  'gender', 'sex', 'dob', 'birth', 'date', 'age',
  'phone', 'mobile', 'contact', 'email', 'address', 'parent', 'guardian',
  'amount', 'balance', 'fee', 'fees', 'tuition', 'paid', 'due', 'owed', 'payment', 'method',
  'subject', 'score', 'mark', 'marks', 'result', 'remarks', 'comment', 'teacher', 'initials',
];

function looksLikeKnownHeaderWord(cell: RawCellValue): boolean {
  if (cell === null || cell === undefined) return false;
  const s = String(cell).trim().toLowerCase();
  if (!s) return false;
  return KNOWN_HEADER_WORDS.some((w) => s.includes(w));
}

/**
 * Score a candidate row [0,1]. The dominant signal is vocabulary — does
 * this row read like real header words? — because shape alone (short,
 * non-numeric text) can't distinguish "First Name" from "Mary". Shape and
 * "does a consistent block of similar-looking rows follow" are secondary,
 * tie-breaking signals.
 */
function scoreCandidate(grid: RawCellValue[][], rowIndex: number): { score: number; reason: string } {
  const row = grid[rowIndex];
  const filled = nonEmptyCells(row);
  if (filled.length < MIN_COLUMNS_FOR_CANDIDATE) return { score: 0, reason: 'too few filled cells to be a header' };

  const labelFrac = filled.filter(looksLikeLabel).length / filled.length;
  const uniqueFrac = new Set(filled.map((c) => String(c).trim().toLowerCase())).size / filled.length;
  const vocabFrac = filled.filter(looksLikeKnownHeaderWord).length / filled.length;

  // Compare against up to 3 rows below: do THEY look more like data than this row?
  const belowRows = grid.slice(rowIndex + 1, rowIndex + 4).filter((r) => !isBlankRow(r));
  let belowDataFrac = 0.5; // neutral if we can't tell (e.g. header is the last row — unlikely but don't penalize)
  if (belowRows.length > 0) {
    const fracs = belowRows.map((r) => {
      const f = nonEmptyCells(r);
      // A row counts as "data-like" either because it's numeric/date-shaped,
      // OR because it does NOT read like header vocabulary (i.e. it's
      // ordinary free text — a name, a code — which is the common case for
      // student rosters where every column is text).
      return f.length ? f.filter((c) => looksLikeData(c) || !looksLikeKnownHeaderWord(c)).length / f.length : 0;
    });
    belowDataFrac = fracs.reduce((a, b) => a + b, 0) / fracs.length;
  }

  // A single filled cell with everything else blank on an otherwise-full-width
  // sheet reads as a merged title banner, not a header — penalize hard.
  const widthGuess = Math.max(...grid.slice(0, MAX_ROWS_TO_SCAN).map((r) => nonEmptyCells(r).length), filled.length);
  const titleBannerPenalty = filled.length === 1 && widthGuess > 3 ? 0.6 : 0;

  const score = Math.max(0, vocabFrac * 0.5 + labelFrac * 0.1 + uniqueFrac * 0.15 + belowDataFrac * 0.25 - titleBannerPenalty);
  const reason = titleBannerPenalty > 0
    ? 'single filled cell on an otherwise wide sheet — looks like a title banner'
    : `header-vocabulary=${(vocabFrac * 100).toFixed(0)}%, labels=${(labelFrac * 100).toFixed(0)}%, distinct=${(uniqueFrac * 100).toFixed(0)}%, rows-below-look-like-data=${(belowDataFrac * 100).toFixed(0)}%`;
  return { score, reason };
}

export function detectHeaderRow(grid: RawCellValue[][]): HeaderDetectionResult {
  const skippedRows: number[] = [];
  const scanLimit = Math.min(grid.length, MAX_ROWS_TO_SCAN);

  let best: { rowIndex: number; score: number; reason: string } | null = null;
  for (let i = 0; i < scanLimit; i++) {
    if (isBlankRow(grid[i])) { skippedRows.push(i); continue; }
    const { score, reason } = scoreCandidate(grid, i);
    if (!best || score > best.score) best = { rowIndex: i, score, reason };
    // A very confident hit on an early row is almost certainly right — stop
    // scanning further so a coincidentally label-shaped data row later
    // doesn't steal it.
    if (score >= 0.85) break;
  }

  if (!best) {
    return { headerRowIndex: 0, confidence: 0, reason: 'no plausible header row found in the first 15 rows — defaulting to row 0', skippedRows };
  }

  // Rows between 0 and the chosen header that weren't already recorded as
  // blank are title/note rows we skipped over.
  for (let i = 0; i < best.rowIndex; i++) {
    if (!skippedRows.includes(i)) skippedRows.push(i);
  }
  skippedRows.sort((a, b) => a - b);

  return { headerRowIndex: best.rowIndex, confidence: Math.min(1, best.score), reason: best.reason, skippedRows };
}
