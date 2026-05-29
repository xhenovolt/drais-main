/**
 * CAFE — per-school settings (academic mode + defaults).
 *
 * One row per school in `school_academic_settings`. Auto-created on first
 * read with mode='traditional' so the table is "always there" for every
 * school without a backfill migration.
 */
import { query } from '@/lib/db';
import type { SchoolAcademicSettings, SchoolSettingsInput, AcademicMode } from './types';

interface Row {
  school_id: number; academic_mode: AcademicMode;
  default_framework_id: number | null;
  promotion_rule_json: string | null;
  default_transcript_template_id: number | null;
  notes: string | null;
  updated_at: string;
}

function rowToSettings(r: Row): SchoolAcademicSettings {
  let promotion: Record<string, unknown> | null = null;
  if (r.promotion_rule_json) {
    try { promotion = typeof r.promotion_rule_json === 'object' ? r.promotion_rule_json : JSON.parse(String(r.promotion_rule_json)); }
    catch { promotion = null; }
  }
  return {
    schoolId:           Number(r.school_id),
    academicMode:       r.academic_mode,
    defaultFrameworkId: r.default_framework_id == null ? null : Number(r.default_framework_id),
    promotionRuleJson:  promotion,
    defaultTranscriptTemplateId: r.default_transcript_template_id == null ? null : Number(r.default_transcript_template_id),
    notes:              r.notes,
    updatedAt:          r.updated_at,
  };
}

export async function getSchoolSettings(schoolId: number): Promise<SchoolAcademicSettings> {
  const rows = (await query(
    `SELECT * FROM school_academic_settings WHERE school_id = ? LIMIT 1`,
    [schoolId],
  )) as Row[];
  if (rows.length) return rowToSettings(rows[0]);

  // Lazy create — INSERT IGNORE + re-read so concurrent calls don't crash.
  await query(
    `INSERT IGNORE INTO school_academic_settings (school_id, academic_mode) VALUES (?, 'traditional')`,
    [schoolId],
  );
  const after = (await query(
    `SELECT * FROM school_academic_settings WHERE school_id = ? LIMIT 1`,
    [schoolId],
  )) as Row[];
  return rowToSettings(after[0]);
}

export async function updateSchoolSettings(args: {
  schoolId: number; input: SchoolSettingsInput;
}): Promise<SchoolAcademicSettings> {
  const { schoolId, input } = args;
  // Ensure row exists.
  await getSchoolSettings(schoolId);

  const sets: string[] = []; const params: unknown[] = [];
  if (input.academicMode               !== undefined) { sets.push('academic_mode = ?');           params.push(input.academicMode); }
  if (input.defaultFrameworkId         !== undefined) { sets.push('default_framework_id = ?');    params.push(input.defaultFrameworkId); }
  if (input.defaultTranscriptTemplateId !== undefined) { sets.push('default_transcript_template_id = ?'); params.push(input.defaultTranscriptTemplateId); }
  if (input.notes                      !== undefined) { sets.push('notes = ?');                   params.push(input.notes); }
  if (sets.length) {
    params.push(schoolId);
    await query(
      `UPDATE school_academic_settings SET ${sets.join(', ')} WHERE school_id = ?`,
      params,
    );
  }
  return getSchoolSettings(schoolId);
}
