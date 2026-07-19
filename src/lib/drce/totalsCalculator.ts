/**
 * src/lib/drce/totalsCalculator.ts
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Utilities for calculating totals and averages in DRCE report tables
 */

import type { DRCEColumn, DRCEDataContext, DRCEResultsTableTotalsConfig } from './schema';
import { resolveBinding } from './bindingResolver';

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

export function buildTotalsRowCellContent(options: {
  column: TotalsColumnLike;
  totals: Record<string, number>;
  totalsConfig?: DRCEResultsTableTotalsConfig;
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
    return totalsConfig?.showTotalPossible ? totalPossible.toFixed(1) : '';
  }

  if (header.includes('total') && header.includes('marks')) {
    if (totalsConfig?.sumColumnIds?.includes(column.id)) {
      const value = totals[column.id] ?? 0;
      return value % 1 === 0 ? String(value) : value.toFixed(1);
    }
    return '100';
  }

  if (header.includes('total') || header.includes('obtained') || header.includes('score') || header.includes('eot')) {
    if (totalsConfig?.showTotalObtained !== false) {
      if (totalsConfig?.sumColumnIds?.includes(column.id)) {
        const value = totals[column.id] ?? 0;
        return value % 1 === 0 ? String(value) : value.toFixed(1);
      }
      return totalObtained % 1 === 0 ? String(totalObtained) : totalObtained.toFixed(1);
    }
  }

  if (header.includes('possible') || header.includes('maximum')) {
    return totalsConfig?.showTotalPossible ? totalPossible.toFixed(1) : '';
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
