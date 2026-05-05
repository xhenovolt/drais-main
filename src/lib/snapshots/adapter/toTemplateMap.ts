/**
 * Snapshot -> emergency-template placeholder map.
 *
 * Pure function. Produces a flat string map and the `<tr>` rows for the
 * `{{#subjects}}…{{/subjects}}` block, mirroring the per-student loop in
 * src/app/academics/secular-emergency-reports/route.ts:109-167 and
 * src/app/academics/theology-emergency-reports/route.ts:139-198.
 *
 * Accepts a snapshot and indexes — caller is responsible for clamping.
 */
import type { ReportSnapshot } from '../types';
import { toArabicNumerals } from '../normalizers';

export interface TemplateRenderInput {
  snapshot:   ReportSnapshot;
  classIdx:   number;
  studentIdx: number;
}

export interface TemplateRenderOutput {
  /** Map of {{key}} -> string (no braces in keys). */
  placeholders: Record<string, string>;
  /** Pre-rendered <tr>…</tr> rows replacing {{#subjects}}…{{/subjects}}. */
  subjectsHtml: string;
}

const escapeHtml = (s: string): string =>
  String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch] as string);

export function snapshotToTemplateMap(input: TemplateRenderInput): TemplateRenderOutput {
  const { snapshot, classIdx, studentIdx } = input;
  const cls = snapshot.classes[classIdx];
  if (!cls) throw new Error(`Class index ${classIdx} out of range`);
  const stu = cls.students[studentIdx];
  if (!stu) throw new Error(`Student index ${studentIdx} out of range`);

  const isArabic = snapshot.meta.numerals === 'arabic';

  // Subjects table rows
  let subjectsHtml = '';
  for (const r of stu.results) {
    const score = r.displayScore || '—';
    const grade = r.grade || '';
    const initials = r.initials || (isArabic ? 'ب.ج.م' : 'BJM');
    subjectsHtml +=
      `<tr>` +
      `<td>${escapeHtml(r.displaySubject)}</td>` +
      `<td>${escapeHtml(score)}</td>` +
      `<td>${escapeHtml(score)}</td>` +
      `<td style="color:blue">${escapeHtml(grade)}</td>` +
      `<td class="comment-cell">${escapeHtml(r.remarks || '')}</td>` +
      `<td class="initials">${escapeHtml(initials)}</td>` +
      `</tr>`;
  }

  const aggregates = isArabic
    ? toArabicNumerals(Math.round(stu.total).toString())
    : Math.round(stu.total).toString();
  const division   = isArabic ? toArabicNumerals('1') : '1';

  const placeholders: Record<string, string> = {
    student_no:               escapeHtml(stu.id || ''),
    student_name:             escapeHtml(stu.name || ''),
    gender:                   escapeHtml(stu.gender || 'N/A'),
    class_name:               escapeHtml(cls.className || ''),
    stream_name:              escapeHtml(cls.stream || ''),
    school_name:              escapeHtml(snapshot.meta.schoolName || ''),
    term_name:                escapeHtml(snapshot.meta.termName || ''),
    year_name:                escapeHtml(snapshot.meta.yearName || ''),
    result_type:              escapeHtml(snapshot.meta.resultTypeName || ''),
    total_marks:              escapeHtml(stu.displayTotal || '0'),
    average_marks:            escapeHtml(stu.displayAverage || '0'),
    class_position:           escapeHtml(isArabic
      ? toArabicNumerals(stu.position || 0)
      : String(stu.position || '')),
    class_total:              escapeHtml(isArabic
      ? toArabicNumerals(stu.totalInClass || 0)
      : String(stu.totalInClass || '')),
    stream_position:          escapeHtml(isArabic
      ? toArabicNumerals(stu.position || 0)
      : String(stu.position || '')),
    stream_total:              escapeHtml(isArabic
      ? toArabicNumerals(stu.totalInClass || 0)
      : String(stu.totalInClass || '')),
    aggregates,
    division,
    class_teacher_comment:    escapeHtml(stu.comments?.classTeacher || ''),
    dos_comment:              escapeHtml(stu.comments?.dos || ''),
    headteacher_comment:      escapeHtml(stu.comments?.headTeacher || ''),
    next_term_date:           escapeHtml(snapshot.config.nextTermBegins || ''),
    photo_url:                escapeHtml(stu.photoUrl || '/placeholder-student.png'),
    admission_number:         escapeHtml(stu.admissionNumber || ''),
  };

  return { placeholders, subjectsHtml };
}
