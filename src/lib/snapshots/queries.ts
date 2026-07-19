/**
 * Single-purpose SQL queries for snapshot generation.
 *
 * Each query is school-scoped and parameterized. The generator runs these
 * once at snapshot time; rendering paths never call them.
 *
 * Joins mirror src/app/api/reports/list/route.ts so the snapshot is at
 * parity with what the legacy page produces, but pre-grouped and pre-sorted
 * so generation is deterministic.
 */
import { query } from '@/lib/db';
import { isReligiousEducationSubject } from '@/lib/theology-subject-classifier';
import type { SnapshotType } from './types';

export interface ClassRow {
  classId:   number;
  className: string;
}

export interface SchoolRow {
  schoolId:             number;
  schoolName:           string;
  legalName:            string;
  shortCode:            string;
  motto:                string;
  address:              string;
  poBox:                string;
  district:             string;
  region:               string;
  country:              string;
  phone:                string;
  email:                string;
  website:              string;
  principalName:        string;
  principalPhone:       string;
  registrationNumber:   string;
  centerNo:             string;
  logoUrl:              string;
  schoolType:           string;
  arabicName:           string;
  arabicAddress:        string;
  arabicMotto:          string;
  arabicPhone:          string;
  arabicCenterNo:       string;
  arabicRegistrationNo: string;
  arabicPoBox:          string;
}

export interface TermRow {
  termId:     number;
  termName:   string;
  yearId:     number;
  yearName:   string;
}

export interface ResultTypeRow {
  resultTypeId:   number;
  resultTypeName: string;
}

export interface RawResultRow {
  result_id:        number;
  student_id:       number;
  class_id:         number;
  class_name:       string;
  class_name_ar:    string | null;
  subject_id:       number;
  subject_name:     string;
  subject_name_ar:  string | null;
  subject_type:     string | null;
  academic_type:    string | null;
  score:            string | number | null;
  remarks:          string | null;
  teacher_initials: string | null;
  teacher_name:     string | null;
  teachers_all:     string | null;
  department_name:  string | null;
  subject_group_name: string | null;
  created_at:       string | null;

  admission_no:     string | null;
  first_name:       string | null;
  last_name:        string | null;
  other_name:       string | null;
  first_name_ar:    string | null;
  last_name_ar:     string | null;
  other_name_ar:    string | null;
  full_name_ar:     string | null;
  gender:           string | null;
  photo_url:        string | null;
  stream_name:      string | null;
  stream_name_ar:   string | null;
}

/**
 * Fetch the full school branding row. The snapshot generator freezes every
 * field into `meta.branding`, so once a snapshot exists nothing in the
 * `schools` table can leak into its rendered output.
 */
export async function fetchSchool(schoolId: number): Promise<SchoolRow | null> {
  const rows = (await query(
    `SELECT id, name, legal_name, short_code, motto, address, po_box,
            district, region, country, phone, email, website,
            principal_name, principal_phone, registration_number,
            center_no, logo_url, school_type,
            arabic_name, arabic_address, arabic_motto, arabic_phone,
            arabic_center_no, arabic_registration_no, arabic_po_box
       FROM schools
      WHERE id = ?
      LIMIT 1`,
    [schoolId],
  )) as Array<Record<string, string | number | null>>;
  if (!rows.length) return null;
  const r = rows[0];
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    schoolId:             Number(r.id),
    schoolName:           s(r.name),
    legalName:            s(r.legal_name),
    shortCode:            s(r.short_code),
    motto:                s(r.motto),
    address:              s(r.address),
    poBox:                s(r.po_box),
    district:             s(r.district),
    region:               s(r.region),
    country:              s(r.country),
    phone:                s(r.phone),
    email:                s(r.email),
    website:              s(r.website),
    principalName:        s(r.principal_name),
    principalPhone:       s(r.principal_phone),
    registrationNumber:   s(r.registration_number),
    centerNo:             s(r.center_no),
    logoUrl:              s(r.logo_url),
    schoolType:           s(r.school_type),
    arabicName:           s(r.arabic_name),
    arabicAddress:        s(r.arabic_address),
    arabicMotto:          s(r.arabic_motto),
    arabicPhone:          s(r.arabic_phone),
    arabicCenterNo:       s(r.arabic_center_no),
    arabicRegistrationNo: s(r.arabic_registration_no),
    arabicPoBox:          s(r.arabic_po_box),
  };
}

/** Fetch term + year metadata. */
export async function fetchTerm(termId: number): Promise<TermRow | null> {
  const rows = (await query(
    `SELECT t.id AS term_id, t.name AS term_name,
            ay.id AS year_id, ay.name AS year_name
       FROM terms t
       LEFT JOIN academic_years ay ON ay.id = t.academic_year_id
      WHERE t.id = ?
      LIMIT 1`,
    [termId],
  )) as Array<{ term_id: number; term_name: string; year_id: number | null; year_name: string | null }>;
  if (!rows.length) return null;
  return {
    termId:   rows[0].term_id,
    termName: rows[0].term_name,
    yearId:   rows[0].year_id ?? 0,
    yearName: rows[0].year_name ?? '',
  };
}

export async function fetchResultType(resultTypeId: number): Promise<ResultTypeRow | null> {
  const rows = (await query(
    `SELECT id AS result_type_id, name AS result_type_name
       FROM result_types
      WHERE id = ?
      LIMIT 1`,
    [resultTypeId],
  )) as Array<{ result_type_id: number; result_type_name: string }>;
  if (!rows.length) return null;
  return { resultTypeId: rows[0].result_type_id, resultTypeName: rows[0].result_type_name };
}

/**
 * Pull every result row for the snapshot in a single query.
 * Returned rows are sorted deterministically by (class_id, student_id, subject_id).
 *
 * The `type` filter applies the same heuristic as
 * src/app/academics/reports/page.tsx:1310-1320 so secular/theology snapshots
 * mirror the legacy curriculum filter exactly.
 */
export async function fetchResultsForGeneration(args: {
  schoolId:     number;
  termId:       number;
  yearId:       number;
  resultTypeId: number | null;
  type:         SnapshotType;
  classIds?:    number[];
}): Promise<RawResultRow[]> {
  const { schoolId, termId, yearId, resultTypeId, type, classIds } = args;
  const where: string[] = ['s.school_id = ?', 'cr.term_id = ?'];
  const params: any[] = [schoolId, termId];

  if (resultTypeId !== null) {
    where.push('cr.result_type_id = ?');
    params.push(resultTypeId);
  }
  if (yearId) {
    where.push('(cr.academic_year_id = ? OR t.academic_year_id = ?)');
    params.push(yearId, yearId);
  }
  if (classIds && classIds.length) {
    const placeholders = classIds.map(() => '?').join(',');
    where.push(`cr.class_id IN (${placeholders})`);
    params.push(...classIds);
  }

  const rows = (await query(
    `SELECT
        cr.id              AS result_id,
        cr.student_id      AS student_id,
        cr.class_id        AS class_id,
        c.name             AS class_name,
        c.name_ar          AS class_name_ar,
        sub.id             AS subject_id,
        sub.name           AS subject_name,
        COALESCE(sub.name_ar, '') AS subject_name_ar,
        sub.subject_type   AS subject_type,
        sub.academic_type  AS academic_type,
        cr.score           AS score,
        cr.grade           AS grade,
        cr.remarks         AS remarks,
        cr.created_at      AS created_at,
        s.admission_no     AS admission_no,
        p.first_name       AS first_name,
        p.last_name        AS last_name,
        p.other_name       AS other_name,
        p.first_name_ar    AS first_name_ar,
        p.last_name_ar     AS last_name_ar,
        p.other_name_ar    AS other_name_ar,
        p.full_name_ar     AS full_name_ar,
        p.gender           AS gender,
        p.photo_url        AS photo_url,
        st.name            AS stream_name,
        st.name_ar         AS stream_name_ar,
        -- Phase D: time-filter allocation by term start_date so past
        -- snapshots pick the teacher who was allocated at that time.
        (
          SELECT CONCAT_WS(' ', tp.first_name, tp.last_name)
            FROM class_subjects cs2
            LEFT JOIN staff ts ON ts.id = cs2.teacher_id
            LEFT JOIN people tp ON tp.id = ts.person_id
           WHERE cs2.class_id  = cr.class_id
             AND cs2.subject_id = cr.subject_id
             AND (cs2.valid_from IS NULL OR cs2.valid_from <= COALESCE(t.start_date, CURDATE()))
             AND (cs2.valid_to   IS NULL OR cs2.valid_to   >  COALESCE(t.start_date, CURDATE()))
           ORDER BY cs2.valid_from DESC, cs2.id DESC LIMIT 1
        )                  AS teacher_name,
        (
          -- All report-visible teachers for this subject/class at the snapshot's
          -- term, primary first, joined by ' / ' (e.g. "A.N / S.K"). Deterministic
          -- ordering keeps re-generated snapshots byte-identical.
          SELECT GROUP_CONCAT(
                   COALESCE(
                     cs2.custom_initials,
                     NULLIF(CONCAT(COALESCE(LEFT(tp.first_name, 1), ''), COALESCE(LEFT(tp.last_name, 1), '')), '')
                   )
                   ORDER BY (cs2.allocation_role = 'primary_teacher') DESC, cs2.id ASC
                   SEPARATOR ' / '
                 )
            FROM class_subjects cs2
            LEFT JOIN staff ts ON ts.id = cs2.teacher_id
            LEFT JOIN people tp ON tp.id = ts.person_id
           WHERE cs2.class_id  = cr.class_id
             AND cs2.subject_id = cr.subject_id
             AND COALESCE(cs2.display_on_report, 1) = 1
             AND (cs2.status IS NULL OR cs2.status = 'active')
             AND (cs2.valid_from IS NULL OR cs2.valid_from <= COALESCE(t.start_date, CURDATE()))
             AND (cs2.valid_to   IS NULL OR cs2.valid_to   >  COALESCE(t.start_date, CURDATE()))
        )                  AS teacher_initials,
        (
          -- All report-visible teacher NAMES for this subject/class, primary
          -- first (e.g. "Aisha Noor / Sara Kato"). Same filters/ordering as the
          -- initials aggregate so the two stay consistent on the report card.
          SELECT GROUP_CONCAT(
                   NULLIF(CONCAT_WS(' ', tp.first_name, tp.last_name), '')
                   ORDER BY (cs2.allocation_role = 'primary_teacher') DESC, cs2.id ASC
                   SEPARATOR ' / '
                 )
            FROM class_subjects cs2
            LEFT JOIN staff ts ON ts.id = cs2.teacher_id
            LEFT JOIN people tp ON tp.id = ts.person_id
           WHERE cs2.class_id  = cr.class_id
             AND cs2.subject_id = cr.subject_id
             AND COALESCE(cs2.display_on_report, 1) = 1
             AND (cs2.status IS NULL OR cs2.status = 'active')
             AND (cs2.valid_from IS NULL OR cs2.valid_from <= COALESCE(t.start_date, CURDATE()))
             AND (cs2.valid_to   IS NULL OR cs2.valid_to   >  COALESCE(t.start_date, CURDATE()))
        )                  AS teachers_all,
        dep.name           AS department_name,
        sg.name            AS subject_group_name
       FROM class_results cr
       JOIN students s ON s.id = cr.student_id
       JOIN people   p ON p.id = s.person_id
       JOIN classes  c ON c.id = cr.class_id
       JOIN subjects sub ON sub.id = cr.subject_id
       LEFT JOIN departments    dep ON dep.id = sub.department_id
       LEFT JOIN subject_groups sg  ON sg.id  = sub.subject_group_id
       LEFT JOIN terms t ON t.id = cr.term_id
       LEFT JOIN enrollments e ON e.student_id = cr.student_id AND e.class_id = cr.class_id
       LEFT JOIN streams st ON st.id = e.stream_id
      WHERE ${where.join(' AND ')}
      ORDER BY cr.class_id ASC, cr.student_id ASC, cr.subject_id ASC, cr.id ASC`,
    params,
  )) as RawResultRow[];

  if (type === 'mixed') return rows;
  return rows.filter(r => matchesCurriculum(r, type));
}

/**
 * Curriculum heuristic mirroring the legacy filter at
 * src/app/academics/reports/page.tsx:1310-1320.
 *
 * UPDATED: Now primarily relies on explicit subject_type field.
 * Name-based detection is minimal to avoid false positives on secular
 * subjects with Islamic-sounding names (e.g., "Islamic Religious Education"
 * taught in secular contexts).
 */
export function matchesCurriculum(r: RawResultRow, type: SnapshotType): boolean {
  const at = (r.academic_type || '').toLowerCase();
  const st = (r.subject_type || '').toLowerCase();
  const name = (r.subject_name || '').toLowerCase();
  const isIRE = isReligiousEducationSubject(r.subject_name);

  // Prefer explicit academic_type for curriculum classification.
  const isAcademicTheology = at === 'theology';
  const isExplicitTheology = isAcademicTheology || st === 'theology' || st === 'tahfiz';

  // Name-based detection only for pure Quranic/Arabic subjects (minimal false positives)
  const isPureQuranic =
    /[؀-ۿ]/.test(r.subject_name || '') ||
    /[؀-ۿ]/.test(r.subject_name_ar || '') ||
    name.includes('quran') || name.includes('qur\'an') || name.includes('hafiz');

  const isTheology = isExplicitTheology || isPureQuranic;

  if (type === 'theology') {
    if (isIRE) return false;
    return isTheology;
  }
  if (type === 'secular') {
    if (isIRE) return true;
    return !isExplicitTheology; // Allow secular Islamic subjects when academic_type is not theology
  }
  return true; // mixed type includes everything
}
