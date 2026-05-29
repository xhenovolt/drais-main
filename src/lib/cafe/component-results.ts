/**
 * CAFE Phase 2 — read path for student_component_results.
 *
 * Used by:
 *   • snapshot generator to embed SnapshotResultComponent[] per result
 *   • entry UI (Phase 3) to render existing entries before edits
 *   • analytics (Phase 5+) to roll component data into reports
 *
 * Write path lives in `component-entry.ts` (Phase 3).
 */
import { query } from '@/lib/db';

export interface ComponentResultRow {
  id:             number;
  schoolId:       number;
  studentId:      number;
  classId:        number;
  subjectId:      number;
  termId:         number;
  frameworkId:    number;
  componentId:    number;
  componentCode:  string;
  componentName:  string;
  componentWeight: number;
  scoringModelId: number;
  /** Either score or value_text will be populated depending on scoring kind. */
  score:          number | null;
  valueText:      string | null;
  gradeCode:      string | null;
  remarks:        string | null;
  enteredAt:      string;
}

/**
 * Bulk-load component results for an entire class+term in one query so
 * the snapshot generator doesn't N+1.
 *
 * Returns rows ordered by student / subject / component_sort_order so the
 * generator can group sequentially without re-sorting.
 */
export async function loadClassTermComponentResults(args: {
  schoolId: number;
  classId:  number;
  termId:   number;
}): Promise<ComponentResultRow[]> {
  const { schoolId, classId, termId } = args;
  const rows = (await query(
    `SELECT
        scr.id, scr.school_id, scr.student_id, scr.class_id, scr.subject_id,
        scr.term_id, scr.framework_id, scr.component_id, scr.score,
        scr.value_text, scr.grade_code, scr.remarks, scr.entered_at,
        ac.code   AS component_code,
        ac.name   AS component_name,
        ac.weight AS component_weight,
        ac.scoring_model_id, ac.sort_order
       FROM student_component_results scr
       JOIN assessment_components ac ON ac.id = scr.component_id
      WHERE scr.school_id = ? AND scr.class_id = ? AND scr.term_id = ?
      ORDER BY scr.student_id ASC, scr.subject_id ASC, ac.sort_order ASC, scr.component_id ASC`,
    [schoolId, classId, termId],
  )) as Array<{
    id: number; school_id: number; student_id: number; class_id: number;
    subject_id: number; term_id: number; framework_id: number;
    component_id: number; score: string | number | null;
    value_text: string | null; grade_code: string | null;
    remarks: string | null; entered_at: string;
    component_code: string; component_name: string;
    component_weight: string | number; scoring_model_id: number;
    sort_order: number;
  }>;
  return rows.map(r => ({
    id:              Number(r.id),
    schoolId:        Number(r.school_id),
    studentId:       Number(r.student_id),
    classId:         Number(r.class_id),
    subjectId:       Number(r.subject_id),
    termId:          Number(r.term_id),
    frameworkId:     Number(r.framework_id),
    componentId:     Number(r.component_id),
    componentCode:   r.component_code,
    componentName:   r.component_name,
    componentWeight: typeof r.component_weight === 'number' ? r.component_weight : parseFloat(String(r.component_weight)),
    scoringModelId:  Number(r.scoring_model_id),
    score:           r.score == null ? null : (typeof r.score === 'number' ? r.score : parseFloat(String(r.score))),
    valueText:       r.value_text,
    gradeCode:       r.grade_code,
    remarks:         r.remarks,
    enteredAt:       r.entered_at,
  }));
}

/**
 * Compute a single rollup score from a list of component results.
 *
 * Strategy: weighted mean over components that have a numeric score.
 * Components without a numeric score (descriptor-only) are ignored in the
 * rollup. If no component contributes a number, the rollup is null and
 * the legacy `result.score` field will be 0 — same as today's empty result.
 *
 * Pure function — no DB, no React.
 */
export function computeRollupScore(components: ComponentResultRow[]): number | null {
  let weighted = 0;
  let weightSum = 0;
  for (const c of components) {
    if (c.score == null || !Number.isFinite(c.score)) continue;
    const w = Number.isFinite(c.componentWeight) ? c.componentWeight : 1;
    weighted += c.score * w;
    weightSum += w;
  }
  if (weightSum === 0) return null;
  return Math.round((weighted / weightSum) * 100) / 100;
}
