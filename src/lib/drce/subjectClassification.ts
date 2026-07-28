/**
 * Shared subject classification for DRCE result rows — used by both the
 * subjectFilter feature and the grouped results-table layout (Reporting
 * Architecture Phase 2). Reuses the same subject_type + IRE classification
 * the contributing-subjects filter already relies on elsewhere in DRAIS
 * (getContributingAssessmentResults) — no new schema, no hardcoded subject
 * name lists.
 */
import { isReligiousEducationSubject } from '@/lib/theology-subject-classifier';

export interface ClassifiableResultRow {
  subjectType?: string | null;
  subjectName?: string | null;
}

/** True when a result row is an elective/non-core subject. */
export function isElectiveResultRow(r: ClassifiableResultRow): boolean {
  const type = (r.subjectType ?? 'primary').toLowerCase();
  const isIRE = isReligiousEducationSubject(String(r.subjectName || ''));
  return !isIRE && type !== 'primary' && type !== 'core' && type !== 'theology' && type !== 'islamic' && type !== 'religion';
}

/** Partition rows into Core / Elective bands, preserving relative order
 *  within each band (the caller supplies rows already in resolved report
 *  order — this only partitions, never re-sorts). */
export function groupResultRowsByCategory<T extends ClassifiableResultRow>(rows: T[]): { core: T[]; elective: T[] } {
  const core: T[] = [];
  const elective: T[] = [];
  for (const r of rows) (isElectiveResultRow(r) ? elective : core).push(r);
  return { core, elective };
}
