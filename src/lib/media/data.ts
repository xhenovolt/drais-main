/**
 * The few DB reads/writes the media system needs, for every DB mode.
 *
 * online / local-mysql go through query() (mysql2 pool for the active mode);
 * local-sqlite goes through the better-sqlite3 singleton — db.ts deliberately
 * has no SQLite path, so routes that must work offline branch like this.
 * Every statement is scoped by school_id; ids are never trusted alone.
 */
import { getDbMode } from '@/lib/db/db-mode';
import { query } from '@/lib/db';

export interface MediaSubject {
  entityType: 'person' | 'school_logo';
  entityId: number;
  /** learner / staff / school — for display and the export manifest. */
  role: 'student' | 'staff' | 'school';
  recordId: number;
  displayName: string;
  admissionNo: string | null;
  staffNo: string | null;
  ref: string | null;
}

async function sqlite() {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  return getSqliteDb();
}

async function rows<T>(sql: string, params: unknown[]): Promise<T[]> {
  if (getDbMode() === 'local-sqlite') return (await sqlite()).prepare(sql).all(...params) as T[];
  return (await query(sql, params as any[])) as T[];
}

/** Every learner, staff member and the school logo for one school, with its current image reference. */
export async function listMediaSubjects(schoolId: number): Promise<MediaSubject[]> {
  const students = await rows<any>(
    `SELECT s.id AS record_id, s.person_id, s.admission_no, p.first_name, p.last_name, p.photo_url
       FROM students s JOIN people p ON p.id = s.person_id AND p.school_id = s.school_id
      WHERE s.school_id = ? AND s.deleted_at IS NULL`, [schoolId]);
  const staff = await rows<any>(
    `SELECT st.id AS record_id, st.person_id, st.staff_no, p.first_name, p.last_name, p.photo_url
       FROM staff st JOIN people p ON p.id = st.person_id AND p.school_id = st.school_id
      WHERE st.school_id = ? AND st.deleted_at IS NULL`, [schoolId]);
  const school = await rows<any>(`SELECT id, name, logo_url FROM schools WHERE id = ?`, [schoolId]);
  const name = (r: any) => [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
  return [
    ...students.map((r): MediaSubject => ({ entityType: 'person', entityId: Number(r.person_id), role: 'student', recordId: Number(r.record_id), displayName: name(r), admissionNo: r.admission_no ?? null, staffNo: null, ref: r.photo_url ?? null })),
    ...staff.map((r): MediaSubject => ({ entityType: 'person', entityId: Number(r.person_id), role: 'staff', recordId: Number(r.record_id), displayName: name(r), admissionNo: null, staffNo: r.staff_no ?? null, ref: r.photo_url ?? null })),
    ...school.map((r): MediaSubject => ({ entityType: 'school_logo', entityId: Number(r.id), role: 'school', recordId: Number(r.id), displayName: String(r.name ?? ''), admissionNo: null, staffNo: null, ref: r.logo_url ?? null })),
  ];
}

/** Is this image reference one of this school's? Used before serving a file or redirect. */
export async function refBelongsToSchool(schoolId: number, ref: string): Promise<boolean> {
  const p = await rows<any>(`SELECT 1 AS ok FROM people WHERE school_id = ? AND photo_url = ? LIMIT 1`, [schoolId, ref]);
  if (p.length) return true;
  const s = await rows<any>(`SELECT 1 AS ok FROM schools WHERE id = ? AND logo_url = ? LIMIT 1`, [schoolId, ref]);
  return s.length > 0;
}

/**
 * Point a person's photo at a new reference — LOCAL databases only. Online (TiDB)
 * rows are shared by every machine and are never rewritten by the local media system.
 */
export async function setPersonPhotoRef(schoolId: number, personId: number, ref: string | null): Promise<void> {
  const mode = getDbMode();
  if (mode === 'online') throw new Error('media: refusing to rewrite photo references in the online database');
  if (mode === 'local-sqlite') {
    (await sqlite()).prepare(`UPDATE people SET photo_url = ? WHERE id = ? AND school_id = ?`).run(ref, personId, schoolId);
    return;
  }
  await query(`UPDATE people SET photo_url = ? WHERE id = ? AND school_id = ?`, [ref, personId, schoolId]);
}
