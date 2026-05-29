/**
 * CAFE — class × framework × term assignment resolver.
 *
 * Phase 1 surface: list/assign frameworks to (class, term, [subject]).
 * Phase 2 will read these assignments in the snapshot pipeline to drive
 * multi-component result rollup; for now this is plain CRUD.
 */
import { query } from '@/lib/db';
import type { ClassFrameworkAssignment } from './types';
import { getFramework } from './frameworks';

interface Row {
  id: number; school_id: number; class_id: number; framework_id: number;
  term_id: number; subject_id: number | null;
  created_at: string; created_by: number | null;
}
function rowToAssignment(r: Row): ClassFrameworkAssignment {
  return {
    id:          Number(r.id),
    schoolId:    Number(r.school_id),
    classId:     Number(r.class_id),
    frameworkId: Number(r.framework_id),
    termId:      Number(r.term_id),
    subjectId:   r.subject_id == null ? null : Number(r.subject_id),
    createdAt:   r.created_at,
    createdBy:   r.created_by,
  };
}

export async function listAssignments(args: {
  schoolId: number; classId?: number; termId?: number;
}): Promise<ClassFrameworkAssignment[]> {
  const { schoolId, classId, termId } = args;
  const where = ['school_id = ?']; const params: unknown[] = [schoolId];
  if (classId) { where.push('class_id = ?'); params.push(classId); }
  if (termId)  { where.push('term_id = ?');  params.push(termId); }
  const rows = (await query(
    `SELECT * FROM class_assessment_framework
      WHERE ${where.join(' AND ')}
      ORDER BY class_id, term_id, subject_id IS NULL DESC`,
    params,
  )) as Row[];
  return rows.map(rowToAssignment);
}

export async function assignFrameworkToClass(args: {
  schoolId:    number;
  classId:     number;
  frameworkId: number;
  termId:      number;
  subjectId?:  number | null;
  createdBy:   number | null;
}): Promise<number> {
  const { schoolId, classId, frameworkId, termId, subjectId = null, createdBy } = args;

  // Verify framework belongs to this school.
  const f = await getFramework(frameworkId, schoolId);
  if (!f) throw new Error('Framework not visible to this school');

  // INSERT … ON DUPLICATE KEY UPDATE so re-assigning the same (class, term,
  // subject) silently replaces the previous framework_id. UNIQUE key
  // (class_id, term_id, subject_id) makes this safe.
  const r = (await query(
    `INSERT INTO class_assessment_framework
       (school_id, class_id, framework_id, term_id, subject_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       framework_id = VALUES(framework_id),
       created_by   = VALUES(created_by)`,
    [schoolId, classId, frameworkId, termId, subjectId, createdBy],
  )) as { insertId?: number };
  return Number(r.insertId);
}

export async function unassignFramework(args: {
  schoolId: number; classId: number; termId: number; subjectId?: number | null;
}): Promise<boolean> {
  const { schoolId, classId, termId, subjectId = null } = args;
  const where = subjectId == null
    ? 'subject_id IS NULL'
    : 'subject_id = ?';
  const params: unknown[] = subjectId == null
    ? [schoolId, classId, termId]
    : [schoolId, classId, termId, subjectId];
  const r = (await query(
    `DELETE FROM class_assessment_framework
      WHERE school_id = ? AND class_id = ? AND term_id = ? AND ${where}`,
    params,
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

/**
 * Resolve the effective framework for a (class, subject, term) tuple.
 * Priority: subject-specific override > class-level assignment > school default.
 *
 * Returns null if no framework is assigned anywhere up the chain. Phase 2's
 * snapshot adapter will use this; Phase 1 ships the lookup as part of the API.
 */
export async function resolveFrameworkForClass(args: {
  schoolId: number; classId: number; termId: number; subjectId?: number | null;
}): Promise<number | null> {
  const { schoolId, classId, termId, subjectId } = args;

  // Subject-specific override.
  if (subjectId != null) {
    const subjectRow = (await query(
      `SELECT framework_id FROM class_assessment_framework
        WHERE school_id = ? AND class_id = ? AND term_id = ? AND subject_id = ?
        LIMIT 1`,
      [schoolId, classId, termId, subjectId],
    )) as Array<{ framework_id: number }>;
    if (subjectRow.length) return Number(subjectRow[0].framework_id);
  }

  // Class-level default (subject_id IS NULL).
  const classRow = (await query(
    `SELECT framework_id FROM class_assessment_framework
      WHERE school_id = ? AND class_id = ? AND term_id = ? AND subject_id IS NULL
      LIMIT 1`,
    [schoolId, classId, termId],
  )) as Array<{ framework_id: number }>;
  if (classRow.length) return Number(classRow[0].framework_id);

  // School default (from school_academic_settings).
  const settingsRow = (await query(
    `SELECT default_framework_id FROM school_academic_settings WHERE school_id = ? LIMIT 1`,
    [schoolId],
  )) as Array<{ default_framework_id: number | null }>;
  if (settingsRow.length && settingsRow[0].default_framework_id != null) {
    return Number(settingsRow[0].default_framework_id);
  }
  return null;
}
