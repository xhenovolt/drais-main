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

  // Pull tenant branding from the frozen snapshot meta, with safe fallbacks
  // for v1 snapshots that predate the `branding` block.
  const b = snapshot.meta.branding;
  const brand = {
    schoolName:           b?.schoolName           ?? snapshot.meta.schoolName ?? '',
    legalName:            b?.legalName            ?? '',
    motto:                b?.motto                ?? '',
    address:              b?.address              ?? '',
    poBox:                b?.poBox                ?? '',
    district:             b?.district             ?? '',
    region:               b?.region               ?? '',
    country:              b?.country              ?? '',
    phone:                b?.phone                ?? '',
    email:                b?.email                ?? '',
    website:              b?.website              ?? '',
    principalName:        b?.principalName        ?? '',
    principalPhone:       b?.principalPhone       ?? '',
    registrationNumber:   b?.registrationNumber   ?? '',
    centerNo:             b?.centerNo             ?? '',
    logoUrl:              b?.logoUrl              ?? '',
    arabicName:           b?.arabicName           ?? '',
    arabicAddress:        b?.arabicAddress        ?? '',
    arabicMotto:          b?.arabicMotto          ?? '',
    arabicPhone:          b?.arabicPhone          ?? '',
    arabicCenterNo:       b?.arabicCenterNo       ?? '',
    arabicRegistrationNo: b?.arabicRegistrationNo ?? '',
    arabicPoBox:          b?.arabicPoBox          ?? '',
  };

  const placeholders: Record<string, string> = {
    student_no:               escapeHtml(stu.id || ''),
    student_name:             escapeHtml(stu.name || ''),
    gender:                   escapeHtml(stu.gender || 'N/A'),
    class_name:               escapeHtml(cls.className || ''),
    stream_name:              escapeHtml(cls.stream || ''),
    school_name:              escapeHtml(brand.schoolName),
    school_legal_name:        escapeHtml(brand.legalName || brand.schoolName),
    school_motto:             escapeHtml(brand.motto),
    school_address:           escapeHtml(brand.address),
    school_po_box:            escapeHtml(brand.poBox),
    school_district:          escapeHtml(brand.district),
    school_region:            escapeHtml(brand.region),
    school_country:           escapeHtml(brand.country),
    school_phone:             escapeHtml(brand.phone),
    school_email:             escapeHtml(brand.email),
    school_website:           escapeHtml(brand.website),
    school_principal:         escapeHtml(brand.principalName),
    school_principal_phone:   escapeHtml(brand.principalPhone),
    school_registration_no:   escapeHtml(brand.registrationNumber),
    school_center_no:         escapeHtml(brand.centerNo),
    school_logo_url:          escapeHtml(brand.logoUrl || '/placeholder-logo.png'),
    // Arabic mirrors fall back to the primary fields when unset so theology
    // reports still render at schools that have not filled in Arabic
    // metadata yet.
    school_name_ar:           escapeHtml(brand.arabicName    || brand.schoolName),
    school_address_ar:        escapeHtml(brand.arabicAddress || brand.address),
    school_motto_ar:          escapeHtml(brand.arabicMotto   || brand.motto),
    school_phone_ar:          escapeHtml(brand.arabicPhone   || brand.phone),
    school_center_no_ar:      escapeHtml(brand.arabicCenterNo|| brand.centerNo),
    school_registration_no_ar:escapeHtml(brand.arabicRegistrationNo || brand.registrationNumber),
    school_po_box_ar:         escapeHtml(brand.arabicPoBox   || brand.poBox),
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
