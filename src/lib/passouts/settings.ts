/**
 * Pass-out module settings — stored in the shared school_settings key/value
 * table (no new tables, no hardcoded behaviour).
 *
 * Keys (all under the `passout.` prefix):
 *   passout.notifications_disabled  '1' → no pass-out SMS at all
 *   passout.notify_exit             '1' (default) → SMS guardian AFTER gate exit
 *   passout.notify_return           '1' → SMS guardian when learner returns
 *   passout.emergency_only          '1' → only emergency/medical passes notify
 *   passout.approval_mode           'single' (default) | 'two_step'
 *
 * smsAllowed() is a PURE function — exported for tests.
 */
import { query } from '@/lib/db';

export interface PassoutSettings {
  notifications_disabled: boolean;
  notify_exit: boolean;
  notify_return: boolean;
  emergency_only: boolean;
  approval_mode: 'single' | 'two_step';
}

export const DEFAULT_PASSOUT_SETTINGS: PassoutSettings = {
  notifications_disabled: false,
  notify_exit: true,
  notify_return: false,
  emergency_only: false,
  approval_mode: 'single',
};

const KEYS: Record<keyof PassoutSettings, string> = {
  notifications_disabled: 'passout.notifications_disabled',
  notify_exit: 'passout.notify_exit',
  notify_return: 'passout.notify_return',
  emergency_only: 'passout.emergency_only',
  approval_mode: 'passout.approval_mode',
};

export async function getPassoutSettings(schoolId: number): Promise<PassoutSettings> {
  const out: PassoutSettings = { ...DEFAULT_PASSOUT_SETTINGS };
  try {
    const rows = (await query(
      `SELECT key_name, value_text FROM school_settings WHERE school_id = ? AND key_name LIKE 'passout.%'`,
      [schoolId],
    )) as Array<{ key_name: string; value_text: string | null }>;
    const map = new Map(rows.map(r => [r.key_name, r.value_text]));
    const bool = (k: string, dflt: boolean) => (map.has(k) ? map.get(k) === '1' : dflt);
    out.notifications_disabled = bool(KEYS.notifications_disabled, out.notifications_disabled);
    out.notify_exit = bool(KEYS.notify_exit, out.notify_exit);
    out.notify_return = bool(KEYS.notify_return, out.notify_return);
    out.emergency_only = bool(KEYS.emergency_only, out.emergency_only);
    const mode = map.get(KEYS.approval_mode);
    if (mode === 'two_step' || mode === 'single') out.approval_mode = mode;
  } catch { /* defaults */ }
  return out;
}

export async function savePassoutSettings(schoolId: number, patch: Partial<PassoutSettings>): Promise<void> {
  for (const [field, keyName] of Object.entries(KEYS) as Array<[keyof PassoutSettings, string]>) {
    if (patch[field] === undefined) continue;
    const value = field === 'approval_mode' ? String(patch[field]) : (patch[field] ? '1' : '0');
    const existing = (await query(
      `SELECT id FROM school_settings WHERE school_id = ? AND key_name = ? LIMIT 1`,
      [schoolId, keyName],
    )) as Array<{ id: number }>;
    if (existing[0]) {
      await query(`UPDATE school_settings SET value_text = ? WHERE id = ?`, [value, existing[0].id]);
    } else {
      await query(`INSERT INTO school_settings (school_id, key_name, value_text) VALUES (?, ?, ?)`, [schoolId, keyName, value]);
    }
  }
}

/** PURE — should this pass-out generate an SMS of the given kind? */
export function smsAllowed(
  settings: PassoutSettings,
  po: { is_emergency?: number | boolean; is_medical?: number | boolean },
  kind: 'exit' | 'return',
): boolean {
  if (settings.notifications_disabled) return false;
  if (kind === 'exit' && !settings.notify_exit) return false;
  if (kind === 'return' && !settings.notify_return) return false;
  if (settings.emergency_only && !(Number(po.is_emergency) || Number(po.is_medical))) return false;
  return true;
}

/** PURE — approval-workflow transition. Given the current row + mode + actor,
 *  what happens on an "approve" action? Never lets the same user complete
 *  both steps of a two-step approval. */
export function nextApprovalState(
  po: { status: string; first_approved_by: number | null },
  mode: 'single' | 'two_step',
  actorUserId: number,
): { ok: boolean; final: boolean; reason?: string } {
  if (po.status !== 'pending') return { ok: false, final: false, reason: `Cannot approve a ${po.status} pass-out` };
  if (mode === 'single') return { ok: true, final: true };
  if (po.first_approved_by == null) return { ok: true, final: false }; // step 1 of 2
  if (Number(po.first_approved_by) === actorUserId) {
    return { ok: false, final: false, reason: 'Second approval must come from a different user' };
  }
  return { ok: true, final: true }; // step 2 of 2
}
