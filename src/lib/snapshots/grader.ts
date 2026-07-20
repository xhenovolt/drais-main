/**
 * Grading and remarks application.
 *
 * Default scale is the UCE (Uganda Certificate of Education) scale at
 * src/lib/drce/defaults.ts:13. Theology and secular share the same scale
 * by default; per-school overrides can be added later via DRCE config.
 *
 * Comments are language-aware and mirror the verbatim strings hard-coded
 * in the three emergency routes — see
 * src/app/academics/theology-emergency-reports/route.ts:189-191 and
 * src/app/academics/secular-emergency-reports/route.ts:160-162.
 */
import { DEFAULT_GRADE_ROWS } from '@/lib/drce/defaults';
import type { SnapshotConfig, SnapshotLanguage } from './types';

export interface GradingScaleEntry {
  min:    number;
  max:    number;
  grade:  string;
  remark: string;
}

export const DEFAULT_GRADING_SCALE: GradingScaleEntry[] = DEFAULT_GRADE_ROWS.map(g => ({
  min:    g.min,
  max:    g.max,
  grade:  g.label,
  remark: g.remark,
}));

/**
 * Map a Western numeric score to the corresponding grade entry.
 * Falls back to the lowest band if no match (defensive — not expected to fire).
 */
export function applyGradingScale(score: number | null, scale: GradingScaleEntry[]): GradingScaleEntry | null {
  if (score === null || !Number.isFinite(score)) return null;
  for (const entry of scale) {
    if (score >= entry.min && score <= entry.max) return entry;
  }
  return scale[scale.length - 1] ?? null;
}

/**
 * Generate a per-student overall remark from the average.
 * Mirrors the loose theology/secular bands used by existing reports.
 */
export function deriveOverallRemark(average: number, language: SnapshotLanguage): string {
  if (language === 'ar') {
    if (average >= 80) return 'ممتاز';
    if (average >= 65) return 'جيد جداً';
    if (average >= 50) return 'جيد';
    if (average >= 40) return 'مقبول';
    return 'ضعيف ويحتاج متابعة';
  }
  if (average >= 80) return 'Excellent';
  if (average >= 65) return 'Very Good';
  if (average >= 50) return 'Good';
  if (average >= 40) return 'Fair';
  return 'Needs Improvement';
}

/**
 * The grade-label "remarks" the auto-grader emits (e.g. "Distinction 1",
 * "Credit 3"). These are NOT real subject comments — they just spell out the
 * grade. When one of them is the stored per-subject remark we upgrade it to a
 * meaningful phrase at render time. Lower-cased for case-insensitive matching.
 */
const GRADE_LABEL_REMARKS: ReadonlySet<string> = new Set(
  DEFAULT_GRADE_ROWS.map(g => g.remark.trim().toLowerCase()),
);

/**
 * A meaningful, concise per-subject comment derived from the score — wiser than
 * echoing the grade label. Language-aware (Arabic for theology / Albayan).
 */
export function subjectComment(score: number | null, language: SnapshotLanguage): string {
  if (score === null || !Number.isFinite(score)) return '';
  if (language === 'ar') {
    if (score >= 80) return 'ممتاز، أداء رائع';
    if (score >= 70) return 'جيد جداً';
    if (score >= 60) return 'جيد';
    if (score >= 50) return 'مقبول، يمكن تحسينه';
    if (score >= 40) return 'يحتاج إلى مزيد من الجهد';
    return 'ضعيف، اجتهد أكثر';
  }
  if (score >= 80) return 'Excellent performance';
  if (score >= 70) return 'Very good';
  if (score >= 60) return 'Good';
  if (score >= 50) return 'Fair, can do better';
  if (score >= 40) return 'Needs more effort';
  return 'Work harder';
}

/**
 * Upgrade a stored per-subject remark for DISPLAY: keep genuine comments
 * (teacher-written or rule-based), but replace empty or bare grade-label
 * remarks ("Distinction 1") with a meaningful phrase. Used by both render
 * adapters so new AND existing snapshots show wise comments without touching
 * stored data (so dataHash / determinism is unaffected).
 */
export function displaySubjectComment(
  remarks: string | null | undefined,
  score: number | null,
  language: SnapshotLanguage,
): string {
  const r = (remarks ?? '').trim();
  if (r && !GRADE_LABEL_REMARKS.has(r.toLowerCase())) return r; // genuine comment — keep it
  return subjectComment(score, language) || r;
}

/**
 * Comments block matching the three emergency routes verbatim. Stored on
 * each student so the snapshot is self-contained and language-stable.
 */
export function defaultComments(language: SnapshotLanguage) {
  if (language === 'ar') {
    return {
      classTeacher: 'عمل ممتاز، استمر',
      dos:          'شكرا لهذا الجهد، استمر',
      headTeacher:  'درجات واعدة استمر',
    };
  }
  return {
    classTeacher: 'Excellent work, keep it up',
    dos:          'Thank you for this effort, continue',
    headTeacher:  'Promising grades, continue',
  };
}

/**
 * Default snapshot.config bundle. Captured at generation time so later
 * template/scale edits don't retroactively alter past snapshots.
 */
export function buildDefaultConfig(nextTermBegins: string): SnapshotConfig {
  return {
    gradingScale: DEFAULT_GRADING_SCALE.map(e => ({
      min:    e.min,
      max:    e.max,
      grade:  e.grade,
      remark: e.remark,
    })),
    nextTermBegins,
  };
}
