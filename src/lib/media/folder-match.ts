/**
 * Match photo files in a school-managed folder to people — deterministically.
 *
 * A file matches a person only when its name (without extension) equals one of
 * that person's identifiers EXACTLY (case-insensitive, surrounding spaces and
 * characters Windows forbids in names normalised). Display names are never
 * used: two learners can share a name, and a wrong photo on an ID card or
 * report is worse than no photo.
 *
 * Identifier keys, in the order an administrator chooses:
 *   admission_no  — learners; TiDB enforces it per school for ACTIVE learners
 *                   (uk_student_school_admission on admission_no_active), local SQLite
 *                   globally — still re-checked here on every scan, at no cost
 *   staff_no      — staff; same caveat
 *   person_id     — DRAIS's own people.id (globally unique) — always unambiguous
 *
 * Anything that is not a single file ↔ single person pairing is returned as
 * unresolved with a reason, for a human to map explicitly.
 */
export type MatchKey = 'admission_no' | 'staff_no' | 'person_id';

export interface PersonIdentity {
  personId: number;
  kind: 'student' | 'staff';
  admissionNo?: string | null;
  staffNo?: string | null;
  displayName: string;
}

export interface FolderMatch { personId: number; file: string; key: MatchKey }
export type UnresolvedReason = 'no_matching_person' | 'several_people_share_identifier' | 'several_files_for_person' | 'blank_identifier';
export interface Unresolved { file?: string; personIds?: number[]; reason: UnresolvedReason }

export function normaliseKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ');
}

function stem(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? file;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function identifierFor(p: PersonIdentity, key: MatchKey): string | null {
  if (key === 'person_id') return String(p.personId);
  const v = key === 'admission_no' ? p.admissionNo : p.staffNo;
  return v && v.trim() ? normaliseKey(v) : null;
}

export function matchFolder(files: string[], people: PersonIdentity[], key: MatchKey): { matched: FolderMatch[]; unresolved: Unresolved[] } {
  const byId = new Map<string, number[]>();
  for (const p of people) {
    const id = identifierFor(p, key);
    if (!id) continue;
    const list = byId.get(id) ?? [];
    list.push(p.personId);
    byId.set(id, list);
  }
  const filesByPerson = new Map<number, string[]>();
  const unresolved: Unresolved[] = [];
  for (const file of files) {
    const k = normaliseKey(stem(file));
    if (!k) { unresolved.push({ file, reason: 'blank_identifier' }); continue; }
    const ids = byId.get(k);
    if (!ids) { unresolved.push({ file, reason: 'no_matching_person' }); continue; }
    if (ids.length > 1) { unresolved.push({ file, personIds: ids, reason: 'several_people_share_identifier' }); continue; }
    const list = filesByPerson.get(ids[0]) ?? [];
    list.push(file);
    filesByPerson.set(ids[0], list);
  }
  const matched: FolderMatch[] = [];
  for (const [personId, fs] of filesByPerson) {
    if (fs.length === 1) matched.push({ personId, file: fs[0], key });
    else unresolved.push({ personIds: [personId], reason: 'several_files_for_person', file: fs.join(', ') });
  }
  matched.sort((a, b) => a.personId - b.personId);
  return { matched, unresolved };
}
