/**
 * Admission mode resolver.
 *
 *   - 'flexible'   → the existing MVP enroll flow on /students/admit
 *                    + /students/enroll. No state machine, no review
 *                    pipeline. Default for every school.
 *   - 'structured' → the staged pipeline (applicant → review → approved
 *                    → enrolled / rejected / archived) on /admissions.
 *
 * Both modes coexist system-wide. A school's choice is stored in
 * school_settings.key_name='admission_mode'.
 */
import { query } from '@/lib/db';
import { getDbMode } from '@/lib/db/db-mode';

export type AdmissionMode = 'flexible' | 'structured';

/**
 * local-sqlite branch — Phase 7 sub-effort 36, same reasoning as rbac.ts's
 * own offline branch: query() throws in this mode, and /admissions reads
 * this on every page load (to decide whether to show the structured
 * pipeline or the "switch to structured mode" banner), so without this
 * the Admissions Pipeline page couldn't even render offline, regardless
 * of how well the pipeline's own routes are branched.
 */
export async function getAdmissionMode(schoolId: number): Promise<AdmissionMode> {
  if (getDbMode() === 'local-sqlite') {
    const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
    const db = getSqliteDb();
    const row = db.prepare(
      `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'admission_mode' LIMIT 1`
    ).get(schoolId) as { value_text: string } | undefined;
    return row?.value_text === 'structured' ? 'structured' : 'flexible';
  }

  const rows = (await query(
    `SELECT value_text FROM school_settings
      WHERE school_id = ? AND key_name = 'admission_mode'
      LIMIT 1`,
    [schoolId],
  )) as Array<{ value_text: string }>;
  const v = rows[0]?.value_text;
  return v === 'structured' ? 'structured' : 'flexible';
}

export async function setAdmissionMode(schoolId: number, mode: AdmissionMode): Promise<void> {
  if (getDbMode() === 'local-sqlite') {
    const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
    const db = getSqliteDb();
    const existing = db.prepare(
      `SELECT id FROM school_settings WHERE school_id = ? AND key_name = 'admission_mode' LIMIT 1`
    ).get(schoolId) as { id: number } | undefined;
    if (existing) {
      db.prepare(`UPDATE school_settings SET value_text = ? WHERE id = ?`).run(mode, existing.id);
    } else {
      db.prepare(`INSERT INTO school_settings (school_id, key_name, value_text) VALUES (?, 'admission_mode', ?)`).run(schoolId, mode);
    }
    return;
  }

  await query(
    `INSERT INTO school_settings (school_id, key_name, value_text)
     VALUES (?, 'admission_mode', ?)
     ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
    [schoolId, mode],
  );
}

export const ADMISSION_STATUSES = ['applicant', 'review', 'approved', 'rejected', 'enrolled', 'archived'] as const;
export type AdmissionStatus = typeof ADMISSION_STATUSES[number];

/** Legal transitions for the structured mode state machine. */
export const ADMISSION_TRANSITIONS: Record<AdmissionStatus, AdmissionStatus[]> = {
  applicant: ['review', 'archived'],
  review:    ['approved', 'rejected', 'applicant', 'archived'],
  approved:  ['enrolled', 'archived'],
  rejected:  ['review', 'archived'],
  enrolled:  ['archived'],
  archived:  ['applicant'],
};

export function canTransition(from: AdmissionStatus, to: AdmissionStatus): boolean {
  return ADMISSION_TRANSITIONS[from]?.includes(to) ?? false;
}
