/**
 * Print-sheet layout for ID cards (pure, mm-based).
 *
 * Modes
 *  - side_by_side : DEFAULT for two-sided designs. Works on any printer (no duplex
 *                   unit needed): each learner occupies one row with the FRONT on the
 *                   left and the BACK on the right, so a learner's two faces are
 *                   always together, ready to cut out and laminate.
 *  - front_only   : one face per learner (single-sided designs, or fronts only).
 *  - duplex_long  : for printers that print on both sides of the paper. Page N = all
 *                   the fronts, page N+1 = all the backs. Backs mirror column order so
 *                   each back lands behind its own front when the sheet is flipped
 *                   on the LONG edge (the usual "flip on long edge" duplex setting
 *                   for portrait sheets). Fronts and backs are on different pages by
 *                   design: they only meet once the paper is turned over.
 *  - duplex_short : same, but backs mirror ROW order (flip on the SHORT edge).
 *
 * The grid is centred on the sheet in every mode. That symmetry is what makes the
 * mirrored back page register with the front page.
 */

export type PrintMode = 'side_by_side' | 'front_only' | 'duplex_long' | 'duplex_short';

/** The sensible default for a design: faces together when there is a back, else fronts only. */
export const defaultPrintMode = (hasBack: boolean): PrintMode => (hasBack ? 'side_by_side' : 'front_only');

export interface SheetSpec {
  widthMm: number;
  heightMm: number;
  marginMm: number;
  gapMm: number;
}

export const SHEET_PRESETS: Record<string, { widthMm: number; heightMm: number }> = {
  'A4 portrait': { widthMm: 210, heightMm: 297 },
  'A4 landscape': { widthMm: 297, heightMm: 210 },
  'A3 portrait': { widthMm: 297, heightMm: 420 },
  'Letter portrait': { widthMm: 215.9, heightMm: 279.4 },
};

export interface Cell {
  index: number;            // learner/record index
  face: 'front' | 'back';
  xMm: number;
  yMm: number;
}

export interface PrintPage {
  kind: 'front' | 'back' | 'pair';
  cells: Cell[];
}

export interface SheetGrid {
  cols: number;
  rows: number;
  perPage: number;
  offsetXMm: number;
  offsetYMm: number;
  unitWidthMm: number;
}

export function computeGrid(
  card: { widthMm: number; heightMm: number },
  sheet: SheetSpec,
  paired: boolean,
): SheetGrid {
  // A front+back pair is two cards with one gap between them.
  const unitW = paired ? card.widthMm * 2 + sheet.gapMm : card.widthMm;
  const usableW = sheet.widthMm - sheet.marginMm * 2;
  const usableH = sheet.heightMm - sheet.marginMm * 2;
  const cols = Math.max(0, Math.floor((usableW + sheet.gapMm) / (unitW + sheet.gapMm)));
  const rows = Math.max(0, Math.floor((usableH + sheet.gapMm) / (card.heightMm + sheet.gapMm)));
  const gridW = cols * unitW + Math.max(0, cols - 1) * sheet.gapMm;
  const gridH = rows * card.heightMm + Math.max(0, rows - 1) * sheet.gapMm;
  return {
    cols, rows, perPage: cols * rows,
    offsetXMm: (sheet.widthMm - gridW) / 2,
    offsetYMm: (sheet.heightMm - gridH) / 2,
    unitWidthMm: unitW,
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function layoutPages(opts: {
  count: number;
  card: { widthMm: number; heightMm: number };
  sheet: SheetSpec;
  mode: PrintMode;
  hasBack: boolean;
}): { pages: PrintPage[]; grid: SheetGrid; effectiveMode: PrintMode } {
  const { count, card, sheet, hasBack } = opts;
  // A single-sided design has no back to pair or flip.
  const mode: PrintMode = !hasBack && opts.mode !== 'front_only' ? 'front_only' : opts.mode;
  const paired = mode === 'side_by_side';
  const grid = computeGrid(card, sheet, paired);
  if (grid.perPage < 1) {
    throw new Error(`A ${card.widthMm}×${card.heightMm} mm card${paired ? ' pair' : ''} does not fit on the selected sheet with these margins`);
  }

  const pos = (col: number, row: number) => ({
    xMm: round(grid.offsetXMm + col * (grid.unitWidthMm + sheet.gapMm)),
    yMm: round(grid.offsetYMm + row * (card.heightMm + sheet.gapMm)),
  });

  const pages: PrintPage[] = [];
  for (let start = 0; start < count; start += grid.perPage) {
    const chunk = Math.min(grid.perPage, count - start);
    const front: Cell[] = [];
    const back: Cell[] = [];
    const pair: Cell[] = [];
    for (let k = 0; k < chunk; k++) {
      const index = start + k;
      const row = Math.floor(k / grid.cols);
      const col = k % grid.cols;
      const p = pos(col, row);
      if (mode === 'side_by_side') {
        pair.push({ index, face: 'front', xMm: p.xMm, yMm: p.yMm });
        pair.push({ index, face: 'back', xMm: round(p.xMm + card.widthMm + sheet.gapMm), yMm: p.yMm });
      } else {
        front.push({ index, face: 'front', ...p });
        if (mode === 'duplex_long') {
          back.push({ index, face: 'back', ...pos(grid.cols - 1 - col, row) });
        } else if (mode === 'duplex_short') {
          back.push({ index, face: 'back', ...pos(col, grid.rows - 1 - row) });
        }
      }
    }
    if (mode === 'side_by_side') pages.push({ kind: 'pair', cells: pair });
    else {
      pages.push({ kind: 'front', cells: front });
      if (back.length) pages.push({ kind: 'back', cells: back });
    }
  }
  return { pages, grid, effectiveMode: mode };
}
