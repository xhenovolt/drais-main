/**
 * SQL-backed PersonLookup — the production adapter that wires the
 * unified identity resolver (src/lib/ingestion/identity/index.ts) to
 * the actual `people` / `students` / `staff` / `student_fingerprints`
 * / `zk_user_mapping` tables.
 *
 * Phase 2+ migrations (students importer, attendance adapters, …) all
 * pass an instance of this to runIngestionPipeline() — replaces the
 * four divergent per-route identity strategies Phase 0 audit found.
 *
 * Notes on schema:
 *   - `people` is the unified person row (one per human). Students and
 *     staff have FKs `students.person_id` and `staff.person_id`.
 *   - Enrolment + class are derived via `enrollments` for student rows.
 *   - Credentials live in `student_fingerprints` and `staff_fingerprints`;
 *     credentialId is the WebAuthn credential identifier.
 *   - Device mapping lives in `zk_user_mapping` (ZKTeco) and
 *     `device_user_mappings` (general ADMS). We try both.
 *
 * Pure DB code — no business logic. Safe to call from any route /
 * adapter / script. Errors propagate as Promise rejections.
 */

import { query } from '@/lib/db';
import type { PersonLookup, PersonRow } from '../identity';

export function createSqlPersonLookup(): PersonLookup {
  return {
    async byAdmissionNo(admissionNo, schoolId) {
      const rows = (await query(
        `SELECT s.id           AS person_id,
                'student'       AS role,
                s.admission_no  AS admission_no,
                p.first_name    AS first_name,
                p.last_name     AS last_name,
                p.other_name    AS other_name,
                c.name          AS class_name,
                st.name         AS stream_name
           FROM students   s
           JOIN people     p  ON p.id = s.person_id
           LEFT JOIN enrollments e  ON e.student_id = s.id AND e.status = 'active'
           LEFT JOIN classes     c  ON c.id = e.class_id
           LEFT JOIN streams     st ON st.id = e.stream_id
          WHERE s.admission_no = ?
            AND s.school_id    = ?
          LIMIT 5`,
        [admissionNo, schoolId],
      )) as PersonRow[];
      return rows ?? [];
    },

    async byCredentialId(credentialId, schoolId) {
      // Try student fingerprints first; staff second. Distinct WebAuthn
      // credentials are unique globally — schoolId is enforced via the
      // join to students/staff.
      const studentHits = (await query(
        `SELECT s.id           AS person_id,
                'student'       AS role,
                s.admission_no  AS admission_no,
                p.first_name    AS first_name,
                p.last_name     AS last_name,
                p.other_name    AS other_name,
                c.name          AS class_name,
                st.name         AS stream_name
           FROM student_fingerprints sf
           JOIN students s ON s.id = sf.student_id
           JOIN people   p ON p.id = s.person_id
           LEFT JOIN enrollments e  ON e.student_id = s.id AND e.status = 'active'
           LEFT JOIN classes     c  ON c.id = e.class_id
           LEFT JOIN streams     st ON st.id = e.stream_id
          WHERE sf.credential_id = ?
            AND sf.is_active     = 1
            AND s.school_id      = ?
          LIMIT 5`,
        [credentialId, schoolId],
      )) as PersonRow[];
      if (studentHits.length > 0) return studentHits;

      const staffHits = (await query(
        `SELECT s.id           AS person_id,
                'staff'         AS role,
                NULL            AS admission_no,
                p.first_name    AS first_name,
                p.last_name     AS last_name,
                p.other_name    AS other_name,
                NULL            AS class_name,
                NULL            AS stream_name
           FROM staff_fingerprints sf
           JOIN staff  s ON s.id = sf.staff_id
           JOIN people p ON p.id = s.person_id
          WHERE sf.credential_id = ?
            AND sf.is_active     = 1
            AND s.school_id      = ?
          LIMIT 5`,
        [credentialId, schoolId],
      )) as PersonRow[];
      return staffHits ?? [];
    },

    async byDeviceMapping(deviceUserId, deviceSerial, schoolId) {
      // ZKTeco-style mapping table — student or staff. Also try the
      // newer device_user_mappings used by ADMS pushes.
      const rows: PersonRow[] = [];

      const zk = (await query(
        `SELECT
            CASE WHEN zum.user_type = 'student' THEN zum.student_id
                 WHEN zum.user_type = 'staff'   THEN zum.staff_id
                 ELSE NULL END                                AS person_id,
            zum.user_type                                     AS role,
            s.admission_no                                    AS admission_no,
            COALESCE(p.first_name, sp.first_name)             AS first_name,
            COALESCE(p.last_name,  sp.last_name)              AS last_name,
            COALESCE(p.other_name, sp.other_name)             AS other_name,
            c.name                                            AS class_name,
            st.name                                           AS stream_name
           FROM zk_user_mapping zum
           LEFT JOIN students s   ON zum.user_type = 'student' AND s.id  = zum.student_id
           LEFT JOIN people   p   ON p.id = s.person_id
           LEFT JOIN staff    sf  ON zum.user_type = 'staff'   AND sf.id = zum.staff_id
           LEFT JOIN people   sp  ON sp.id = sf.person_id
           LEFT JOIN enrollments e  ON e.student_id = s.id AND e.status = 'active'
           LEFT JOIN classes     c  ON c.id = e.class_id
           LEFT JOIN streams     st ON st.id = e.stream_id
          WHERE zum.device_user_id = ?
            AND (zum.device_sn = ? OR zum.device_sn IS NULL)
          LIMIT 5`,
        [deviceUserId, deviceSerial],
      )) as PersonRow[];
      for (const r of zk) if (r.personId != null) rows.push(r);
      if (rows.length > 0) return rows;

      // device_user_mappings (ADMS general path).
      const adms = (await query(
        `SELECT
            CASE WHEN dum.student_id IS NOT NULL THEN dum.student_id
                 WHEN dum.staff_id   IS NOT NULL THEN dum.staff_id
                 ELSE NULL END                                AS person_id,
            CASE WHEN dum.student_id IS NOT NULL THEN 'student'
                 WHEN dum.staff_id   IS NOT NULL THEN 'staff'
                 ELSE NULL END                                AS role,
            s.admission_no                                    AS admission_no,
            COALESCE(p.first_name, sp.first_name)             AS first_name,
            COALESCE(p.last_name,  sp.last_name)              AS last_name,
            COALESCE(p.other_name, sp.other_name)             AS other_name,
            c.name                                            AS class_name,
            st.name                                           AS stream_name
           FROM device_user_mappings dum
           LEFT JOIN students s   ON s.id  = dum.student_id
           LEFT JOIN people   p   ON p.id  = s.person_id
           LEFT JOIN staff    sf  ON sf.id = dum.staff_id
           LEFT JOIN people   sp  ON sp.id = sf.person_id
           LEFT JOIN enrollments e  ON e.student_id = s.id AND e.status = 'active'
           LEFT JOIN classes     c  ON c.id = e.class_id
           LEFT JOIN streams     st ON st.id = e.stream_id
          WHERE dum.device_user_id = ?
            AND dum.device_sn      = ?
          LIMIT 5`,
        [deviceUserId, deviceSerial],
      )) as PersonRow[];
      for (const r of adms) if (r.personId != null) rows.push(r);
      return rows;
    },

    async byNamePrefix(firstName, lastName, schoolId, opts) {
      // Conservative prefix search — 12-char ceiling on each name + class
      // filter narrows the candidate set so the resolver's fuzzy ranking
      // stays bounded.
      const fnameLike = (firstName ?? '').slice(0, 12).trim();
      const lnameLike = (lastName  ?? '').slice(0, 12).trim();
      if (!fnameLike && !lnameLike) return [];

      // Try student rows first (most common case for the students importer).
      // Class filter is OPTIONAL — when supplied, narrows; otherwise we
      // accept any active enrolment.
      const args: unknown[] = [`${fnameLike}%`, `${lnameLike}%`, schoolId];
      let classFilter = '';
      if (opts?.className) {
        classFilter = ' AND (c.name = ? OR c.name LIKE ?)';
        args.push(opts.className, `${opts.className}%`);
      }
      const studentHits = (await query(
        `SELECT s.id           AS person_id,
                'student'       AS role,
                s.admission_no  AS admission_no,
                p.first_name    AS first_name,
                p.last_name     AS last_name,
                p.other_name    AS other_name,
                c.name          AS class_name,
                st.name         AS stream_name
           FROM students s
           JOIN people   p ON p.id = s.person_id
           LEFT JOIN enrollments e  ON e.student_id = s.id AND e.status = 'active'
           LEFT JOIN classes     c  ON c.id = e.class_id
           LEFT JOIN streams     st ON st.id = e.stream_id
          WHERE p.first_name LIKE ?
            AND p.last_name  LIKE ?
            AND s.school_id  = ?
            ${classFilter}
          LIMIT 20`,
        args,
      )) as PersonRow[];
      return studentHits ?? [];
    },
  };
}
