'use client';

/**
 * /reports/custom — build a report by picking a dataset, columns and filters.
 *
 * The dataset catalogue is fetched from /api/reports/custom?meta=1 rather than
 * duplicated here. Adding a column server-side makes it appear in this builder
 * with no change to this file — and, more importantly, there is no second list
 * to drift out of sync with the one that actually governs the SQL.
 */

import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  PieChart, Play, Download, FileSpreadsheet, Columns3, Filter as FilterIcon, Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import { useCurrency } from '@/hooks/useCurrency';
import { useExport } from '@/hooks/useExport';

type Kind = 'text' | 'number' | 'money' | 'date';

interface ColumnMeta { key: string; label: string; kind: Kind }
interface FilterMeta {
  key: string; label: string; type: 'text' | 'enum' | 'date';
  options: string[] | null; range: boolean;
}
interface DatasetMeta {
  key: string; label: string; description: string;
  defaultColumns: string[]; defaultOrder: string;
  columns: ColumnMeta[]; filters: FilterMeta[];
}
interface ResultState {
  columns: ColumnMeta[];
  rows: Record<string, any>[];
  count: number;
  truncated: boolean;
}

export default function CustomReportsPage() {
  const { data: meta } = useSWR<{ success: boolean; datasets: DatasetMeta[] }>(
    '/api/reports/custom?meta=1',
  );
  const datasets = meta?.datasets ?? [];

  const [datasetKey, setDatasetKey] = useState<string>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [orderBy, setOrderBy] = useState<string>('');
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('asc');
  const [limit, setLimit] = useState(500);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);

  const { format } = useCurrency();
  const { exportAsCSV, exportAsExcel, exporting } = useExport();

  const dataset = useMemo(
    () => datasets.find((d) => d.key === datasetKey) ?? null,
    [datasets, datasetKey],
  );

  // Default to the first dataset once the catalogue arrives.
  useEffect(() => {
    if (!datasetKey && datasets.length) setDatasetKey(datasets[0].key);
  }, [datasets, datasetKey]);

  // Selecting a dataset resets everything downstream — columns and filters from
  // one dataset are meaningless in another.
  useEffect(() => {
    if (!dataset) return;
    setSelected(dataset.defaultColumns);
    setFilters({});
    setOrderBy(dataset.defaultOrder);
    setOrderDir('asc');
    setResult(null);
  }, [dataset?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleColumn = (key: string) =>
    setSelected((cur) =>
      cur.includes(key) ? cur.filter((c) => c !== key) : [...cur, key],
    );

  const run = async () => {
    if (!dataset || selected.length === 0) return;
    setRunning(true);
    try {
      const p = new URLSearchParams({
        dataset: dataset.key,
        columns: selected.join(','),
        order_by: orderBy,
        order_dir: orderDir,
        limit: String(limit),
      });
      for (const [k, v] of Object.entries(filters)) {
        if (v) p.set(k, v);
      }
      const res = await apiFetch(`/api/reports/custom?${p.toString()}`);
      setResult({
        columns: res.columns,
        rows: res.rows ?? [],
        count: res.count ?? 0,
        truncated: !!res.truncated,
      });
    } catch {
      // apiFetch already surfaced the reason.
    } finally {
      setRunning(false);
    }
  };

  /** Values are formatted for display only; exports carry the raw values. */
  const render = (value: any, kind: Kind) => {
    if (value === null || value === undefined || value === '') return '—';
    if (kind === 'money') return format(Number(value));
    if (kind === 'number') return Number(value).toLocaleString();
    if (kind === 'date') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
    }
    return String(value);
  };

  const exportRows = () =>
    (result?.rows ?? []).map((row) => {
      const out: Record<string, any> = {};
      for (const c of result!.columns) out[c.label] = row[c.key];
      return out;
    });

  const filename = `${dataset?.label ?? 'report'}-${new Date().toISOString().slice(0, 10)}`;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start gap-3">
        <span className="rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
          <PieChart className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Custom reports
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Pick what you want to see, filter it, then export.
          </p>
        </div>
      </header>

      {!meta ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <>
          {/* ── 1. Dataset ─────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              1. What are you reporting on?
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {datasets.map((d) => {
                const active = d.key === datasetKey;
                return (
                  <button
                    key={d.key}
                    onClick={() => setDatasetKey(d.key)}
                    aria-pressed={active}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      active
                        ? 'border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                      {d.label}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                      {d.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {dataset && (
            <>
              {/* ── 2. Columns ─────────────────────────────────────────── */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <Columns3 className="h-4 w-4 text-slate-400" />
                  2. Columns
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dataset.columns.map((c) => {
                    const on = selected.includes(c.key);
                    return (
                      <button
                        key={c.key}
                        onClick={() => toggleColumn(c.key)}
                        aria-pressed={on}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          on
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400/50 dark:bg-blue-500/15 dark:text-blue-300'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                {selected.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Choose at least one column.
                  </p>
                )}
              </section>

              {/* ── 3. Filters ─────────────────────────────────────────── */}
              {dataset.filters.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <FilterIcon className="h-4 w-4 text-slate-400" />
                    3. Filters <span className="font-normal text-slate-400">(optional)</span>
                  </h2>
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {dataset.filters.map((f) => (
                      <div key={f.key}>
                        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                          {f.label}
                        </label>
                        {f.range ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={filters[`f_${f.key}_from`] ?? ''}
                              onChange={(e) =>
                                setFilters((s) => ({ ...s, [`f_${f.key}_from`]: e.target.value }))
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <span className="text-xs text-slate-400">to</span>
                            <input
                              type="date"
                              value={filters[`f_${f.key}_to`] ?? ''}
                              onChange={(e) =>
                                setFilters((s) => ({ ...s, [`f_${f.key}_to`]: e.target.value }))
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                            />
                          </div>
                        ) : f.type === 'enum' ? (
                          <select
                            value={filters[`f_${f.key}`] ?? ''}
                            onChange={(e) =>
                              setFilters((s) => ({ ...s, [`f_${f.key}`]: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          >
                            <option value="">Any</option>
                            {(f.options ?? []).map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            placeholder="Contains…"
                            value={filters[`f_${f.key}`] ?? ''}
                            onChange={(e) =>
                              setFilters((s) => ({ ...s, [`f_${f.key}`]: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── 4. Run ─────────────────────────────────────────────── */}
              <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Sort by
                  </label>
                  <select
                    value={orderBy}
                    onChange={(e) => setOrderBy(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {dataset.columns.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Direction
                  </label>
                  <select
                    value={orderDir}
                    onChange={(e) => setOrderDir(e.target.value as 'asc' | 'desc')}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Max rows
                  </label>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {[100, 500, 1000, 5000].map((n) => (
                      <option key={n} value={n}>{n.toLocaleString()}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={run}
                  disabled={running || selected.length === 0}
                  className="ml-auto inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {running ? 'Running…' : 'Run report'}
                </button>
              </section>

              {/* ── 5. Result ──────────────────────────────────────────── */}
              {result && (
                <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      <strong className="text-slate-900 dark:text-slate-100">
                        {result.count.toLocaleString()}
                      </strong>{' '}
                      row{result.count === 1 ? '' : 's'}
                      {result.truncated && (
                        <span className="ml-2 text-amber-600 dark:text-amber-400">
                          — capped at {limit.toLocaleString()}; narrow the filters to see the rest
                        </span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => exportAsCSV(exportRows(), filename)}
                        disabled={exporting || result.count === 0}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Download className="h-3.5 w-3.5" /> CSV
                      </button>
                      <button
                        onClick={() => exportAsExcel(exportRows(), filename)}
                        disabled={exporting || result.count === 0}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                      </button>
                    </div>
                  </div>

                  {result.count === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      Nothing matched. Try clearing a filter — a class name has to match exactly
                      as it is spelled in DRAIS.
                    </div>
                  ) : (
                    <div className="max-h-[32rem] overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                          <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {result.columns.map((c) => (
                              <th
                                key={c.key}
                                className={`px-4 py-2 font-medium ${
                                  c.kind === 'money' || c.kind === 'number' ? 'text-right' : ''
                                }`}
                              >
                                {c.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.map((row, i) => (
                            <tr
                              key={i}
                              className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                            >
                              {result.columns.map((c) => (
                                <td
                                  key={c.key}
                                  className={`px-4 py-2 text-slate-700 dark:text-slate-200 ${
                                    c.kind === 'money' || c.kind === 'number'
                                      ? 'text-right tabular-nums'
                                      : ''
                                  }`}
                                >
                                  {render(row[c.key], c.kind)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
