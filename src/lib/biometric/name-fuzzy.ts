import { query } from '@/lib/db';

/**
 * Shared name-fuzzy helpers for the biometric pipeline.
 *
 * The PUSH protocol gives us a free-text device name on USERINFO/OPERLOG
 * records (e.g. "ABUBAKAR SHEKHA ALI"). When a PIN has no DRAIS mapping
 * we still want to find the most plausible learner/staff member behind
 * that name, both for the orphan-claim queue and for the live identity
 * popup. This module is the single source of truth for that lookup;
 * any call site that needs "given a device name, who could this be?"
 * should import from here instead of re-implementing the scoring.
 */

export type NameCandidate = {
  type: 'student' | 'staff';
  id: number;
  name: string;
  admissionNo?: string | null;
  position?: string | null;
  score: number;
};

export function tokenize(s: string): string[] {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function jaccardScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

export async function fuzzyCandidates(
  deviceName: string,
  schoolId: number,
): Promise<NameCandidate[]> {
  const targetTokens = tokenize(deviceName);
  if (targetTokens.length === 0) return [];

  // We bias toward 4+ char tokens to dodge two-letter false positives.
  const meatTokens = targetTokens.filter(t => t.length >= 4);
  if (meatTokens.length === 0) return [];

  const studentLikes = meatTokens.map(_ => `(LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ? OR LOWER(p.other_name) LIKE ?)`).join(' OR ');
  const studentParams: unknown[] = [schoolId];
  for (const t of meatTokens) {
    const pat = `%${t.toLowerCase()}%`;
    studentParams.push(pat, pat, pat);
  }
  const students = (await query(
    `SELECT s.id   AS student_id,
            p.first_name, p.other_name, p.last_name,
            s.admission_no
       FROM students s
       JOIN people  p ON p.id = s.person_id
      WHERE s.school_id = ?
        AND (${studentLikes})
      LIMIT 25`,
    studentParams,
  )) as Array<{
    student_id: number;
    first_name: string | null; other_name: string | null; last_name: string | null;
    admission_no: string | null;
  }>;

  const staffLikes = meatTokens.map(_ => `(LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ? OR LOWER(p.other_name) LIKE ?)`).join(' OR ');
  const staffParams: unknown[] = [schoolId];
  for (const t of meatTokens) {
    const pat = `%${t.toLowerCase()}%`;
    staffParams.push(pat, pat, pat);
  }
  const staff = (await query(
    `SELECT st.id AS staff_id, st.position,
            p.first_name, p.other_name, p.last_name
       FROM staff st
       JOIN people p ON p.id = st.person_id
      WHERE st.school_id = ?
        AND (${staffLikes})
      LIMIT 25`,
    staffParams,
  )) as Array<{
    staff_id: number; position: string | null;
    first_name: string | null; other_name: string | null; last_name: string | null;
  }>;

  const all: NameCandidate[] = [];
  for (const s of students) {
    const fullName = [s.first_name, s.other_name, s.last_name].filter(Boolean).join(' ').trim();
    all.push({
      type: 'student',
      id:   s.student_id,
      name: fullName,
      admissionNo: s.admission_no,
      score: jaccardScore(targetTokens, tokenize(fullName)),
    });
  }
  for (const s of staff) {
    const fullName = [s.first_name, s.other_name, s.last_name].filter(Boolean).join(' ').trim();
    all.push({
      type: 'staff',
      id:   s.staff_id,
      name: fullName,
      position: s.position,
      score: jaccardScore(targetTokens, tokenize(fullName)),
    });
  }
  all.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: NameCandidate[] = [];
  for (const c of all) {
    if (c.score < 0.34) break;
    const key = `${c.type}:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= 3) break;
  }
  return out;
}
