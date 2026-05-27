/**
 * Parent → learner linking.
 *
 * A link is only ever created from EVIDENCE (the parent's verified phone
 * appears on a learner's on-file contact record) and is then either
 * auto-activated (if the school opted in) or held 'pending' for staff
 * approval. The fragmented contact tables are evidence for a request — never
 * the grant itself. The grant is a row in parent_student_links.
 */
import { query } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/africastalking';

export interface MatchableLearner {
  school_id:    number;
  school_name:  string;
  student_id:   number;
  learner_name: string;
  relationship: string | null;
  source:       'contact' | 'next_of_kin';
}

/** Phone variants we match on-file numbers against (storage isn't normalized). */
function phoneVariants(normalized: string): string[] {
  // normalized is +256XXXXXXXXX
  const nsn = normalized.replace(/^\+256/, ''); // 9 digits
  return [normalized, `256${nsn}`, `0${nsn}`, nsn];
}

/**
 * Find every learner (across ALL schools) whose on-file contact phone matches
 * the given phone. SQL strips spaces/dashes/parens before comparing so stored
 * formatting variations still match.
 */
export async function findMatchableLearners(rawPhone: string): Promise<MatchableLearner[]> {
  const phone = normalizePhoneNumber(rawPhone);
  if (!phone) return [];
  const variants = phoneVariants(phone);
  const placeholders = variants.map(() => '?').join(',');
  const clean = `REPLACE(REPLACE(REPLACE(REPLACE(%COL%, ' ', ''), '-', ''), '(', ''), ')', '')`;

  // Path 1: people → contacts → student_contacts (modern, school-scoped)
  const viaContacts = (await query(
    `SELECT s.id            AS student_id,
            s.school_id     AS school_id,
            sc.name         AS school_name,
            TRIM(CONCAT_WS(' ', lp.first_name, lp.last_name)) AS learner_name,
            scn.relationship AS relationship
       FROM people p
       JOIN contacts c          ON c.person_id = p.id AND c.deleted_at IS NULL
       JOIN student_contacts scn ON scn.contact_id = c.id
       JOIN students s          ON s.id = scn.student_id AND s.deleted_at IS NULL
       JOIN schools sc          ON sc.id = s.school_id AND sc.deleted_at IS NULL
       LEFT JOIN people lp      ON lp.id = s.person_id
      WHERE ${clean.replace('%COL%', 'p.phone')} IN (${placeholders})`,
    [...variants],
  )) as any[];

  // Path 2: student_next_of_kin.contact (denormalized fallback)
  const viaNok = (await query(
    `SELECT s.id        AS student_id,
            s.school_id AS school_id,
            sc.name     AS school_name,
            TRIM(CONCAT_WS(' ', lp.first_name, lp.last_name)) AS learner_name,
            'guardian'  AS relationship
       FROM student_next_of_kin nok
       JOIN students s ON s.id = nok.student_id AND s.deleted_at IS NULL
       JOIN schools sc ON sc.id = s.school_id AND sc.deleted_at IS NULL
       LEFT JOIN people lp ON lp.id = s.person_id
      WHERE ${clean.replace('%COL%', 'nok.contact')} IN (${placeholders})`,
    [...variants],
  )) as any[];

  const seen = new Set<string>();
  const out: MatchableLearner[] = [];
  for (const r of viaContacts) {
    const k = `${r.school_id}:${r.student_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      school_id: Number(r.school_id), school_name: r.school_name,
      student_id: Number(r.student_id), learner_name: r.learner_name || `Learner #${r.student_id}`,
      relationship: r.relationship ?? null, source: 'contact',
    });
  }
  for (const r of viaNok) {
    const k = `${r.school_id}:${r.student_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      school_id: Number(r.school_id), school_name: r.school_name,
      student_id: Number(r.student_id), learner_name: r.learner_name || `Learner #${r.student_id}`,
      relationship: 'guardian', source: 'next_of_kin',
    });
  }
  return out;
}

/** Whether a school auto-approves OTP-matched links (else they wait for staff). */
async function schoolAutoApproves(schoolId: number): Promise<boolean> {
  const rows = (await query(
    `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'parent_link_auto_approve' LIMIT 1`,
    [schoolId],
  )) as any[];
  return rows.length ? String(rows[0].value_text).toLowerCase() === 'true' : false;
}

export interface ClaimResult {
  created:  Array<{ school_id: number; school_name: string; student_id: number; learner_name: string; status: string }>;
  alreadyLinked: number;
  noMatch:  boolean;
}

/**
 * Create link rows for every matchable learner not already linked. Honors the
 * per-school auto-approve setting. Idempotent: re-claiming is a no-op for
 * existing links (the UNIQUE key + status check prevents duplicates).
 */
export async function claimLearners(parentAccountId: number, phone: string): Promise<ClaimResult> {
  const matches = await findMatchableLearners(phone);
  if (!matches.length) return { created: [], alreadyLinked: 0, noMatch: true };

  const created: ClaimResult['created'] = [];
  let alreadyLinked = 0;

  for (const m of matches) {
    const existing = (await query(
      `SELECT id, status FROM parent_student_links
        WHERE parent_account_id = ? AND school_id = ? AND student_id = ? LIMIT 1`,
      [parentAccountId, m.school_id, m.student_id],
    )) as any[];
    if (existing.length) { alreadyLinked++; continue; }

    const autoApprove = await schoolAutoApproves(m.school_id);
    const status = autoApprove ? 'active' : 'pending';
    await query(
      `INSERT INTO parent_student_links
         (parent_account_id, school_id, student_id, relationship, status, verified_via, approved_at)
       VALUES (?, ?, ?, ?, ?, 'otp_contact_match', ${autoApprove ? 'NOW()' : 'NULL'})`,
      [parentAccountId, m.school_id, m.student_id, m.relationship ?? 'guardian', status],
    );
    created.push({
      school_id: m.school_id, school_name: m.school_name,
      student_id: m.student_id, learner_name: m.learner_name, status,
    });
  }

  return { created, alreadyLinked, noMatch: false };
}
