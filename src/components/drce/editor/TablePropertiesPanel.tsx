"use client";
/**
 * Properties panel for the X4 DRCETableSection.
 *
 * Surfaces the spreadsheet-grade controls that the brief requires:
 *   • dataSource binding (or staticRowCount for blank grids)
 *   • add / remove / reorder columns (header, width, align, default binding, format)
 *   • totals row (label + which columns sum)
 *   • per-cell editor (binding / formula / value, merge-right / merge-down)
 *
 * Cell editing reads/writes section.cells[`${rowKey}:${colId}`]. Row keys
 * are 'r0', 'r1', … for static tables and '0', '1', … for dataSource-driven
 * ones (which the runtime expands at render time).
 */
import React, { useState } from 'react';
import { Trash2, Plus, ChevronDown, ChevronUp, Calculator, Columns3 } from 'lucide-react';
import type {
  DRCESection, DRCEMutation, DRCETableSection, DRCETableColumn,
} from '@/lib/drce/schema';

interface Props {
  section: DRCESection & { type: 'table' };
  onMutate: (m: DRCEMutation) => void;
}

import { newColumnId } from '@/lib/drce/ids';
import { AVAILABLE_BINDINGS } from '@/lib/drce/bindingResolver';
import { useI18n } from '@/components/i18n/I18nProvider';
function newColId() { return newColumnId(); }

function setProp(onMutate: (m: DRCEMutation) => void, sectionId: string, path: string, value: unknown) {
  onMutate({ type: 'SET_SECTION_PROP', sectionId, path, value });
}

export function TablePropertiesPanel({ section, onMutate }: Props) {
  const { t } = useI18n();
  const [cellOpen, setCellOpen] = useState<string | null>(null);

  // Helpers that re-emit the entire columns or cells map; the schema panel is
  // simple and the table is bounded, so JSON-style edits are fine here.
  function replaceColumns(next: DRCETableColumn[]) {
    setProp(onMutate, section.id, 'columns', next);
  }
  function replaceCells(next: DRCETableSection['cells']) {
    setProp(onMutate, section.id, 'cells', next);
  }

  function addColumn() {
    const id = newColId();
    replaceColumns([
      ...section.columns,
      { id, header: `Column ${String.fromCharCode(65 + section.columns.length)}`, width: '20%', align: 'left' },
    ]);
  }
  // Excel-style "Distribute Columns" — give every column an equal width %.
  function distributeColumns() {
    const n = section.columns.length;
    if (!n) return;
    const w = `${+(100 / n).toFixed(2)}%`;
    replaceColumns(section.columns.map(c => ({ ...c, width: w })));
  }
  function deleteColumn(id: string) {
    replaceColumns(section.columns.filter(c => c.id !== id));
    // Drop per-cell overrides that pointed at this column.
    const nextCells: NonNullable<DRCETableSection['cells']> = {};
    for (const [k, v] of Object.entries(section.cells ?? {})) {
      if (!k.endsWith(':' + id)) nextCells[k] = v;
    }
    replaceCells(nextCells);
  }
  function moveColumn(id: string, dir: -1 | 1) {
    const idx = section.columns.findIndex(c => c.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= section.columns.length) return;
    const next = section.columns.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    replaceColumns(next);
  }
  function patchColumn(id: string, patch: Partial<DRCETableColumn>) {
    replaceColumns(section.columns.map(c => c.id === id ? { ...c, ...patch } : c));
  }
  function addRow() {
    const count = (section.staticRowCount ?? 0) + 1;
    setProp(onMutate, section.id, 'staticRowCount', count);
  }
  function removeRow() {
    const count = Math.max(0, (section.staticRowCount ?? 0) - 1);
    setProp(onMutate, section.id, 'staticRowCount', count);
  }

  const rowKeys = section.dataSource
    ? Array.from({ length: 8 }, (_, i) => String(i))  // preview up to 8 rows for editing
    : Array.from({ length: section.staticRowCount ?? 0 }, (_, i) => 'r' + i);

  return (
    <div className="p-3 space-y-3 text-xs">
      {/* Phase 4 — one shared autocomplete list of every available data field,
          so binding inputs suggest paths (e.g. student.fullName, result.score)
          instead of forcing users to type them from memory. */}
      <datalist id="drce-binding-list">
        {AVAILABLE_BINDINGS.map(b => (
          <option key={b.binding} value={b.binding}>{b.label} — {b.group}</option>
        ))}
      </datalist>
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Table</div>

      {/* dataSource vs static */}
      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Data source (binding to an array)</span>
        <input
          value={section.dataSource ?? ''}
          onChange={e => setProp(onMutate, section.id, 'dataSource', e.target.value || undefined)}
          placeholder="e.g. results · subjects · meta.calendar.upcoming"
          className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none"
        />
        <span className="text-[10px] text-gray-400">Leave empty for a static grid; set to bind rows from data.</span>
      </label>

      {!section.dataSource && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">Static rows:</span>
          <button onClick={removeRow} className="w-6 h-6 rounded bg-gray-100 dark:bg-slate-800 text-gray-500">–</button>
          <span className="text-xs font-mono w-6 text-center">{section.staticRowCount ?? 0}</span>
          <button onClick={addRow} className="w-6 h-6 rounded bg-gray-100 dark:bg-slate-800 text-gray-500">+</button>
        </div>
      )}

      {/* Columns */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Columns ({section.columns.length})</span>
          <div className="flex items-center gap-2">
            <button
              onClick={distributeColumns}
              disabled={section.columns.length < 2}
              className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40"
              title="Give every column an equal width"
            >
              <Columns3 size={11} /> Even widths
            </button>
            <button onClick={addColumn} className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-700">
              <Plus size={11} /> Add
            </button>
          </div>
        </div>
        {section.columns.map((c, i) => (
          <div key={c.id} className="rounded-md border border-gray-100 dark:border-slate-700 p-2 space-y-1.5">
            <div className="flex items-center gap-1">
              <input
                value={c.header}
                onChange={e => patchColumn(c.id, { header: e.target.value })}
                placeholder={t('drce.header')}
                className="flex-1 px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-xs outline-none"
              />
              <input
                value={c.width}
                onChange={e => patchColumn(c.id, { width: e.target.value })}
                title={t('drceProperties.width')}
                placeholder="20%"
                className="w-14 px-1.5 py-1 rounded bg-gray-100 dark:bg-slate-800 text-[10px] outline-none text-center"
              />
              <select
                value={c.align ?? 'left'}
                onChange={e => patchColumn(c.id, { align: e.target.value as 'left' | 'center' | 'right' })}
                className="px-1 py-1 rounded bg-gray-100 dark:bg-slate-800 text-[10px] outline-none"
                title={t('drceProperties.align')}
              >
                <option value="left">L</option><option value="center">C</option><option value="right">R</option>
              </select>
              <button onClick={() => moveColumn(c.id, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Move left"><ChevronUp size={12} /></button>
              <button onClick={() => moveColumn(c.id,  1)} disabled={i === section.columns.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Move right"><ChevronDown size={12} /></button>
              <button onClick={() => deleteColumn(c.id)} className="p-1 text-rose-400 hover:text-rose-600" title="Delete column"><Trash2 size={12} /></button>
            </div>
            {/* Arabic header label — shown instead of the English header when the
                report language is Arabic (e.g. 'Subject' / 'المادة'). */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-400 w-6 flex-shrink-0">AR</span>
              <input
                dir="rtl"
                value={c.headerAr ?? ''}
                onChange={e => patchColumn(c.id, { headerAr: e.target.value || undefined })}
                placeholder="عنوان عربي (اختياري)"
                className="flex-1 px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-xs outline-none"
              />
            </div>
            <input
              list="drce-binding-list"
              value={c.binding ?? ''}
              onChange={e => patchColumn(c.id, { binding: e.target.value || undefined })}
              placeholder="Default binding (e.g. result.score or {avg(results,'score') | number:'#,##0'})"
              className="w-full px-2 py-1 rounded bg-gray-50 dark:bg-slate-900 text-[10px] font-mono outline-none border border-gray-100 dark:border-slate-700"
            />
            <input
              value={c.format ?? ''}
              onChange={e => patchColumn(c.id, { format: e.target.value || undefined })}
              placeholder="Format (date:'D MMM YYYY' / number:'#,##0.0' / ordinal …)"
              className="w-full px-2 py-1 rounded bg-gray-50 dark:bg-slate-900 text-[10px] font-mono outline-none border border-gray-100 dark:border-slate-700"
            />
          </div>
        ))}
      </div>

      {/* Totals row */}
      <div className="rounded-md border border-gray-100 dark:border-slate-700 p-2 space-y-1.5">
        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          <input
            type="checkbox"
            checked={!!section.totals?.enabled}
            onChange={e => setProp(onMutate, section.id, 'totals', {
              enabled: e.target.checked,
              label: section.totals?.label ?? 'Total',
              sumColumnIds: section.totals?.sumColumnIds ?? [],
            })}
          />
          Totals row
        </label>
        {section.totals?.enabled && (
          <>
            <input
              value={section.totals.label ?? ''}
              onChange={e => setProp(onMutate, section.id, 'totals.label', e.target.value)}
              placeholder="Label" className="w-full px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-xs outline-none"
            />
            <div className="flex flex-wrap gap-1">
              {section.columns.map(c => {
                const on = section.totals?.sumColumnIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      const cur = new Set(section.totals?.sumColumnIds ?? []);
                      if (on) cur.delete(c.id); else cur.add(c.id);
                      setProp(onMutate, section.id, 'totals.sumColumnIds', [...cur]);
                    }}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${on
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-gray-200 dark:border-slate-700 text-gray-500'}`}
                  >
                    {c.header}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Per-cell overrides */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold flex items-center gap-1">
          <Calculator size={11} /> Per-cell overrides
        </div>
        <p className="text-[10px] text-gray-500">Use binding ({'{path}'}) for live values, formula (=SUM(B2:B12)) for spreadsheet maths, or a literal value.</p>
        {rowKeys.length === 0 && <p className="text-[10px] text-gray-400">No rows yet.</p>}
        {rowKeys.map((rk, ri) => (
          <details key={rk} className="rounded border border-gray-100 dark:border-slate-700">
            <summary className="cursor-pointer text-[11px] px-2 py-1 select-none">Row {ri + 1}</summary>
            <div className="p-2 space-y-1">
              {section.columns.map(col => {
                const k = `${rk}:${col.id}`;
                const ov = section.cells?.[k];
                const open = cellOpen === k;
                return (
                  <div key={col.id} className="text-[10px]">
                    <button
                      type="button"
                      onClick={() => setCellOpen(open ? null : k)}
                      className="w-full text-left flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-slate-800"
                    >
                      <span className="font-mono text-gray-500 w-12">{String.fromCharCode(65 + section.columns.findIndex(c => c.id === col.id))}{ri + 1}</span>
                      <span className="truncate">{ov?.formula ?? ov?.binding ?? String(ov?.value ?? '—')}</span>
                    </button>
                    {open && (
                      <div className="px-1.5 py-1 space-y-1 bg-gray-50 dark:bg-slate-900 rounded">
                        <input
                          value={ov?.value == null ? '' : String(ov.value)}
                          onChange={e => {
                            const cells = { ...(section.cells ?? {}) };
                            cells[k] = { ...(ov ?? {}), value: e.target.value || undefined };
                            replaceCells(cells);
                          }}
                          placeholder="Literal value"
                          className="w-full px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 outline-none"
                        />
                        <input
                          list="drce-binding-list"
                          value={ov?.binding ?? ''}
                          onChange={e => {
                            const cells = { ...(section.cells ?? {}) };
                            cells[k] = { ...(ov ?? {}), binding: e.target.value || undefined };
                            replaceCells(cells);
                          }}
                          placeholder="Binding (e.g. student.fullName)"
                          className="w-full px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 outline-none font-mono"
                        />
                        <input
                          value={ov?.formula ?? ''}
                          onChange={e => {
                            const cells = { ...(section.cells ?? {}) };
                            cells[k] = { ...(ov ?? {}), formula: e.target.value || undefined };
                            replaceCells(cells);
                          }}
                          placeholder="Formula (e.g. =SUM(B2:B12) or =IF(score >= 50, 'Pass', 'Fail'))"
                          className="w-full px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 outline-none font-mono"
                        />
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1">
                            Merge right
                            <input type="number" min={0} max={10}
                              value={ov?.mergeRight ?? 0}
                              onChange={e => {
                                const cells = { ...(section.cells ?? {}) };
                                cells[k] = { ...(ov ?? {}), mergeRight: Number(e.target.value) || undefined };
                                replaceCells(cells);
                              }}
                              className="w-10 px-1 py-0.5 rounded bg-white dark:bg-slate-800 outline-none text-center" />
                          </label>
                          <label className="flex items-center gap-1">
                            Merge down
                            <input type="number" min={0} max={10}
                              value={ov?.mergeDown ?? 0}
                              onChange={e => {
                                const cells = { ...(section.cells ?? {}) };
                                cells[k] = { ...(ov ?? {}), mergeDown: Number(e.target.value) || undefined };
                                replaceCells(cells);
                              }}
                              className="w-10 px-1 py-0.5 rounded bg-white dark:bg-slate-800 outline-none text-center" />
                          </label>
                          <button
                            onClick={() => {
                              const cells = { ...(section.cells ?? {}) };
                              delete cells[k];
                              replaceCells(cells);
                            }}
                            className="ml-auto text-rose-400 hover:text-rose-600 text-[10px]"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
