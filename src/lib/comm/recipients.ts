/**
 * Audience resolver. Given an event + audience, return the list of
 * (phone, name, optional ids) tuples the dispatcher should target.
 *
 * Every resolver MUST be tenant-scoped — it filters by school_id even
 * if the calling rule didn't (defence in depth).
 */
import { query } from '@/lib/db';
import type { CommAudience, CommEventType } from './events';

export interface Recipient {
  phone:     string;
  name:      string;
  userId?:   number | null;
  studentId?: number | null;
  staffId?:   number | null;
}

interface ParentRow      { phone: string; name: string; student_id: number; }
interface StaffPhoneRow  { staff_id: number; phone: string; name: string; }

/**
 * Resolve the recipient set for one rule against one event. Returns
 * an empty array if no recipients found — the dispatcher then writes
 * a 'skipped' log row so admins can see *why* nothing fired.
 */
export async function resolveRecipients(args: {
  schoolId:    number;
  eventType:   CommEventType;
  audience:    CommAudience;
  studentId?:  number;
  staffId?:    number;
  customPhones?: { phone: string; name?: string }[];
}): Promise<Recipient[]> {
  const { schoolId, audience, studentId, staffId } = args;

  switch (audience) {
    case 'custom':
      return (args.customPhones ?? [])
        .filter(p => p.phone)
        .map(p => ({ phone: p.phone, name: p.name ?? p.phone }));

    case 'parents':
    case 'guardians': {
      if (!studentId) return [];
      // student_contacts → contacts.phone (the modern table) — fall back
      // to parents if a school still uses the legacy student_parents
      // shape. Both queries are school-scoped.
      const viaContacts = (await query(
        `SELECT c.phone AS phone, c.full_name AS name, sc.student_id
           FROM student_contacts sc
           JOIN contacts c ON c.id = sc.contact_id
           JOIN students s ON s.id = sc.student_id
          WHERE s.school_id = ?
            AND sc.student_id = ?
            AND c.phone IS NOT NULL AND c.phone <> ''
            ${audience === 'guardians' ? "AND sc.relationship IN ('guardian','grandparent','aunt','uncle')" : ''}`,
        [schoolId, studentId],
      )) as ParentRow[];

      const viaParents = (await query(
        `SELECT pa.phone AS phone, pa.name AS name, sp.student_id
           FROM student_parents sp
           JOIN parents pa  ON pa.id = sp.parent_id
           JOIN students s  ON s.id  = sp.student_id
          WHERE s.school_id = ?
            AND sp.student_id = ?
            AND pa.phone IS NOT NULL AND pa.phone <> ''`,
        [schoolId, studentId],
      )) as ParentRow[];

      // Dedup by phone
      const seen = new Set<string>();
      const out: Recipient[] = [];
      for (const r of [...viaContacts, ...viaParents]) {
        if (seen.has(r.phone)) continue;
        seen.add(r.phone);
        out.push({ phone: r.phone, name: r.name, studentId: r.student_id });
      }
      return out;
    }

    case 'class_teacher': {
      if (!studentId) return [];
      const rows = (await query(
        `SELECT s.id AS staff_id,
                pe.phone AS phone,
                TRIM(CONCAT_WS(' ', pe.first_name, pe.last_name)) AS name
           FROM enrollments e
           JOIN class_teachers ct ON ct.class_id = e.class_id
                                  AND (ct.stream_id IS NULL OR ct.stream_id = e.stream_id)
                                  AND (ct.valid_until IS NULL OR ct.valid_until > NOW())
           JOIN staff s    ON s.id  = ct.staff_id
           LEFT JOIN people pe ON pe.id = s.person_id
          WHERE e.student_id = ?
            AND e.school_id  = ?
            AND e.status     = 'active'`,
        [studentId, schoolId],
      )) as StaffPhoneRow[];
      return rows
        .filter(r => r.phone)
        .map(r => ({ phone: r.phone, name: r.name || `Staff #${r.staff_id}`, staffId: r.staff_id }));
    }

    case 'headteacher':
    case 'directors': {
      // Resolve by position.code — both fall under top-level admin
      // positions. Schools customise their position catalog so we
      // match on a small whitelist.
      const codes = audience === 'headteacher'
        ? ['headteacher', 'head_teacher', 'principal']
        : ['director', 'school_director', 'managing_director'];

      const rows = (await query(
        `SELECT s.id AS staff_id,
                pe.phone AS phone,
                TRIM(CONCAT_WS(' ', pe.first_name, pe.last_name)) AS name
           FROM staff s
           JOIN positions  po  ON po.id = s.position_id
           LEFT JOIN people pe ON pe.id = s.person_id
          WHERE s.school_id  = ?
            AND s.deleted_at IS NULL
            AND s.status     = 'active'
            AND po.code IN (${codes.map(() => '?').join(',')})
            AND pe.phone IS NOT NULL AND pe.phone <> ''`,
        [schoolId, ...codes],
      )) as StaffPhoneRow[];
      return rows.map(r => ({
        phone: r.phone,
        name:  r.name || `Staff #${r.staff_id}`,
        staffId: r.staff_id,
      }));
    }

    case 'self': {
      // The subject of the event. For staff events this is the staff
      // member; for learner events this is typically meaningless (a
      // learner doesn't get their own attendance SMS), but a school
      // could opt in via a 'self' rule on auth events.
      if (staffId) {
        const rows = (await query(
          `SELECT s.id AS staff_id,
                  pe.phone AS phone,
                  TRIM(CONCAT_WS(' ', pe.first_name, pe.last_name)) AS name
             FROM staff s
             LEFT JOIN people pe ON pe.id = s.person_id
            WHERE s.id = ? AND s.school_id = ?`,
          [staffId, schoolId],
        )) as StaffPhoneRow[];
        return rows
          .filter(r => r.phone)
          .map(r => ({ phone: r.phone, name: r.name || `Staff #${r.staff_id}`, staffId: r.staff_id }));
      }
      return [];
    }

    default:
      return [];
  }
}
