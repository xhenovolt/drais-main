/**
 * Bulk-broadcast audience resolver.
 *
 * Powers the "Send custom SMS to N phones" UI. Distinct from
 * recipients.ts (which resolves audiences for *event-driven* rules) —
 * this one resolves audiences for manual one-off broadcasts where the
 * caller selects "all parents in class X" or "all teachers" etc.
 *
 * Every resolver is tenant-scoped.
 */
import { query } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/africastalking';

export interface BroadcastTarget {
  phone: string;
  name:  string;
  meta?: string;        // free-text label shown in the preview (e.g. "Parent of Ibrahim")
}

export type BroadcastAudience =
  | { type: 'paste';            phones: { phone: string; name?: string }[] }
  | { type: 'all_parents' }
  | { type: 'class_parents';    classId:  number; streamId?: number | null }
  | { type: 'learner_parents';  studentIds: number[] }
  | { type: 'all_staff' }
  | { type: 'all_teachers' }
  | { type: 'class_teachers' };

/**
 * Resolve an audience descriptor to a deduplicated, normalised list of
 * targets. Invalid / unparseable phones are silently dropped (the API
 * layer reports the count back to the caller).
 */
export async function resolveBroadcastAudience(
  schoolId: number,
  audience: BroadcastAudience,
): Promise<BroadcastTarget[]> {
  let raw: BroadcastTarget[] = [];

  switch (audience.type) {
    case 'paste':
      raw = (audience.phones ?? []).map(p => ({
        phone: p.phone,
        name:  p.name ?? p.phone,
        meta:  'custom',
      }));
      break;

    case 'all_parents': {
      // Union over student_contacts → contacts and legacy student_parents
      // → parents. School-scoped via students.school_id.
      const via1 = (await query(
        `SELECT DISTINCT c.phone, c.full_name AS name
           FROM student_contacts sc
           JOIN contacts c   ON c.id = sc.contact_id
           JOIN students s   ON s.id = sc.student_id
          WHERE s.school_id = ?
            AND c.phone IS NOT NULL AND c.phone <> ''`,
        [schoolId],
      )) as Array<{ phone: string; name: string }>;
      const via2 = (await query(
        `SELECT DISTINCT pa.phone, pa.name
           FROM student_parents sp
           JOIN parents pa ON pa.id = sp.parent_id
           JOIN students s ON s.id  = sp.student_id
          WHERE s.school_id = ?
            AND pa.phone IS NOT NULL AND pa.phone <> ''`,
        [schoolId],
      )) as Array<{ phone: string; name: string }>;
      raw = [...via1, ...via2].map(r => ({ phone: r.phone, name: r.name, meta: 'parent' }));
      break;
    }

    case 'class_parents': {
      const streamFilter = audience.streamId == null ? '' : 'AND e.stream_id = ?';
      const params: any[] = [schoolId, audience.classId];
      if (audience.streamId != null) params.push(audience.streamId);
      // Same union as all_parents, narrowed to one class via active enrollments
      const via1 = (await query(
        `SELECT DISTINCT c.phone, c.full_name AS name
           FROM student_contacts sc
           JOIN contacts    c ON c.id = sc.contact_id
           JOIN students    s ON s.id = sc.student_id
           JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
          WHERE s.school_id = ?
            AND e.class_id  = ?
            ${streamFilter}
            AND c.phone IS NOT NULL AND c.phone <> ''`,
        params,
      )) as Array<{ phone: string; name: string }>;
      const via2 = (await query(
        `SELECT DISTINCT pa.phone, pa.name
           FROM student_parents sp
           JOIN parents    pa ON pa.id = sp.parent_id
           JOIN students   s  ON s.id  = sp.student_id
           JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
          WHERE s.school_id = ?
            AND e.class_id  = ?
            ${streamFilter}
            AND pa.phone IS NOT NULL AND pa.phone <> ''`,
        params,
      )) as Array<{ phone: string; name: string }>;
      raw = [...via1, ...via2].map(r => ({ phone: r.phone, name: r.name, meta: 'parent (class)' }));
      break;
    }

    case 'learner_parents': {
      // Guardians of an explicit set of learners (e.g. selected rows in the
      // list). School-scoped, so foreign student_ids resolve to nothing.
      const ids = (audience.studentIds ?? []).filter(n => Number.isFinite(n));
      if (!ids.length) { raw = []; break; }
      const ph = ids.map(() => '?').join(',');
      const via1 = (await query(
        `SELECT DISTINCT c.phone, c.full_name AS name
           FROM student_contacts sc
           JOIN contacts c ON c.id = sc.contact_id
           JOIN students s ON s.id = sc.student_id
          WHERE s.school_id = ? AND sc.student_id IN (${ph})
            AND c.phone IS NOT NULL AND c.phone <> ''`,
        [schoolId, ...ids],
      )) as Array<{ phone: string; name: string }>;
      const via2 = (await query(
        `SELECT DISTINCT pa.phone, pa.name
           FROM student_parents sp
           JOIN parents pa ON pa.id = sp.parent_id
           JOIN students s ON s.id  = sp.student_id
          WHERE s.school_id = ? AND sp.student_id IN (${ph})
            AND pa.phone IS NOT NULL AND pa.phone <> ''`,
        [schoolId, ...ids],
      )) as Array<{ phone: string; name: string }>;
      raw = [...via1, ...via2].map(r => ({ phone: r.phone, name: r.name, meta: 'parent (selected)' }));
      break;
    }

    case 'all_staff': {
      const rows = (await query(
        `SELECT pe.phone, TRIM(CONCAT_WS(' ', pe.first_name, pe.last_name)) AS name,
                p.name AS position_name
           FROM staff s
           LEFT JOIN people    pe ON pe.id = s.person_id
           LEFT JOIN positions p  ON p.id  = s.position_id
          WHERE s.school_id    = ?
            AND s.status       = 'active'
            AND s.deleted_at  IS NULL
            AND pe.phone IS NOT NULL AND pe.phone <> ''`,
        [schoolId],
      )) as Array<{ phone: string; name: string; position_name: string | null }>;
      raw = rows.map(r => ({ phone: r.phone, name: r.name, meta: r.position_name ?? 'staff' }));
      break;
    }

    case 'all_teachers': {
      const rows = (await query(
        `SELECT pe.phone, TRIM(CONCAT_WS(' ', pe.first_name, pe.last_name)) AS name
           FROM staff s
           JOIN positions   p  ON p.id  = s.position_id
           LEFT JOIN people pe ON pe.id = s.person_id
          WHERE s.school_id    = ?
            AND s.status       = 'active'
            AND s.deleted_at  IS NULL
            AND p.is_teaching  = 1
            AND p.is_active    = 1
            AND pe.phone IS NOT NULL AND pe.phone <> ''`,
        [schoolId],
      )) as Array<{ phone: string; name: string }>;
      raw = rows.map(r => ({ phone: r.phone, name: r.name, meta: 'teacher' }));
      break;
    }

    case 'class_teachers': {
      // Current class-teacher assignments (valid_until IS NULL OR > NOW)
      const rows = (await query(
        `SELECT DISTINCT pe.phone,
                TRIM(CONCAT_WS(' ', pe.first_name, pe.last_name)) AS name,
                c.name AS class_name
           FROM class_teachers ct
           JOIN staff   s  ON s.id  = ct.staff_id
           LEFT JOIN people pe ON pe.id = s.person_id
           LEFT JOIN classes c ON c.id  = ct.class_id
          WHERE ct.school_id   = ?
            AND (ct.valid_until IS NULL OR ct.valid_until > NOW())
            AND pe.phone IS NOT NULL AND pe.phone <> ''`,
        [schoolId],
      )) as Array<{ phone: string; name: string; class_name: string | null }>;
      raw = rows.map(r => ({
        phone: r.phone,
        name:  r.name,
        meta:  r.class_name ? `class teacher · ${r.class_name}` : 'class teacher',
      }));
      break;
    }
  }

  // Normalise + dedupe by normalised phone.
  const seen = new Map<string, BroadcastTarget>();
  for (const r of raw) {
    const normalised = normalizePhoneNumber(r.phone);
    if (!normalised) continue;
    if (seen.has(normalised)) continue;
    seen.set(normalised, { phone: normalised, name: r.name || normalised, meta: r.meta });
  }
  return Array.from(seen.values());
}
