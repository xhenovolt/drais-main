/**
 * CAFE Phase 5 — student-level generic skills + project portfolio service.
 *
 * Pure SQL wrappers. Visibility scoped to the caller's school.
 * Bulk-load helpers feed the snapshot adapter so DRCE bindings
 * student.genericSkills and student.projects populate at render time.
 */
import { query } from '@/lib/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GenericSkillEntry {
  id:               number;
  schoolId:         number;
  studentId:        number;
  termId:           number;
  code:             string;
  label:            string;
  scoringModelId:   number | null;
  score:            number | null;
  valueText:        string | null;
  gradeCode:        string | null;
  remarks:          string | null;
  enteredAt:        string;
}

export interface ProjectEntry {
  id:               number;
  schoolId:         number;
  studentId:        number;
  termId:           number;
  title:            string;
  descriptor:       string | null;
  outcome:          string | null;
  evidenceUrl:      string | null;
  scoringModelId:   number | null;
  gradeCode:        string | null;
  remarks:          string | null;
  enteredAt:        string;
}

// ─── Row mappers ───────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v == null) return null;
  return typeof v === 'number' ? v : parseFloat(String(v));
}

interface GsRow {
  id: number; school_id: number; student_id: number; term_id: number;
  skill_code: string; skill_label: string;
  scoring_model_id: number | null;
  score: string | number | null; value_text: string | null;
  grade_code: string | null; remarks: string | null; entered_at: string;
}
function rowToSkill(r: GsRow): GenericSkillEntry {
  return {
    id:             Number(r.id),
    schoolId:       Number(r.school_id),
    studentId:      Number(r.student_id),
    termId:         Number(r.term_id),
    code:           r.skill_code,
    label:          r.skill_label,
    scoringModelId: r.scoring_model_id == null ? null : Number(r.scoring_model_id),
    score:          num(r.score),
    valueText:      r.value_text,
    gradeCode:      r.grade_code,
    remarks:        r.remarks,
    enteredAt:      r.entered_at,
  };
}

interface PRow {
  id: number; school_id: number; student_id: number; term_id: number;
  title: string; descriptor: string | null; outcome: string | null;
  evidence_url: string | null;
  scoring_model_id: number | null; grade_code: string | null;
  remarks: string | null; entered_at: string;
}
function rowToProject(r: PRow): ProjectEntry {
  return {
    id:             Number(r.id),
    schoolId:       Number(r.school_id),
    studentId:      Number(r.student_id),
    termId:         Number(r.term_id),
    title:          r.title,
    descriptor:     r.descriptor,
    outcome:        r.outcome,
    evidenceUrl:    r.evidence_url,
    scoringModelId: r.scoring_model_id == null ? null : Number(r.scoring_model_id),
    gradeCode:      r.grade_code,
    remarks:        r.remarks,
    enteredAt:      r.entered_at,
  };
}

// ─── Generic skills CRUD ────────────────────────────────────────────────────

export async function listSkillsForStudent(args: {
  schoolId: number; studentId: number; termId: number;
}): Promise<GenericSkillEntry[]> {
  const rows = (await query(
    `SELECT * FROM student_generic_skills
      WHERE school_id = ? AND student_id = ? AND term_id = ?
      ORDER BY skill_label ASC`,
    [args.schoolId, args.studentId, args.termId],
  )) as GsRow[];
  return rows.map(rowToSkill);
}

export interface SkillInput {
  studentId:        number;
  termId:           number;
  code:             string;
  label:            string;
  scoringModelId?:  number | null;
  score?:           number | null;
  valueText?:       string | null;
  gradeCode?:       string | null;
  remarks?:         string | null;
}

export async function upsertSkill(args: {
  schoolId: number; enteredBy: number | null; input: SkillInput;
}): Promise<number> {
  const { schoolId, enteredBy, input } = args;
  const code = input.code.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 64);
  if (!code) throw new Error('skill code required');
  if (!input.label?.trim()) throw new Error('skill label required');
  const r = (await query(
    `INSERT INTO student_generic_skills
       (school_id, student_id, term_id, skill_code, skill_label,
        scoring_model_id, score, value_text, grade_code, remarks, entered_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       skill_label      = VALUES(skill_label),
       scoring_model_id = VALUES(scoring_model_id),
       score            = VALUES(score),
       value_text       = VALUES(value_text),
       grade_code       = VALUES(grade_code),
       remarks          = VALUES(remarks),
       entered_by       = VALUES(entered_by)`,
    [
      schoolId, input.studentId, input.termId, code, input.label.trim(),
      input.scoringModelId ?? null, input.score ?? null, input.valueText ?? null,
      input.gradeCode ?? null, input.remarks ?? null, enteredBy,
    ],
  )) as { insertId?: number };
  return Number(r.insertId);
}

export async function deleteSkill(args: {
  schoolId: number; studentId: number; termId: number; code: string;
}): Promise<boolean> {
  const r = (await query(
    `DELETE FROM student_generic_skills
      WHERE school_id = ? AND student_id = ? AND term_id = ? AND skill_code = ?`,
    [args.schoolId, args.studentId, args.termId, args.code],
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

// ─── Projects CRUD ─────────────────────────────────────────────────────────

export async function listProjectsForStudent(args: {
  schoolId: number; studentId: number; termId: number;
}): Promise<ProjectEntry[]> {
  const rows = (await query(
    `SELECT * FROM student_projects
      WHERE school_id = ? AND student_id = ? AND term_id = ?
      ORDER BY entered_at DESC`,
    [args.schoolId, args.studentId, args.termId],
  )) as PRow[];
  return rows.map(rowToProject);
}

export interface ProjectInput {
  studentId:        number;
  termId:           number;
  title:            string;
  descriptor?:      string | null;
  outcome?:         string | null;
  evidenceUrl?:     string | null;
  scoringModelId?:  number | null;
  gradeCode?:       string | null;
  remarks?:         string | null;
}

export async function createProject(args: {
  schoolId: number; enteredBy: number | null; input: ProjectInput;
}): Promise<number> {
  const { schoolId, enteredBy, input } = args;
  if (!input.title?.trim()) throw new Error('title required');
  const r = (await query(
    `INSERT INTO student_projects
       (school_id, student_id, term_id, title, descriptor, outcome,
        evidence_url, scoring_model_id, grade_code, remarks, entered_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      schoolId, input.studentId, input.termId, input.title.trim(),
      input.descriptor?.trim() || null, input.outcome?.trim() || null,
      input.evidenceUrl?.trim() || null, input.scoringModelId ?? null,
      input.gradeCode ?? null, input.remarks?.trim() || null, enteredBy,
    ],
  )) as { insertId?: number };
  return Number(r.insertId);
}

export async function updateProject(args: {
  schoolId: number; id: number; input: Partial<ProjectInput>;
}): Promise<boolean> {
  const { schoolId, id, input } = args;
  const sets: string[] = []; const params: unknown[] = [];
  if (input.title       !== undefined) { sets.push('title = ?');           params.push(input.title.trim()); }
  if (input.descriptor  !== undefined) { sets.push('descriptor = ?');      params.push(input.descriptor?.trim() || null); }
  if (input.outcome     !== undefined) { sets.push('outcome = ?');         params.push(input.outcome?.trim() || null); }
  if (input.evidenceUrl !== undefined) { sets.push('evidence_url = ?');    params.push(input.evidenceUrl?.trim() || null); }
  if (input.gradeCode   !== undefined) { sets.push('grade_code = ?');      params.push(input.gradeCode); }
  if (input.scoringModelId !== undefined) { sets.push('scoring_model_id = ?'); params.push(input.scoringModelId); }
  if (input.remarks     !== undefined) { sets.push('remarks = ?');         params.push(input.remarks?.trim() || null); }
  if (!sets.length) return true;
  params.push(id, schoolId);
  const r = (await query(
    `UPDATE student_projects SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`,
    params,
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

export async function deleteProject(schoolId: number, id: number): Promise<boolean> {
  const r = (await query(
    `DELETE FROM student_projects WHERE id = ? AND school_id = ?`,
    [id, schoolId],
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

// ─── Bulk read for snapshot adapter ────────────────────────────────────────

/** Load every skill row for a (school, term) keyed by student id. */
export async function loadSkillsBulk(args: {
  schoolId: number; termId: number; studentIds: readonly number[];
}): Promise<Map<number, GenericSkillEntry[]>> {
  const { schoolId, termId, studentIds } = args;
  const out = new Map<number, GenericSkillEntry[]>();
  if (!studentIds.length) return out;
  const placeholders = studentIds.map(() => '?').join(',');
  const rows = (await query(
    `SELECT * FROM student_generic_skills
      WHERE school_id = ? AND term_id = ? AND student_id IN (${placeholders})
      ORDER BY skill_label ASC`,
    [schoolId, termId, ...studentIds],
  )) as GsRow[];
  for (const r of rows) {
    const entry = rowToSkill(r);
    const arr = out.get(entry.studentId);
    if (arr) arr.push(entry); else out.set(entry.studentId, [entry]);
  }
  return out;
}

/** Load every project row for a (school, term) keyed by student id. */
export async function loadProjectsBulk(args: {
  schoolId: number; termId: number; studentIds: readonly number[];
}): Promise<Map<number, ProjectEntry[]>> {
  const { schoolId, termId, studentIds } = args;
  const out = new Map<number, ProjectEntry[]>();
  if (!studentIds.length) return out;
  const placeholders = studentIds.map(() => '?').join(',');
  const rows = (await query(
    `SELECT * FROM student_projects
      WHERE school_id = ? AND term_id = ? AND student_id IN (${placeholders})
      ORDER BY entered_at DESC`,
    [schoolId, termId, ...studentIds],
  )) as PRow[];
  for (const r of rows) {
    const entry = rowToProject(r);
    const arr = out.get(entry.studentId);
    if (arr) arr.push(entry); else out.set(entry.studentId, [entry]);
  }
  return out;
}
