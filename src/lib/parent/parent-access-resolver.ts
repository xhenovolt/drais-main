/**
 * Canonical parent-access resolver (Track A, Phase 1).
 *
 * Resolves an authenticated parent → the learners they may see, across ALL
 * schools, using the GRANT table parent_student_links (status='active'). The
 * client only ever sees the opaque access_uuid (learnerAccessId); the internal
 * student_id never leaves the server. A single learnerAccessId is resolved back
 * to (student_id, school_id) ONLY when it belongs to the calling parent and is
 * still active — this is the isolation gate for every /api/parent/* detail route.
 *
 * Eligibility BEFORE login (phone → matchable learners) lives in
 * src/lib/portal/linking.ts (findMatchableLearners) — evidence, not a grant.
 */
import { query } from '@/lib/db';
import { financeVisibleToParents } from '@/lib/portal/visibility';

export type DataScope = 'attendance' | 'academics' | 'fees' | 'receipts' | 'reports' | 'notifications';

export interface LearnerAccess {
  parent_identity_id: number;
  learner_access_id:  string;   // access_uuid — the only learner handle clients see
  school_id:          number;
  school_name:        string;
  student_id:         number;   // SERVER-ONLY; never serialize to the client
  learner_name:       string;
  class_name:         string | null;
  stream_name:        string | null;
  relationship:       string | null;
  access_status:      string;
  data_scopes:        DataScope[];
}

const BASE_SCOPES: DataScope[] = ['attendance', 'academics', 'receipts', 'reports', 'notifications'];

/** All active learner grants for a parent, across every school. */
export async function resolveLearnersForParent(parentAccountId: number): Promise<LearnerAccess[]> {
  const rows = (await query(
    `SELECT psl.access_uuid,
            psl.relationship,
            psl.status,
            psl.school_id,
            psl.student_id,
            sc.name AS school_name,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name,
            cl.name AS class_name,
            (SELECT st.name
               FROM enrollments en JOIN streams st ON st.id = en.stream_id
              WHERE en.student_id = s.id AND en.status = 'active'
              LIMIT 1) AS stream_name
       FROM parent_student_links psl
       JOIN schools  sc ON sc.id = psl.school_id AND sc.deleted_at IS NULL
       JOIN students s  ON s.id  = psl.student_id AND s.deleted_at IS NULL
       LEFT JOIN people  p  ON p.id  = s.person_id
       LEFT JOIN classes cl ON cl.id = s.class_id
      WHERE psl.parent_account_id = ?
        AND psl.status = 'active'
      ORDER BY sc.name ASC, learner_name ASC`,
    [parentAccountId],
  )) as any[];

  // fees scope is per-school (some schools hide finances); resolve once per school.
  const financeBySchool = new Map<number, boolean>();
  for (const r of rows) {
    const sid = Number(r.school_id);
    if (!financeBySchool.has(sid)) financeBySchool.set(sid, await financeVisibleToParents(sid));
  }

  return rows.map(r => {
    const schoolId = Number(r.school_id);
    const scopes = [...BASE_SCOPES];
    if (financeBySchool.get(schoolId)) scopes.push('fees');
    return {
      parent_identity_id: parentAccountId,
      learner_access_id:  r.access_uuid,
      school_id:          schoolId,
      school_name:        r.school_name,
      student_id:         Number(r.student_id),
      learner_name:       r.learner_name || `Learner #${r.student_id}`,
      class_name:         r.class_name ?? null,
      stream_name:        r.stream_name ?? null,
      relationship:       r.relationship ?? null,
      access_status:      r.status,
      data_scopes:        scopes,
    };
  });
}

export interface ResolvedAccess {
  student_id:      number;
  school_id:       number;
  finance_visible: boolean;
}

/**
 * THE GATE for detail routes. Resolve a learnerAccessId (access_uuid) back to a
 * server-side student, ONLY if it belongs to this parent and is active.
 * Returns null otherwise (→ 404/403 at the route). Never trust a raw student_id.
 */
export async function resolveAccessId(
  parentAccountId: number,
  learnerAccessId: string,
): Promise<ResolvedAccess | null> {
  if (!learnerAccessId || typeof learnerAccessId !== 'string') return null;
  const rows = (await query(
    `SELECT student_id, school_id
       FROM parent_student_links
      WHERE parent_account_id = ? AND access_uuid = ? AND status = 'active'
      LIMIT 1`,
    [parentAccountId, learnerAccessId],
  )) as Array<{ student_id: number; school_id: number }>;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    student_id:      Number(r.student_id),
    school_id:       Number(r.school_id),
    finance_visible: await financeVisibleToParents(Number(r.school_id)),
  };
}

/** Convenience for routes that need a specific scope allowed before querying. */
export function scopeAllowed(access: ResolvedAccess, scope: DataScope): boolean {
  if (scope === 'fees') return access.finance_visible;
  return true;
}
