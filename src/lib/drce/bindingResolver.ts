// ============================================================================
// src/lib/drce/bindingResolver.ts
// Resolves dot-path binding strings against a DRCEDataContext at render time.
// e.g. "result.grade" → context.result.grade
//      "student.className" → context.student.className
//      "meta.term" → context.meta.term
// ============================================================================

import type { DRCEDataContext } from './schema';

/**
 * Resolve a binding string against the data context.
 * Returns the string representation of the value, or '' if not found.
 * Pass a result row object as `row` to resolve "result.*" bindings.
 */
export function resolveBinding(
  binding: string,
  context: DRCEDataContext,
  row?: Record<string, unknown>,
): string {
  // Merge result row as "result" scope if provided
  const root: Record<string, unknown> = {
    student:    context.student,
    subjects:   context.subjects,
    assessment: context.assessment,
    comments:   context.comments,
    meta:       context.meta,
    ...(row ? { result: row } : {}),
  };

  if (!binding || typeof binding !== 'string') return '';
  const parts = binding.split('.');
  let current: unknown = root;

  for (const part of parts) {
    if (current === null || current === undefined) return '';
    if (typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[part];
  }

  if (current === null || current === undefined) return '';
  return String(current);
}

/**
 * Get a nested value from an object using a dot-path string.
 * Returns undefined if the path does not exist.
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path || typeof path !== 'string') return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a nested value in an object using a dot-path string.
 * Returns a new object (immutable update).
 */
export function setByPath<T>(obj: T, path: string, value: unknown): T {
  // Guard: a missing/non-string path must never crash the editor (previously
  // `undefined.split('.')` threw and blocked the whole DRCE UI).
  if (!path || typeof path !== 'string') return obj;
  const parts = path.split('.');
  if (parts.length === 0) return obj;

  const result = { ...(obj as Record<string, unknown>) };
  let current = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    current[part] = { ...(current[part] as Record<string, unknown> ?? {}) };
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return result as T;
}

/**
 * All available binding paths, grouped by category.
 * Used by the column editor's "available bindings" picker.
 */
export const AVAILABLE_BINDINGS: Array<{ group: string; binding: string; label: string }> = [
  // Result row bindings (used in results_table columns)
  { group: 'Subject Result', binding: 'result.subjectName',   label: 'Subject Name' },
  { group: 'Subject Result', binding: 'result.midTermScore',  label: 'Mid-Term Score' },
  { group: 'Subject Result', binding: 'result.endTermScore',  label: 'End-Term Score' },
  { group: 'Subject Result', binding: 'result.total',         label: 'Obtained Score' },
  { group: 'Subject Result', binding: 'result.subject.totalMarks', label: 'Subject Total Marks' },
  { group: 'Subject Result', binding: 'result.grade',         label: 'Grade' },
  { group: 'Subject Result', binding: 'result.comment',       label: 'Comment' },
  { group: 'Subject Result', binding: 'result.initials',      label: 'Teacher Initials (editable fallback)' },
  { group: 'Subject Result', binding: 'result.teacherName',   label: 'Teacher Name' },
  { group: 'Subject Result', binding: 'result.primaryTeacher', label: 'Primary Teacher' },
  { group: 'Subject Result', binding: 'result.teachers',      label: 'All Teachers' },
  { group: 'Subject Result', binding: 'result.department',    label: 'Department' },
  { group: 'Subject Result', binding: 'result.subjectGroup',  label: 'Subject Group' },
  { group: 'Subject Result', binding: 'result.subjectComment', label: 'Subject Comment' },
  { group: 'Subject Result', binding: 'result.competencyLevel', label: 'Competency Level (CAFE)' },
  // Student bindings
  { group: 'Student',        binding: 'student.fullName',     label: 'Full Name' },
  { group: 'Student',        binding: 'student.fullNameAr',   label: 'Full Name (Arabic)' },
  { group: 'Student',        binding: 'student.fullNameEn',   label: 'Full Name (English)' },
  { group: 'Student',        binding: 'student.firstName',    label: 'First Name' },
  { group: 'Student',        binding: 'student.lastName',     label: 'Last Name' },
  { group: 'Student',        binding: 'student.gender',       label: 'Gender / Sex' },
  { group: 'Student',        binding: 'student.className',    label: 'Class Name' },
  { group: 'Student',        binding: 'student.classNameAr',  label: 'Class Name (Arabic)' },
  { group: 'Student',        binding: 'student.streamName',   label: 'Stream Name' },
  { group: 'Student',        binding: 'student.admissionNo',  label: 'Admission Number' },
  { group: 'Student',        binding: 'student.photoUrl',     label: 'Student Photo (URL)' },
  // Assessment bindings
  { group: 'Assessment',     binding: 'assessment.classPosition',  label: 'Class Position' },
  { group: 'Assessment',     binding: 'assessment.streamPosition', label: 'Stream Position' },
  { group: 'Assessment',     binding: 'assessment.position',       label: 'Position (e.g. 3 / 45)' },
  { group: 'Assessment',     binding: 'assessment.aggregates',     label: 'Aggregates' },
  { group: 'Assessment',     binding: 'assessment.division',       label: 'Division' },
  { group: 'Assessment',     binding: 'assessment.totalStudents',  label: 'Total Students in Class' },
  // Comments bindings
  { group: 'Comments',       binding: 'comments.classTeacher', label: 'Class Teacher Comment' },
  { group: 'Comments',       binding: 'comments.dos',          label: 'DOS Comment' },
  { group: 'Comments',       binding: 'comments.headTeacher',  label: 'Headteacher Comment' },
  // Meta bindings
  { group: 'Report Meta',    binding: 'meta.term',             label: 'Term' },
  { group: 'Report Meta',    binding: 'meta.year',             label: 'Academic Year' },
  { group: 'Report Meta',    binding: 'meta.nextTermBegins',   label: 'Next Term Begins' },
  { group: 'Report Meta',    binding: 'meta.reportTitle',      label: 'Report Title' },
  { group: 'Report Meta',    binding: 'meta.schoolName',       label: 'School Name' },
  { group: 'Report Meta',    binding: 'meta.arabicName',       label: 'School Name (Arabic)' },
  { group: 'Report Meta',    binding: 'meta.schoolAddress',    label: 'School Address' },
  { group: 'Report Meta',    binding: 'meta.arabicAddress',    label: 'School Address (Arabic)' },
  { group: 'Report Meta',    binding: 'meta.logoUrl',          label: 'School Logo (URL)' },
  { group: 'Report Meta',    binding: 'meta.schoolContact',    label: 'School Contact' },
  { group: 'Report Meta',    binding: 'meta.schoolEmail',      label: 'School Email' },
  { group: 'Report Meta',    binding: 'meta.centerNo',         label: 'UNEB Center Number' },
  { group: 'Report Meta',    binding: 'meta.registrationNo',   label: 'Registration Number' },
];
