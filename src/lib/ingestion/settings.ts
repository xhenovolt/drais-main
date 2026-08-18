/**
 * DRAIS import redesign, Phase B — school-level import settings.
 *
 * Per the brief: "One school's preferences must NEVER affect another
 * school" and "Dangerous operations should default to OFF unless
 * explicitly enabled." Stored via the existing generic school_settings
 * key-value table (same pattern already used for admin_phones —
 * src/app/api/admin/notification-policies/broadcast-recipients/route.ts)
 * rather than a new dedicated table, as one JSON blob under a single key.
 *
 * Every field here is actually READ by the pipeline (pipelines/students.ts,
 * the v2 route's conflictPolicy construction) — this is not a settings
 * page that stores values nobody consults.
 */
import { query } from '@/lib/db';

const SETTINGS_KEY = 'import_settings_v2';

export interface ImportSettings {
  /** Create a new student when no existing match is found. Safe — this is
   *  the whole point of an importer. Default true. */
  allowCreateNew: boolean;
  /** Overwrite fields on an ALREADY-MATCHED existing student. Listed in the
   *  brief under "things requiring explicit settings/confirmation" —
   *  default OFF. When false, a matched row is treated as a no-op (the
   *  student already exists, nothing is changed) rather than silently
   *  skipped without explanation — the report still records it. */
  allowUpdateExisting: boolean;
  /** When updating an existing student, allow changing which class/stream
   *  they're enrolled in. Default OFF — reassigning a real student's class
   *  from a bulk import is exactly the kind of dangerous mutation the
   *  brief calls out by name. */
  allowClassReassignment: boolean;
  /** Create a class/stream row automatically when a sheet references one
   *  that doesn't exist yet. Default OFF — surfaced instead as "N rows
   *  reference classes that don't exist yet" in the import plan, same
   *  missing-class UX the legacy importer already had. */
  autoCreateMissingClasses: boolean;
  /** Use worksheet-name-derived context (e.g. "S.2 Blue" -> class/stream)
   *  as a DEFAULT for rows in that sheet that don't have their own
   *  class/stream column value. Never overrides an explicit column value.
   *  Default true — this is inference shown for confirmation, not a
   *  silent mutation, so it's safe to default on. */
  allowSheetNameContext: boolean;
  /** When a fuzzy-single identity match is found (not exact, not
   *  ambiguous), still hold it for manual confirmation instead of
   *  auto-applying. Default true — the safer default; a school that
   *  trusts its data quality can turn this off to speed up review. */
  requireManualConfirmationForFuzzyMatches: boolean;
  /**
   * How to resolve a field that differs between the incoming row and an
   * already-matched existing student. Maps directly onto the pipeline's
   * existing FieldConflictPolicy. Default 'prefer-existing' — the file
   * being imported never silently overwrites what's already in DRAIS
   * unless the school explicitly says otherwise.
   */
  fieldConflictDefault: 'prefer-existing' | 'prefer-new' | 'prefer-non-empty';
}

export const DEFAULT_IMPORT_SETTINGS: ImportSettings = {
  allowCreateNew: true,
  allowUpdateExisting: false,
  allowClassReassignment: false,
  autoCreateMissingClasses: false,
  allowSheetNameContext: true,
  requireManualConfirmationForFuzzyMatches: true,
  fieldConflictDefault: 'prefer-existing',
};

function coerce(raw: Partial<ImportSettings> | null): ImportSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_IMPORT_SETTINGS };
  return { ...DEFAULT_IMPORT_SETTINGS, ...raw };
}

export async function getImportSettings(schoolId: number): Promise<ImportSettings> {
  const rows = (await query(
    `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = ? LIMIT 1`,
    [schoolId, SETTINGS_KEY],
  ).catch(() => [])) as Array<{ value_text: string | null }>;

  const raw = rows[0]?.value_text;
  if (!raw) return { ...DEFAULT_IMPORT_SETTINGS };
  try {
    return coerce(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_IMPORT_SETTINGS }; // malformed stored JSON must never break an import
  }
}

export async function setImportSettings(schoolId: number, settings: Partial<ImportSettings>): Promise<ImportSettings> {
  const merged = coerce(settings);
  const json = JSON.stringify(merged);

  const existing = (await query(
    `SELECT id FROM school_settings WHERE school_id = ? AND key_name = ? LIMIT 1`,
    [schoolId, SETTINGS_KEY],
  )) as Array<{ id: number }>;

  if (existing.length) {
    await query(`UPDATE school_settings SET value_text = ? WHERE id = ?`, [json, existing[0].id]);
  } else {
    await query(`INSERT INTO school_settings (school_id, key_name, value_text) VALUES (?, ?, ?)`, [schoolId, SETTINGS_KEY, json]);
  }
  return merged;
}
