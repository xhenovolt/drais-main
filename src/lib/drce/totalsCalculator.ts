/**
 * src/lib/drce/totalsCalculator.ts
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Utilities for calculating totals and averages in DRCE report tables
 */

import type { DRCEColumn, DRCEDataContext, DRCEResultsTableTotalsConfig, DRCEAcademicSummaryConfig } from './schema';
import { resolveBinding } from './bindingResolver';

/** Values feeding the consolidated academic-standing summary (Phase I). */
export interface AcademicSummaryValues {
  totalObtained: number;
  totalPossible: number;
  percentage: number;
  averageScore: number;
  aggregate?: number | null;
  division?: string | null;
  position?: string | null;
}

/**
 * Build the enabled academic-summary line items from config + live values.
 * Pure and deterministic — no hardcoded data, only labels. An item is emitted
 * only when its flag is on AND (for aggregate/division/position) a value exists,
 * so nursery/early-years reports without aggregates simply omit those lines.
 */
export function buildAcademicSummaryItems(
  cfg: DRCEAcademicSummaryConfig | undefined,
  v: AcademicSummaryValues,
  language: 'en' | 'ar' = 'en',
): Array<{ key: string; label: string; value: string }> {
  const on = (flag: boolean | undefined, dflt: boolean) => flag ?? dflt;
  const L = cfg?.labels ?? {};
  const ar = language === 'ar';
  const fmt = (n: number) => (Number.isFinite(n) ? (n % 1 === 0 ? String(n) : n.toFixed(1)) : '0');
  const present = (s: unknown) => s != null && String(s).trim() !== '';
  const items: Array<{ key: string; label: string; value: string }> = [];

  if (on(cfg?.showTotalMarks, true)) {
    const value = on(cfg?.showTotalPossible, false) && v.totalPossible > 0
      ? `${fmt(v.totalObtained)} / ${fmt(v.totalPossible)}`
      : fmt(v.totalObtained);
    items.push({ key: 'total', label: L.total ?? (ar ? 'المجموع' : 'Total'), value });
  }
  if (on(cfg?.showPercentage, true)) {
    items.push({ key: 'percentage', label: L.percentage ?? (ar ? 'النسبة' : 'Percentage'), value: `${v.percentage.toFixed(1)}%` });
  }
  if (on(cfg?.showAverage, true)) {
    items.push({ key: 'average', label: L.average ?? (ar ? 'المعدل' : 'Average'), value: fmt(v.averageScore) });
  }
  if (on(cfg?.showAggregate, true) && v.aggregate != null) {
    items.push({ key: 'aggregate', label: L.aggregate ?? (ar ? 'المجموع الكلي' : 'Aggregate'), value: String(v.aggregate) });
  }
  if (on(cfg?.showDivision, true) && present(v.division)) {
    items.push({ key: 'division', label: L.division ?? (ar ? 'الشعبة' : 'Division'), value: String(v.division) });
  }
  if (on(cfg?.showPosition, false) && present(v.position)) {
    items.push({ key: 'position', label: L.position ?? (ar ? 'الترتيب' : 'Position'), value: String(v.position) });
  }
  return items;
}

interface TotalsColumnLike {
  id: string;
  binding?: string;
  header?: string;
}

/**
 * Generate default totals configuration for a results table
 * Automatically detects numeric columns (typically score/marks columns)
 */
export function generateDefaultTotalsConfig(
  columns: DRCEColumn[],
  options?: {
    labelColumnId?: string;
    sumColumnIds?: string[];
    showAverage?: boolean;
  }
): DRCEResultsTableTotalsConfig {
  // If not specified, try to find score/marks column
  let sumColumnIds = options?.sumColumnIds;
  if (!sumColumnIds || sumColumnIds.length === 0) {
    sumColumnIds = columns
      .filter(col => 
        col.id.toLowerCase().includes('score') || 
        col.id.toLowerCase().includes('marks') ||
        col.id.toLowerCase().includes('total') ||
        col.id.toLowerCase().includes('grade_points')
      )
      .map(col => col.id);
  }

  // If no score columns found, use all numeric-looking columns
  if (sumColumnIds.length === 0) {
    sumColumnIds = columns.slice(-2).map(col => col.id); // Last 2 columns typically score/grade
  }

  // Find label column (usually first column like subject_name)
  const labelColumnId = options?.labelColumnId || 
    columns.find(col => col.header.toLowerCase().includes('subject'))?.id ||
    columns[0]?.id ||
    'subject';

  return {
    enabled: true,
    labelColumnId,
    labelText: 'TOTAL',
    sumColumnIds,
    showTotalObtained: true,
    showTotalPossible: true,
    showPercentage: true,
    showGrandGrade: false,
    showAverage: options?.showAverage ?? true,
    averageLabelColumnId: labelColumnId,
    averageLabelText: 'AVERAGE',
    rowStyle: {
      fontWeight: 'bold',
      background: 'rgba(0, 0, 0, 0.05)',
    },
  };
}

/**
 * Calculate totals for specified columns in results
 */
export function calculateColumnTotals(
  results: Array<Record<string, any>>,
  columns: string[] | TotalsColumnLike[],
  ctx: DRCEDataContext,
): Record<string, number> {
  const totals: Record<string, number> = {};
  const columnDefinitions = Array.isArray(columns) && columns.length > 0 && typeof columns[0] === 'string'
    ? undefined
    : (columns as TotalsColumnLike[]);
  const colIds = Array.isArray(columns) && columns.length > 0 && typeof columns[0] === 'string'
    ? (columns as string[])
    : (columns as TotalsColumnLike[]).map(col => col.id);

  colIds.forEach(colId => {
    let sum = 0;
    let count = 0;
    const column = columnDefinitions?.find(c => c.id === colId) ?? ctx.columns?.find(c => c.id === colId);
    const binding = column?.binding ?? '';

    results.forEach(row => {
      if (!binding) return;
      const value = resolveBinding(binding, ctx, row);
      const numValue = parseFloat(String(value));
      if (!isNaN(numValue)) {
        sum += numValue;
        count++;
      }
    });

    totals[colId] = count > 0 ? sum : 0;
  });

  return totals;
}

/**
 * Calculate averages for specified columns in results
 */
export function calculateColumnAverages(
  results: Array<Record<string, any>>,
  columns: string[] | TotalsColumnLike[],
  ctx: DRCEDataContext,
): Record<string, number> {
  const totals = calculateColumnTotals(results, columns, ctx);
  const count = results.length;

  const averages: Record<string, number> = {};
  const colIds = Array.isArray(columns) && columns.length > 0 && typeof columns[0] === 'string'
    ? (columns as string[])
    : (columns as TotalsColumnLike[]).map(col => col.id);

  colIds.forEach(colId => {
    averages[colId] = count > 0 ? totals[colId] / count : 0;
  });

  return averages;
}

/**
 * Detect which columns are summable by inspecting the ACTUAL data, not the
 * column id/header. A column is summable when every non-empty value its binding
 * resolves to (across all result rows) parses as a finite number. This is robust
 * to any naming convention — eot/bot/mot/exam/marks/final all work — and it
 * correctly excludes grade-label, subject-name and remark columns (non-numeric).
 */
export function detectNumericColumnIds(
  columns: TotalsColumnLike[],
  results: Array<Record<string, any>>,
  ctx: DRCEDataContext,
): string[] {
  const ids: string[] = [];
  for (const col of columns) {
    if (!col.binding) continue;
    let numeric = 0;
    let nonEmpty = 0;
    for (const row of results) {
      const v = resolveBinding(col.binding, ctx, row);
      if (v === null || v === undefined || String(v).trim() === '') continue;
      nonEmpty++;
      if (!isNaN(parseFloat(String(v)))) numeric++;
    }
    if (nonEmpty > 0 && numeric === nonEmpty) ids.push(col.id);
  }
  return ids;
}

export function buildTotalsRowCellContent(options: {
  column: TotalsColumnLike;
  totals: Record<string, number>;
  totalsConfig?: DRCEResultsTableTotalsConfig;
  /** Authoritative set of columns that carry a sum. When provided it wins over
   *  any id/header heuristic — this is the resolved (configured or auto-detected)
   *  summable set from the renderer. */
  summableColumnIds?: string[];
  totalObtained: number;
  totalPossible: number;
  percentage: number;
  averageScore: number;
  language?: 'en' | 'ar';
  isFirstColumn?: boolean;
}): string {
  const {
    column,
    totals,
    totalsConfig,
    totalObtained,
    totalPossible,
    percentage,
    averageScore,
    language = 'en',
    isFirstColumn = false,
  } = options;

  if (isFirstColumn) {
    if (language === 'ar') {
      return totalsConfig?.labelTextAr ?? totalsConfig?.labelText ?? 'المجموع';
    }
    return totalsConfig?.labelText ?? 'TOTAL';
  }

  const header = String(column.header || '').toLowerCase();

  if (header.includes('percentage') || header.includes('%')) {
    return totalsConfig?.showPercentage !== false ? `${percentage.toFixed(1)}%` : '';
  }

  if (header.includes('average')) {
    return totalsConfig?.showAverage ? averageScore.toFixed(1) : '';
  }

  if (header.includes('subject') || header.includes('name')) {
    return '';  // Subject/name column in totals row is blank
  }

  // A column shows its sum iff it is in the resolved summable set. When the
  // renderer passes summableColumnIds (configured OR auto-detected from the
  // data), that is authoritative — no id/header guessing. Falls back to the
  // stored sumColumnIds only when no set is supplied (older callers).
  const inSummable = options.summableColumnIds
    ? options.summableColumnIds.includes(column.id)
    : (totalsConfig?.sumColumnIds?.includes(column.id) ?? false);
  if (inSummable) {
    const value = totals[column.id] ?? 0;
    return value % 1 === 0 ? String(value) : value.toFixed(1);
  }

  // Legacy fallback (only when the caller supplied no summable set at all):
  // guess from the header text so pre-existing callers keep working.
  if (!options.summableColumnIds &&
      (header.includes('score') || header.includes('mark') || header.includes('total') || header.includes('eot'))) {
    const value = totals[column.id];
    if (typeof value === 'number') {
      return value % 1 === 0 ? String(value) : value.toFixed(1);
    }
  }

  return '';
}

/**
 * Format a number to display with appropriate decimal places
 */
export function formatNumber(value: number, decimalPlaces: number = 2): string {
  if (value % 1 === 0) {
    return String(value); // No decimals if whole number
  }
  return value.toFixed(decimalPlaces);
}

/**
 * Get overall totals and averages summary
 */
export function getReportSummary(
  results: Array<Record<string, any>>,
  sumColumnIds: string[],
  ctx: DRCEDataContext,
): {
  totalScores: Record<string, number>;
  averageScores: Record<string, number>;
  overallTotal: number;
  overallAverage: number;
  subjectCount: number;
} {
  const totalScores = calculateColumnTotals(results, sumColumnIds, ctx);
  const averageScores = calculateColumnAverages(results, sumColumnIds, ctx);

  const overallTotal = Object.values(totalScores).reduce((sum, val) => sum + val, 0);
  const subjectCount = sumColumnIds.length;
  const overallAverage = subjectCount > 0 ? overallTotal / subjectCount : 0;

  return {
    totalScores,
    averageScores,
    overallTotal,
    overallAverage,
    subjectCount,
  };
}
