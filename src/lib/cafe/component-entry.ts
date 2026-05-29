/**
 * CAFE Phase 3 — write path for student_component_results.
 *
 * Per-cell upsert (one student × one component × one (class, subject, term))
 * plus bulk-entry helpers that feed the entry UI grid.
 *
 * Validation is scoring-model-aware: a numeric model accepts 0..max; a
 * scale model accepts only the configured scale values; a descriptor
 * model accepts any string. The grade_code is resolved at write time
 * from grade_mappings and persisted so reads stay fast.
 */
import { query } from '@/lib/db';
import { getScoringModel } from './scoring';
import { getFramework } from './frameworks';
import type { ScoringModel, GradeMapping } from './types';

export interface CellInput {
  studentId:   number;
  classId:     number;
  subjectId:   number;
  termId:      number;
  componentId: number;
  /** Numeric value for numeric/scale models. */
  score?:      number | null;
  /** Descriptor text — required for descriptor models, optional remark for others. */
  valueText?:  string | null;
  remarks?:    string | null;
}

export interface SaveResult {
  written:  number;
  skipped:  Array<{ cell: CellInput; reason: string }>;
}

/**
 * Look up which grade_mapping entry applies to a (score, valueText) under
 * a given scoring model. Numeric / scale models use the bounds; letter and
 * descriptor models use the code/label match.
 */
function resolveGradeCode(model: ScoringModel, score: number | null, valueText: string | null): string | null {
  const grades = model.grades ?? [];
  if (!grades.length) return null;
  if (model.kind === 'descriptor' && valueText) {
    const hit = grades.find(g => g.code === valueText || g.label.toLowerCase() === valueText.toLowerCase());
    return hit?.code ?? null;
  }
  if (model.kind === 'letter' && valueText) {
    const hit = grades.find(g => g.code === valueText);
    return hit?.code ?? null;
  }
  if (score == null || !Number.isFinite(score)) return null;
  // Bounds match. Inclusive lower/upper from grade_mappings.
  for (const g of grades) {
    if (g.lowerBound != null && score < g.lowerBound) continue;
    if (g.upperBound != null && score > g.upperBound) continue;
    return g.code;
  }
  return null;
}

function validateCellAgainstModel(
  model: ScoringModel, cell: CellInput,
): { ok: true } | { ok: false; reason: string } {
  if (model.kind === 'numeric' || model.kind === 'scale') {
    if (cell.score == null) {
      // Allow clearing a cell by passing null score AND null/empty valueText.
      if (cell.valueText) return { ok: true };
      return { ok: true };  // null score → clear
    }
    if (!Number.isFinite(cell.score)) return { ok: false, reason: 'score must be a number' };
    const cfg = (model.config ?? {}) as { min?: number; max?: number };
    if (typeof cfg.min === 'number' && cell.score < cfg.min) {
      return { ok: false, reason: `score must be ≥ ${cfg.min}` };
    }
    if (typeof cfg.max === 'number' && cell.score > cfg.max) {
      return { ok: false, reason: `score must be ≤ ${cfg.max}` };
    }
  }
  if (model.kind === 'letter' && cell.valueText) {
    const letters = ((model.config ?? {}) as { letters?: string[] }).letters ?? [];
    if (letters.length && !letters.includes(cell.valueText)) {
      return { ok: false, reason: `letter must be one of: ${letters.join(', ')}` };
    }
  }
  if (model.kind === 'descriptor' && cell.valueText) {
    const choices = ((model.config ?? {}) as { choices?: Array<{ value: string }> }).choices ?? [];
    if (choices.length && !choices.some(c => c.value === cell.valueText || c.value.toLowerCase() === cell.valueText!.toLowerCase())) {
      return { ok: false, reason: 'descriptor not in the configured choice list' };
    }
  }
  return { ok: true };
}

/**
 * Bulk upsert. Resolves the scoring model + grade mapping per component
 * once, then writes every cell that validates against it. Failed cells
 * are returned in `skipped` rather than aborting the whole batch — the
 * entry UI surfaces them per-cell.
 *
 * Clearing a cell: pass score=null AND valueText=null/'' → DELETE.
 */
export async function saveCells(args: {
  schoolId:  number;
  enteredBy: number | null;
  cells:     CellInput[];
}): Promise<SaveResult> {
  const { schoolId, enteredBy, cells } = args;
  if (!cells.length) return { written: 0, skipped: [] };

  // Cache framework + scoring model per componentId for the duration of the batch.
  const componentMeta = new Map<number, {
    frameworkId: number;
    scoringModel: ScoringModel;
  }>();

  async function lookupComponent(componentId: number) {
    if (componentMeta.has(componentId)) return componentMeta.get(componentId)!;
    const r = (await query(
      `SELECT framework_id, scoring_model_id FROM assessment_components WHERE id = ? LIMIT 1`,
      [componentId],
    )) as Array<{ framework_id: number; scoring_model_id: number }>;
    if (!r.length) throw new Error(`Component #${componentId} not found`);
    // Verify framework belongs to this school.
    const fw = await getFramework(Number(r[0].framework_id), schoolId);
    if (!fw) throw new Error(`Framework for component #${componentId} not accessible to this school`);
    const scoring = await getScoringModel(Number(r[0].scoring_model_id), schoolId);
    if (!scoring) throw new Error(`Scoring model for component #${componentId} not found`);
    const meta = { frameworkId: Number(r[0].framework_id), scoringModel: scoring };
    componentMeta.set(componentId, meta);
    return meta;
  }

  const skipped: SaveResult['skipped'] = [];
  let written = 0;

  for (const cell of cells) {
    let meta;
    try { meta = await lookupComponent(cell.componentId); }
    catch (e) { skipped.push({ cell, reason: (e as Error).message }); continue; }

    const v = validateCellAgainstModel(meta.scoringModel, cell);
    if (v.ok === false) { skipped.push({ cell, reason: v.reason }); continue; }

    const cleared = (cell.score == null || cell.score === undefined) &&
                    (!cell.valueText || cell.valueText.trim() === '');
    if (cleared) {
      await query(
        `DELETE FROM student_component_results
          WHERE student_id = ? AND class_id = ? AND subject_id = ?
            AND term_id = ? AND component_id = ?`,
        [cell.studentId, cell.classId, cell.subjectId, cell.termId, cell.componentId],
      );
      written++;
      continue;
    }

    const gradeCode = resolveGradeCode(meta.scoringModel, cell.score ?? null, cell.valueText ?? null);
    await query(
      `INSERT INTO student_component_results
         (school_id, student_id, class_id, subject_id, term_id,
          framework_id, component_id, score, value_text, grade_code,
          remarks, entered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         score      = VALUES(score),
         value_text = VALUES(value_text),
         grade_code = VALUES(grade_code),
         remarks    = VALUES(remarks),
         entered_by = VALUES(entered_by)`,
      [
        schoolId, cell.studentId, cell.classId, cell.subjectId, cell.termId,
        meta.frameworkId, cell.componentId,
        cell.score ?? null, cell.valueText ?? null, gradeCode,
        cell.remarks ?? null, enteredBy,
      ],
    );
    written++;
  }

  return { written, skipped };
}

/**
 * For the entry UI: return the framework + component metadata + each
 * student's existing entries for one (class, subject, term).
 */
export async function loadEntryGrid(args: {
  schoolId:  number;
  classId:   number;
  subjectId: number;
  termId:    number;
}) {
  const { schoolId, classId, subjectId, termId } = args;

  // Framework — uses the existing resolver chain.
  const { resolveFrameworkForClass } = await import('./resolver');
  const frameworkId = await resolveFrameworkForClass({
    schoolId, classId, termId, subjectId,
  });
  if (!frameworkId) return { framework: null, students: [], values: {} };
  const framework = await getFramework(frameworkId, schoolId);

  // Students enrolled in the class (matches DRAIS conventions).
  const students = (await query(
    `SELECT s.id, s.first_name, s.last_name, s.admission_no, p.photo_url
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN people p ON p.id = s.person_id
      WHERE e.class_id = ? AND s.school_id = ?
      ORDER BY s.last_name, s.first_name`,
    [classId, schoolId],
  )) as Array<{
    id: number; first_name: string; last_name: string;
    admission_no: string | null; photo_url: string | null;
  }>;

  // Existing values for this (class, subject, term) — keyed by
  // `${student_id}:${component_id}` for fast grid lookup.
  const values = (await query(
    `SELECT student_id, component_id, score, value_text, grade_code, remarks
       FROM student_component_results
      WHERE school_id = ? AND class_id = ? AND subject_id = ? AND term_id = ?`,
    [schoolId, classId, subjectId, termId],
  )) as Array<{
    student_id: number; component_id: number;
    score: string | number | null;
    value_text: string | null;
    grade_code: string | null;
    remarks: string | null;
  }>;
  const valueMap: Record<string, { score: number | null; valueText: string | null; gradeCode: string | null; remarks: string | null }> = {};
  for (const v of values) {
    valueMap[`${v.student_id}:${v.component_id}`] = {
      score:     v.score == null ? null : (typeof v.score === 'number' ? v.score : parseFloat(String(v.score))),
      valueText: v.value_text,
      gradeCode: v.grade_code,
      remarks:   v.remarks,
    };
  }

  return {
    framework,
    students: students.map(s => ({
      id: Number(s.id),
      fullName: `${s.first_name} ${s.last_name}`.trim() || `Student #${s.id}`,
      admissionNo: s.admission_no,
      photoUrl: s.photo_url,
    })),
    values: valueMap,
  };
}
