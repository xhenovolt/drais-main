/**
 * Control Center — client-side export helpers.
 * `toCSV` is PURE (unit-tested); `downloadCSV` is browser-only.
 */
export interface ExportColumn<T = any> { key: string; label: string; value?: (row: T) => any }

const esc = (v: any): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** PURE: rows → CSV text. Columns optional (inferred from the first row). */
export function toCSV<T extends Record<string, any>>(rows: T[], columns?: ExportColumn<T>[]): string {
  const cols: ExportColumn<T>[] = columns ?? Object.keys(rows[0] ?? {}).map((k) => ({ key: k, label: k }));
  const header = cols.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => esc(c.value ? c.value(r) : r[c.key])).join(',')).join('\r\n');
  return rows.length ? `${header}\r\n${body}` : header;
}

/** Browser: trigger a CSV file download of `rows`. */
export function downloadCSV<T extends Record<string, any>>(filename: string, rows: T[], columns?: ExportColumn<T>[]): void {
  const csv = toCSV(rows, columns);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM → Excel-friendly
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
