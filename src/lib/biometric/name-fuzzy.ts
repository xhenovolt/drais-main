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

// ── Phase 3 — roster-cached fuzzy matching (no per-name DB round-trip) ─

export interface RosterPerson {
  type: 'student' | 'staff';
  id: number;
  name: string;
  tokens: string[];
  admissionNo?: string | null;
  position?: string | null;
}

/**
 * Load a school's students + staff names ONCE for in-memory fuzzy
 * scoring. The reconciliation engine compares a whole device directory
 * against this roster — calling fuzzyCandidates per device user issues
 * one LIKE query each (45 users → 45 round-trips → TiDB timeout). This
 * pulls the roster in 2 queries; scoring is then pure CPU.
 */
export async function loadSchoolRoster(schoolId: number): Promise<RosterPerson[]> {
  const roster: RosterPerson[] = [];
  try {
    const students = (await query(
      `SELECT s.id AS id, p.first_name, p.other_name, p.last_name, s.admission_no
         FROM students s JOIN people p ON p.id = s.person_id
        WHERE s.school_id = ? AND s.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [schoolId],
    )) as Array<any>;
    for (const s of students) {
      const name = [s.first_name, s.other_name, s.last_name].filter(Boolean).join(' ').trim();
      roster.push({ type: 'student', id: Number(s.id), name, tokens: tokenize(name), admissionNo: s.admission_no });
    }
  } catch { /* ignore */ }
  try {
    const staff = (await query(
      `SELECT st.id AS id, st.position, p.first_name, p.other_name, p.last_name
         FROM staff st JOIN people p ON p.id = st.person_id
        WHERE st.school_id = ? AND st.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [schoolId],
    )) as Array<any>;
    for (const s of staff) {
      const name = [s.first_name, s.other_name, s.last_name].filter(Boolean).join(' ').trim();
      roster.push({ type: 'staff', id: Number(s.id), name, tokens: tokenize(name), position: s.position });
    }
  } catch { /* ignore */ }
  return roster;
}

/** In-memory equivalent of fuzzyCandidates against a preloaded roster. */
export function fuzzyCandidatesFromRoster(deviceName: string, roster: RosterPerson[]): NameCandidate[] {
  const targetTokens = tokenize(deviceName);
  const meat = targetTokens.filter(t => t.length >= 4);
  if (meat.length === 0) return [];
  const scored: NameCandidate[] = [];
  for (const r of roster) {
    // cheap pre-filter: at least one shared meaty token
    if (!meat.some(t => r.tokens.includes(t))) continue;
    const score = jaccardScore(targetTokens, r.tokens);
    if (score < 0.34) continue;
    scored.push({ type: r.type, id: r.id, name: r.name, admissionNo: r.admissionNo, position: r.position, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}
