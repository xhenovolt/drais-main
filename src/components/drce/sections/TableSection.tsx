"use client";
/**
 * DRCE X4 — Table section.
 *
 * Renders a DRCETableSection as either:
 *   • a data-driven grid (when `dataSource` is set, rows iterate that array)
 *   • a static grid (when `staticRowCount` is set, rows are blank by default)
 *
 * Cells resolve in this order:
 *   1. per-cell override (value / binding / formula) from `cells[rowKey:colId]`
 *   2. column default binding
 *   3. blank
 *
 * Formulas (cells starting with `=`) flow through the evaluator in
 * src/lib/drce/table/formula.ts, with the rendered row values as inputs so
 * `=SUM(B2:B12)` works just like a spreadsheet.
 *
 * Determinism: pure function of (section, dataCtx). No I/O, no Date.now().
 */
import React from 'react';
import type {
  DRCETableSection as Section, DRCETheme, DRCEDataContext, DRCESection,
} from '@/lib/drce/schema';
import { resolveExpression } from '@/lib/drce/computed/resolveExpression';
import { getByPath } from '@/lib/drce/bindingResolver';
import { evaluateFormula, type FormulaContext } from '@/lib/drce/table/formula';

interface Props {
  section: Section;
  theme:   DRCETheme;
  ctx:     DRCEDataContext;
  /** Editor hook — when set, cells become contentEditable (used by DataGrid). */
  onCellChange?: (rowKey: string, colId: string, kind: 'value' | 'binding' | 'formula', value: string) => void;
}

function expandRows(section: Section, ctx: DRCEDataContext): {
  rowKeys: string[];
  rowData: Record<string, unknown>[];
} {
  if (section.dataSource) {
    const raw = getByPath({
      student: ctx.student, subjects: ctx.subjects, results: ctx.results,
      assessment: ctx.assessment, comments: ctx.comments, meta: ctx.meta,
    }, section.dataSource.trim());
    const arr = Array.isArray(raw) ? raw : [];
    return {
      rowKeys: arr.map((_, i) => String(i)),
      rowData: arr.map(r => (r && typeof r === 'object') ? (r as Record<string, unknown>) : { value: r }),
    };
  }
  const n = Math.max(0, Math.min(500, section.staticRowCount ?? 0));
  return {
    rowKeys: Array.from({ length: n }, (_, i) => `r${i}`),
    rowData: Array.from({ length: n }, () => ({})),
  };
}

/** Two-pass resolve: pass 1 fills literal/binding cells; pass 2 evaluates
 *  formula cells so they can reference other cells.
 */
function resolveCells(section: Section, ctx: DRCEDataContext): {
  rowKeys: string[];
  cellValues: Record<string, Record<string, unknown>>;     // [colId][rowKey]
} {
  const { rowKeys, rowData } = expandRows(section, ctx);
  const cellValues: Record<string, Record<string, unknown>> = {};
  for (const col of section.columns) cellValues[col.id] = {};

  // Pass 1 — non-formula cells.
  for (let i = 0; i < rowKeys.length; i++) {
    const rowKey = rowKeys[i];
    const row    = rowData[i];
    for (const col of section.columns) {
      const override = section.cells?.[`${rowKey}:${col.id}`];
      if (override?.formula) continue;            // Pass 2.
      if (override?.value !== undefined) {
        cellValues[col.id][rowKey] = override.value;
        continue;
      }
      const binding = override?.binding ?? col.binding;
      if (binding) {
        // Per-row resolution — pass the row as `result` scope so legacy
        // `result.subjectName` etc. bindings keep working.
        cellValues[col.id][rowKey] = resolveExpression(`{${binding}}`, ctx, row);
      }
    }
  }

  // Pass 2 — formulas, with cellValues now populated.
  for (const rowKey of rowKeys) {
    for (const col of section.columns) {
      const override = section.cells?.[`${rowKey}:${col.id}`];
      if (!override?.formula) continue;
      const body = override.formula.replace(/^=/, '');
      const fctx: FormulaContext = {
        cellValues, columnIds: section.columns.map(c => c.id), rowKeys,
        currentCol: col.id, currentRow: rowKey, dataCtx: ctx,
      };
      cellValues[col.id][rowKey] = evaluateFormula(body, fctx);
    }
  }

  return { rowKeys, cellValues };
}

export function TableSection({ section, theme, ctx, onCellChange }: Props) {
  const { rowKeys, cellValues } = resolveCells(section, ctx);
  const style = section.style ?? {};

  // Pre-compute merged-cell skip set: a cell that's being spanned ONTO by a
  // neighbour gets `skipped` and renders nothing.
  const skipped = new Set<string>();
  for (const [key, override] of Object.entries(section.cells ?? {})) {
    const [rowKey, colId] = key.split(':');
    const right = override.mergeRight ?? 0, down = override.mergeDown ?? 0;
    if (!right && !down) continue;
    const ci = section.columns.findIndex(c => c.id === colId);
    const ri = rowKeys.indexOf(rowKey);
    if (ci < 0 || ri < 0) continue;
    for (let dr = 0; dr <= down; dr++) {
      for (let dc = 0; dc <= right; dc++) {
        if (dr === 0 && dc === 0) continue;
        const sk = `${rowKeys[ri + dr] ?? ''}:${section.columns[ci + dc]?.id ?? ''}`;
        if (sk.includes(':') && !sk.startsWith(':') && !sk.endsWith(':')) skipped.add(sk);
      }
    }
  }

  return (
    <table style={{
      width: '100%', borderCollapse: 'collapse',
      fontSize: style.rowFontSize ?? 11,
    }}>
      <thead>
        <tr>
          {section.columns.map(col => (
            <th key={col.id} style={{
              width: col.width,
              textAlign: col.align ?? 'left',
              padding: (style.padding ?? 4) + 'px',
              background: style.headerBackground ?? '#e5e7eb',
              border:     style.headerBorder      ?? '1px solid #ccc',
              fontSize:   style.headerFontSize    ?? 11,
              textTransform: style.headerTextTransform,
              fontWeight: 600,
            }}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rowKeys.map((rowKey, ri) => (
          <tr key={rowKey} style={{ background: style.stripe && ri % 2 ? style.stripe : undefined }}>
            {section.columns.map(col => {
              const k = `${rowKey}:${col.id}`;
              if (skipped.has(k)) return null;
              const override = section.cells?.[k];
              const v = cellValues[col.id]?.[rowKey];
              const display = override?.format
                ? resolveExpression(`{value | ${override.format}}`, { ...ctx, meta: { ...ctx.meta } } as DRCEDataContext, { value: v })
                : (v == null ? '' : String(v));
              return (
                <td
                  key={col.id}
                  colSpan={(override?.mergeRight ?? 0) + 1}
                  rowSpan={(override?.mergeDown  ?? 0) + 1}
                  contentEditable={!!onCellChange}
                  suppressContentEditableWarning
                  onBlur={onCellChange ? (e) => {
                    const text = e.currentTarget.textContent ?? '';
                    if (text.startsWith('=')) onCellChange(rowKey, col.id, 'formula', text);
                    else if (text.startsWith('{') && text.endsWith('}'))
                      onCellChange(rowKey, col.id, 'binding', text.slice(1, -1));
                    else onCellChange(rowKey, col.id, 'value', text);
                  } : undefined}
                  style={{
                    textAlign: col.align ?? 'left',
                    padding:   (style.padding ?? 4) + 'px',
                    border:    style.rowBorder ?? '1px solid #ddd',
                    outline:   'none',
                    cursor:    onCellChange ? 'text' : undefined,
                    ...(override?.style ?? {}),
                  }}
                >
                  {display}
                </td>
              );
            })}
          </tr>
        ))}

        {/* Totals row */}
        {section.totals?.enabled && (
          <tr style={{ fontWeight: 700, background: '#f3f4f6' }}>
            {section.columns.map((col, idx) => {
              if (idx === 0) {
                return <td key={col.id} style={{ padding: (style.padding ?? 4) + 'px', border: style.rowBorder ?? '1px solid #ddd' }}>
                  {section.totals?.label ?? 'Total'}
                </td>;
              }
              if (!section.totals?.sumColumnIds.includes(col.id)) {
                return <td key={col.id} style={{ padding: (style.padding ?? 4) + 'px', border: style.rowBorder ?? '1px solid #ddd' }} />;
              }
              const total = rowKeys.reduce((acc, rk) => {
                const n = Number(cellValues[col.id]?.[rk]);
                return Number.isFinite(n) ? acc + n : acc;
              }, 0);
              return (
                <td key={col.id} style={{ padding: (style.padding ?? 4) + 'px', border: style.rowBorder ?? '1px solid #ddd', textAlign: col.align ?? 'right' }}>
                  {total}
                </td>
              );
            })}
          </tr>
        )}
      </tbody>
    </table>
  );
}

// Default factory for the section registry / palette.
export function defaultTable(): Omit<DRCESection, 'id' | 'order'> {
  return {
    type: 'table',
    visible: true,
    columns: [
      { id: 'col-1', header: 'Column A', width: '50%', align: 'left'  },
      { id: 'col-2', header: 'Column B', width: '50%', align: 'right' },
    ],
    staticRowCount: 3,
    cells: {},
    style: {
      headerBackground: '#e5e7eb',
      headerBorder:     '1px solid #ccc',
      rowBorder:        '1px solid #ddd',
      headerFontSize:   11,
      rowFontSize:      11,
      padding:          4,
    },
  } as Omit<DRCESection, 'id' | 'order'>;
}
