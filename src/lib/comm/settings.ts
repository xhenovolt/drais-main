/**
 * Per-school communication settings. Auto-creates a default row the
 * first time it's read so the rest of the engine never has to handle
 * "school has no settings yet".
 */
import { query } from '@/lib/db';

export interface CommSettings {
  schoolId:         number;
  senderName:       string | null;
  prefix:           string | null;
  autoMode:         boolean;
  defaultProvider:  string;
  quietHoursStart:  string | null;
  quietHoursEnd:    string | null;
  retryAttempts:    number;
  retryDelaySecs:   number;
  providerUsername: string | null;
  providerApiKey:   string | null;
}

interface Raw {
  school_id:          number;
  sender_name:        string | null;
  prefix:             string | null;
  auto_mode:          number;
  default_provider:   string;
  quiet_hours_start:  string | null;
  quiet_hours_end:    string | null;
  retry_attempts:     number;
  retry_delay_secs:   number;
  provider_username?: string | null;
  provider_api_key?:  string | null;
}

function toSettings(r: Raw): CommSettings {
  return {
    schoolId:         r.school_id,
    senderName:       r.sender_name,
    prefix:           r.prefix,
    autoMode:         r.auto_mode === 1,
    defaultProvider:  r.default_provider,
    quietHoursStart:  r.quiet_hours_start,
    quietHoursEnd:    r.quiet_hours_end,
    retryAttempts:    r.retry_attempts,
    retryDelaySecs:   r.retry_delay_secs,
    providerUsername: r.provider_username ?? null,
    providerApiKey:   r.provider_api_key ?? null,
  };
}

export async function getCommSettings(schoolId: number): Promise<CommSettings> {
  const rows = (await query(
    `SELECT * FROM comm_settings WHERE school_id = ?`,
    [schoolId],
  )) as Raw[];
  if (rows.length) return toSettings(rows[0]);

  // Create default row on first read — keeps every caller simple.
  await query(
    `INSERT IGNORE INTO comm_settings (school_id) VALUES (?)`,
    [schoolId],
  );
  const after = (await query(
    `SELECT * FROM comm_settings WHERE school_id = ?`,
    [schoolId],
  )) as Raw[];
  return toSettings(after[0]);
}

export async function updateCommSettings(
  schoolId: number,
  patch: Partial<Omit<CommSettings, 'schoolId'>>,
): Promise<CommSettings> {
  await getCommSettings(schoolId); // ensure row exists

  const fields: string[] = [];
  const params: any[] = [];

  if (patch.senderName !== undefined)      { fields.push('sender_name = ?');        params.push(patch.senderName); }
  if (patch.prefix !== undefined)          { fields.push('prefix = ?');             params.push(patch.prefix); }
  if (patch.autoMode !== undefined)        { fields.push('auto_mode = ?');          params.push(patch.autoMode ? 1 : 0); }
  if (patch.defaultProvider !== undefined) { fields.push('default_provider = ?');   params.push(patch.defaultProvider); }
  if (patch.quietHoursStart !== undefined) { fields.push('quiet_hours_start = ?');  params.push(patch.quietHoursStart); }
  if (patch.quietHoursEnd !== undefined)   { fields.push('quiet_hours_end = ?');    params.push(patch.quietHoursEnd); }
  if (patch.retryAttempts !== undefined)   { fields.push('retry_attempts = ?');     params.push(patch.retryAttempts); }
  if (patch.retryDelaySecs !== undefined)  { fields.push('retry_delay_secs = ?');   params.push(patch.retryDelaySecs); }
  if (patch.providerUsername !== undefined){ fields.push('provider_username = ?');   params.push(patch.providerUsername || null); }
  // Keep an existing API key if the UI sends a blank (masked) value.
  if (patch.providerApiKey !== undefined && patch.providerApiKey !== '' && patch.providerApiKey !== '********') {
    fields.push('provider_api_key = ?'); params.push(patch.providerApiKey);
  }

  if (fields.length === 0) return getCommSettings(schoolId);

  params.push(schoolId);
  await query(
    `UPDATE comm_settings SET ${fields.join(', ')} WHERE school_id = ?`,
    params,
  );
  return getCommSettings(schoolId);
}

/** Return true if NOW (in server tz) falls inside the configured
 *  quiet-hours window. Quiet hours span midnight when start > end. */
export function isQuietHours(s: CommSettings, now: Date = new Date()): boolean {
  if (!s.quietHoursStart || !s.quietHoursEnd) return false;
  const [sh, sm] = s.quietHoursStart.split(':').map(Number);
  const [eh, em] = s.quietHoursEnd.split(':').map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin   = eh * 60 + em;
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // wraps midnight
  return nowMin >= startMin || nowMin < endMin;
}
