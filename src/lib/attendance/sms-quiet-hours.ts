/**
 * Attendance SMS quiet hours — a school-configured window (e.g. 00:00–05:00,
 * when boarders are known to play with the biometric device overnight)
 * during which a punch-backed arrival/late SMS is suppressed. The punch
 * itself, the attendance record, and biometric evidence are completely
 * unaffected — this only gates whether a parent gets texted about it.
 *
 * Stored as a single JSON blob in school_settings (key 'attendance.
 * sms_quiet_hours'), matching the existing 'attendance.digest_mode' pattern
 * — no new table for a single per-school setting.
 */
import { query } from '@/lib/db';

export interface QuietHours {
  enabled: boolean;
  /** 'HH:MM', school-local. */
  start: string;
  end: string;
}

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, start: '00:00', end: '05:00' };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * PURE: is `localHHMM` inside the [start, end) window? Handles a window that
 * wraps past midnight (e.g. start=23:00, end=05:00) — a window where
 * start === end is treated as "no window" (never active), not "all day",
 * since that's almost certainly a misconfiguration, not an intent to mute
 * SMS around the clock.
 */
export function isWithinQuietHours(localHHMM: string, quiet: QuietHours): boolean {
  if (!quiet.enabled) return false;
  if (!TIME_RE.test(quiet.start) || !TIME_RE.test(quiet.end)) return false;
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start === end) return false;
  const now = toMinutes(localHHMM);
  if (start < end) return now >= start && now < end;
  // Wraps midnight: active from start..24:00 and 00:00..end.
  return now >= start || now < end;
}

/** School-local 'HH:MM' for a real UTC instant, given the school's offset. */
export function localHHMM(instant: Date, offsetMinutes: number): string {
  const l = new Date(instant.getTime() + offsetMinutes * 60_000);
  const hh = String(l.getUTCHours()).padStart(2, '0');
  const mm = String(l.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseQuietHours(raw: string | null | undefined): QuietHours {
  if (!raw) return DEFAULT_QUIET_HOURS;
  try {
    const p = JSON.parse(raw);
    const start = typeof p.start === 'string' && TIME_RE.test(p.start) ? p.start : DEFAULT_QUIET_HOURS.start;
    const end = typeof p.end === 'string' && TIME_RE.test(p.end) ? p.end : DEFAULT_QUIET_HOURS.end;
    return { enabled: Boolean(p.enabled), start, end };
  } catch {
    return DEFAULT_QUIET_HOURS;
  }
}

export async function getSmsQuietHours(schoolId: number): Promise<QuietHours> {
  try {
    const rows = (await query(
      `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'attendance.sms_quiet_hours' LIMIT 1`,
      [schoolId],
    )) as Array<{ value_text: string | null }>;
    return parseQuietHours(rows[0]?.value_text ?? null);
  } catch {
    return DEFAULT_QUIET_HOURS;
  }
}

export async function setSmsQuietHours(schoolId: number, quiet: QuietHours): Promise<void> {
  const clean: QuietHours = {
    enabled: Boolean(quiet.enabled),
    start: TIME_RE.test(quiet.start) ? quiet.start : DEFAULT_QUIET_HOURS.start,
    end: TIME_RE.test(quiet.end) ? quiet.end : DEFAULT_QUIET_HOURS.end,
  };
  const value = JSON.stringify(clean);
  const existing = (await query(
    `SELECT id FROM school_settings WHERE school_id = ? AND key_name = 'attendance.sms_quiet_hours' LIMIT 1`,
    [schoolId],
  )) as Array<{ id: number }>;
  if (existing[0]) {
    await query(`UPDATE school_settings SET value_text = ? WHERE id = ?`, [value, existing[0].id]);
  } else {
    await query(
      `INSERT INTO school_settings (school_id, key_name, value_text) VALUES (?, 'attendance.sms_quiet_hours', ?)`,
      [schoolId, value],
    );
  }
}
