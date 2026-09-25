/**
 * SMS usage ledger — one shared place every send path records into and checks against.
 *
 * remaining = allocation (sms_allocations.quota_sms) - segments used SINCE the allocation was set.
 * Setting an allocation is a fresh grant ("we give them 6000"), so earlier sends don't count
 * against it; every send after it does.
 */
import { query } from '@/lib/db';

// GSM 03.38 basic set. Characters in the extension table cost 2 septets.
const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'.split(''),
);
const GSM_EXT = new Set('^{}\\[~]|€'.split(''));

/**
 * Billable SMS segments for a message. GSM-7 text: 160 chars single, 153 per part when
 * concatenated. Anything outside GSM-7 (Arabic, emoji, curly quotes) is UCS-2: 70 / 67.
 */
export function smsSegments(text: string): number {
  const s = String(text ?? '');
  if (s.length === 0) return 1;
  let septets = 0;
  let ucs2 = false;
  for (const ch of s) {
    if (GSM_BASIC.has(ch)) septets += 1;
    else if (GSM_EXT.has(ch)) septets += 2;
    else { ucs2 = true; break; }
  }
  if (ucs2) {
    const units = s.length; // UTF-16 code units, which is what UCS-2 SMS counts
    return units <= 70 ? 1 : Math.ceil(units / 67);
  }
  return septets <= 160 ? 1 : Math.ceil(septets / 153);
}

/** Remaining allowance (never negative); null quota = no cap. */
export function remainingFrom(quota: number | null, used: number): number | null {
  if (quota == null) return null;
  return Math.max(0, quota - Math.max(0, used));
}

export type SmsSource = 'single' | 'broadcast' | 'attendance' | 'dispatch' | 'reminder' | 'otp' | 'other';

/**
 * Append a usage row. NEVER throws: recording must not break a message that was already sent.
 * Only successful sends are charged against the allowance.
 */
export async function recordSmsUsage(p: {
  schoolId: number; source: SmsSource; body: string; success?: boolean; ref?: string | null;
}): Promise<void> {
  if (p.success === false) return;
  try {
    await query(
      `INSERT IGNORE INTO sms_usage_events (school_id, source, ref, segments, success) VALUES (?, ?, ?, ?, 1)`,
      [p.schoolId, p.source, p.ref ?? null, smsSegments(p.body)],
    );
  } catch (e: any) {
    console.warn('[sms/usage] could not record usage:', e?.message);
  }
}

export interface SmsPosition { quota: number | null; used: number; remaining: number | null; since: string | null }

/** A school's live position. `remaining` is null when the school has no cap. */
export async function getSmsPosition(schoolId: number): Promise<SmsPosition> {
  const alloc = ((await query(
    `SELECT quota_sms, updated_at FROM sms_allocations WHERE school_id = ? LIMIT 1`, [schoolId],
  ).catch(() => [])) as any[])[0];
  const quota = alloc?.quota_sms != null ? Number(alloc.quota_sms) : null;
  const since = alloc?.updated_at ?? null;
  const rows = (await query(
    since
      ? `SELECT COALESCE(SUM(segments), 0) AS used FROM sms_usage_events WHERE school_id = ? AND success = 1 AND created_at >= ?`
      : `SELECT COALESCE(SUM(segments), 0) AS used FROM sms_usage_events WHERE school_id = ? AND success = 1`,
    since ? [schoolId, since] : [schoolId],
  ).catch(() => [{ used: 0 }])) as any[];
  const used = Number(rows[0]?.used || 0);
  return { quota, used, remaining: remainingFrom(quota, used), since: since ? new Date(since).toISOString() : null };
}
