/**
 * Per-school visibility toggles for what the parent portal exposes.
 * Backed by school_settings (key_name / value_text), same store used elsewhere.
 *
 * Defaults are chosen from the product brief: parents SHOULD see fees by
 * default, but a school can switch it off (key 'parent_finance_visibility').
 */
import { query } from '@/lib/db';

async function boolSetting(schoolId: number, key: string, def: boolean): Promise<boolean> {
  try {
    const rows = (await query(
      `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = ? LIMIT 1`,
      [schoolId, key],
    )) as Array<{ value_text: string }>;
    if (!rows.length || rows[0].value_text == null) return def;
    return String(rows[0].value_text).toLowerCase() === 'true';
  } catch {
    return def; // schema drift / missing table → fall back to default
  }
}

/** Whether parents may see fee balance + payment history for this school. Default ON. */
export function financeVisibleToParents(schoolId: number): Promise<boolean> {
  return boolSetting(schoolId, 'parent_finance_visibility', true);
}
