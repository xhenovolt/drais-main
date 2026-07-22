/**
 * Snapshot integrity checks — regression guard for the 2026-07 Albayan
 * division-mismatch postmortem.
 *
 * Invariant: every aggregate/division pair stored in (or derivable from) a
 * snapshot must be computed from the SAME contributing subject set
 * (`getContributingAssessmentResults` — ICT, IRE and electives never count)
 * with the canonical thresholds. This module verifies that the generation-time
 * audit metadata and any stored per-student values honour the invariant.
 *
 * Checks are pure and read-only; callers decide whether violations are fatal.
 * Grade schemes outside the D1–F9 grade-point map (nursery letters, Arabic
 * word grades, legacy A–E schemes) are skipped — the invariant is undefined
 * for them.
 */
import type { ReportSnapshot } from './types';
import { getContributingAssessmentResults } from './assessment';
import {
  isNurseryClassName,
  computeAggregateFromGrades,
  computeDivision,
  DEFAULT_DIVISION_CONFIG,
  DEFAULT_REPORT_GRADE_POINT_MAP,
  gradeForScore,
} from '@/lib/reports/canonical-report-engine';

export interface DivisionCoherenceViolation {
  classId: number;
  className: string;
  studentDbId: number;
  studentName: string;
  /** Which stored surface violates the invariant. */
  source: 'audit' | 'student';
  expectedAggregates: number;
  expectedDivision: string;
  actualAggregates: number | null;
  actualDivision: string | null;
}

/** Resolve the grade letter the renderer would use for a result row. */
function resolvedGrade(r: { grade?: string | null; score?: number | null }): string {
  const g = r.grade == null ? '' : String(r.grade).trim();
  if (g) return g.toUpperCase();
  return r.score != null ? gradeForScore(r.score, false) : '';
}

/**
 * Verify that audit metadata and stored per-student aggregates/divisions are
 * coherent with the contributing subject set. Returns violations (empty when
 * the snapshot is sound). Nursery classes and unmapped grade schemes skip.
 */
export function verifySnapshotDivisionCoherence(
  snapshot: Pick<ReportSnapshot, 'classes' | 'audit'>,
): DivisionCoherenceViolation[] {
  const violations: DivisionCoherenceViolation[] = [];

  for (const cls of snapshot.classes ?? []) {
    if (isNurseryClassName(cls.className)) continue;
    for (const stu of cls.students ?? []) {
      const contributing = getContributingAssessmentResults(stu.results, cls.subjects);
      const grades = contributing.map(resolvedGrade);
      // Invariant undefined outside the canonical grade-point scheme.
      if (!grades.length || grades.some((g) => !(g in DEFAULT_REPORT_GRADE_POINT_MAP))) continue;

      const expectedAggregates = computeAggregateFromGrades(grades);
      const expectedDivision = computeDivision(expectedAggregates, DEFAULT_DIVISION_CONFIG);

      const audit = snapshot.audit?.[cls.classId]?.[stu.studentDbId];
      if (audit && (audit.aggregates !== expectedAggregates || audit.division !== expectedDivision)) {
        violations.push({
          classId: cls.classId, className: cls.className,
          studentDbId: stu.studentDbId, studentName: stu.name,
          source: 'audit',
          expectedAggregates, expectedDivision,
          actualAggregates: audit.aggregates ?? null,
          actualDivision: audit.division ?? null,
        });
      }

      const storedAgg = (stu as { aggregates?: number | null }).aggregates;
      const storedDiv = (stu as { division?: string | null }).division;
      if (storedAgg !== undefined || storedDiv !== undefined) {
        if (storedAgg !== expectedAggregates || storedDiv !== expectedDivision) {
          violations.push({
            classId: cls.classId, className: cls.className,
            studentDbId: stu.studentDbId, studentName: stu.name,
            source: 'student',
            expectedAggregates, expectedDivision,
            actualAggregates: storedAgg ?? null,
            actualDivision: storedDiv ?? null,
          });
        }
      }
    }
  }

  return violations;
}
