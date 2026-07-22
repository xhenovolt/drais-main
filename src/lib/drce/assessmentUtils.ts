import type { DRCEAggregateConfig, DRCEResultRow, Language } from './schema';
import { getContributingAssessmentResults } from '@/lib/snapshots/assessment';

const WESTERN_TO_ARABIC_DIGITS: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
  '.': '٫',
};

function toArabicNumerals(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '٠';
  return String(value).replace(/[0-9.]/g, ch => WESTERN_TO_ARABIC_DIGITS[ch] ?? ch);
}

export const DEFAULT_GRADE_POINT_MAP: Record<string, number> = {
  D1: 1, D2: 2, C3: 3, C4: 4, C5: 5, C6: 6, P7: 7, P8: 8, F9: 9,
};

export const DEFAULT_DIVISION_THRESHOLDS: Array<{ maxValue: number; label: string }> = [
  { maxValue: 12, label: 'Division I' },
  { maxValue: 24, label: 'Division II' },
  { maxValue: 28, label: 'Division III' },
  { maxValue: 32, label: 'Division IV' },
];

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDivisionThresholds(config?: DRCEAggregateConfig) {
  const thresholds = config?.divisionThresholds ?? DEFAULT_DIVISION_THRESHOLDS;
  return [...thresholds].sort((a, b) => a.maxValue - b.maxValue);
}

export function calculateAggregateFromResults(
  results: DRCEResultRow[],
  config?: DRCEAggregateConfig,
): number | null {
  if (!results?.length) return null;

  // Aggregates are always computed as the sum of grade-point values.
  // Marks-based summing is no longer supported for DRCE assessment sections.
  const gradePointMap = config?.gradePointMap && Object.keys(config.gradePointMap).length > 0
    ? config.gradePointMap
    : DEFAULT_GRADE_POINT_MAP;

  return results.reduce((acc, row) => {
    const grade = String(row.grade ?? '').toUpperCase().trim();
    const points = gradePointMap[grade];
    return typeof points === 'number' ? acc + points : acc;
  }, 0);
}

export function calculateDivisionFromAggregate(
  aggregate: number | null,
  config?: DRCEAggregateConfig,
): string | null {
  if (aggregate === null) return null;
  const thresholds = normalizeDivisionThresholds(config);
  const fallback = config?.divisionFallback ?? 'Division U';
  for (const threshold of thresholds) {
    if (aggregate <= threshold.maxValue) {
      return threshold.label;
    }
  }
  return fallback;
}

export function formatAggregates(
  aggregate: number | null,
  language: Language = 'en',
): string | null {
  if (aggregate === null) return null;
  const value = String(aggregate);
  return language === 'ar' ? toArabicNumerals(value) : value;
}

export function formatDivision(
  division: string | null,
  language: Language = 'en',
): string | null {
  if (!division) return null;
  if (language === 'ar') {
    return division.replace(/\d+/g, digits => toArabicNumerals(digits));
  }
  return division;
}

export function computeAssessmentRawValues(
  results: DRCEResultRow[],
  config?: DRCEAggregateConfig,
): { aggregate: number | null; division: string | null } {
  const aggregate = calculateAggregateFromResults(results, config);
  const division = calculateDivisionFromAggregate(aggregate, config);
  return { aggregate, division };
}

/**
 * Resolve the assessment values an `assessment` section must display.
 *
 * Invariant (production bug 2026-07, Albayan): the aggregate and the division
 * shown on one report MUST derive from the SAME subject set — the contributing
 * set (principal/core/primary; ICT, IRE and electives never count). The old
 * renderer spread `...computeAssessmentRawValues(dataCtx.results)` over
 * `dataCtx.assessment`, which (a) summed ALL subjects including secondary/IRE
 * and (b) only overwrote `division` because the raw result uses the singular
 * `aggregate` key — so reports showed a correct aggregate next to a division
 * computed from a different, larger total.
 *
 * Nursery classes keep the base assessment untouched (letter grade, no
 * aggregates). When no result row carries a resolvable subject (legacy editor
 * sample data), all rows are treated as contributing to preserve previews.
 */
export function resolveAssessmentForSection<T extends { aggregates?: number | null; division?: string | null }>(
  baseAssessment: T,
  results: readonly DRCEResultRow[],
  config?: DRCEAggregateConfig,
  opts?: { isNursery?: boolean },
): T {
  if (opts?.isNursery) return baseAssessment;

  const rows = (results ?? []) as Array<DRCEResultRow & { subject?: { id?: string | number | null } }>;
  const hasSubjectInfo = rows.some((r) => r.subject != null);
  const contributing = hasSubjectInfo
    ? getContributingAssessmentResults(rows, undefined)
    : rows;

  const raw = computeAssessmentRawValues(contributing as DRCEResultRow[], config);
  return { ...baseAssessment, aggregates: raw.aggregate, division: raw.division };
}

export function computeAssessmentValues(
  results: DRCEResultRow[],
  config?: DRCEAggregateConfig,
  language: Language = 'en',
): { aggregates: string | null; division: string | null } {
  const raw = computeAssessmentRawValues(results, config);
  return {
    aggregates: formatAggregates(raw.aggregate, language),
    division: formatDivision(raw.division, language),
  };
}
