/**
 * SMS Financial Control Center (P5).
 *
 * DRAIS sends via ONE platform Africa's Talking account, so the provider balance
 * is platform-level. This module gives the Control Center the economics it
 * lacked: the live provider balance, a per-school SMS ALLOCATION (quota), and
 * per-school USAGE derived from the SMS_SENT audit events (the only structured
 * usage record — logSMSActivity is a console no-op). Remaining = quota − used,
 * so one school can't quietly burn another's credits.
 *
 * Pure helpers (tested) do the maths; the async fns do I/O.
 */
import { query } from '@/lib/db';

// ── Pure maths ──────────────────────────────────────────────────────────────

/** Estimated SMS still sendable from a monetary balance at a per-SMS cost. */
export function estimatedSms(balanceAmount: number, costPerSms: number): number {
  if (!Number.isFinite(balanceAmount) || balanceAmount <= 0) return 0;
  if (!Number.isFinite(costPerSms) || costPerSms <= 0) return 0;
  return Math.floor(balanceAmount / costPerSms);
}

/** Remaining quota for a school (never negative). */
export function remainingQuota(quota: number | null | undefined, used: number): number {
  if (quota == null) return Infinity; // unallocated = no cap
  return Math.max(0, Number(quota) - Math.max(0, used));
}

/** Parse an AT balance string like "KES 1785.50" → { currency, amount }. */
export function parseBalance(raw: string | null | undefined): { currency: string; amount: number } {
  const s = String(raw ?? '').trim();
  const m = s.match(/^([A-Za-z]{3})?\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return { currency: '', amount: 0 };
  return { currency: (m[1] || '').toUpperCase(), amount: Number(m[2].replace(/,/g, '')) || 0 };
}

// ── I/O ─────────────────────────────────────────────────────────────────────

let ensured: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS sms_allocations (
         school_id   INT PRIMARY KEY,
         quota_sms   INT NOT NULL DEFAULT 0,
         note        VARCHAR(255) NULL,
         updated_by  BIGINT NULL,
         updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, [],
    ).catch(() => {});
  })();
  return ensured;
}

/** Live provider balance from Africa's Talking (platform account). */
export async function fetchProviderBalance(): Promise<{ ok: boolean; currency: string; amount: number; raw: string | null; error?: string }> {
  const username = process.env.AFRICASTALKING_USERNAME || process.env.AT_USERNAME;
  const apiKey = process.env.AFRICASTALKING_API_KEY || process.env.AT_API_KEY;
  if (!username || !apiKey) return { ok: false, currency: '', amount: 0, raw: null, error: 'Provider credentials not configured' };
  try {
    const isSandbox = username === 'sandbox';
    const host = isSandbox ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
    const res = await fetch(`${host}/version1/user?username=${encodeURIComponent(username)}`, {
      headers: { apiKey, Accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, currency: '', amount: 0, raw: null, error: `Provider HTTP ${res.status}` };
    const j = await res.json();
    const raw: string | null = j?.UserData?.balance ?? null;
    const { currency, amount } = parseBalance(raw);
    return { ok: true, currency, amount, raw };
  } catch (e: any) {
    return { ok: false, currency: '', amount: 0, raw: null, error: e?.message || 'Provider request failed' };
  }
}

// Short-lived cache so the send path can check "is the money over?" on every
// message without an Africa's Talking round-trip each time.
let _balCache: { at: number; val: Awaited<ReturnType<typeof fetchProviderBalance>> } | null = null;
export async function getProviderBalanceCached(ttlMs = 60_000): Promise<Awaited<ReturnType<typeof fetchProviderBalance>>> {
  if (_balCache && Date.now() - _balCache.at < ttlMs) return _balCache.val;
  const val = await fetchProviderBalance();
  if (val.ok) _balCache = { at: Date.now(), val }; // only cache good reads
  return val;
}

/** Per-school SMS usage (segments) from the SMS_SENT audit events. */
export async function getUsageBySchool(): Promise<Record<number, { segments: number; sends: number }>> {
  const rows = (await query(
    `SELECT school_id,
            COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(details, '$.segments')) AS UNSIGNED)), 0) AS segments,
            COUNT(*) AS sends
       FROM audit_logs
      WHERE action = 'SMS_SENT'
        AND JSON_EXTRACT(details, '$.success') = true
      GROUP BY school_id`,
  ).catch(() => [])) as any[];
  const out: Record<number, { segments: number; sends: number }> = {};
  for (const r of rows) out[Number(r.school_id)] = { segments: Number(r.segments || 0), sends: Number(r.sends || 0) };
  return out;
}

/** All per-school allocations. */
export async function getAllocations(): Promise<Record<number, { quota: number; note: string | null }>> {
  await ensureSchema();
  const rows = (await query(`SELECT school_id, quota_sms, note FROM sms_allocations`).catch(() => [])) as any[];
  const out: Record<number, { quota: number; note: string | null }> = {};
  for (const r of rows) out[Number(r.school_id)] = { quota: Number(r.quota_sms || 0), note: r.note ?? null };
  return out;
}

/** Set (upsert) a school's SMS allocation. */
export async function setAllocation(schoolId: number, quotaSms: number, updatedBy: number | null, note?: string | null): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO sms_allocations (school_id, quota_sms, note, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE quota_sms = VALUES(quota_sms), note = VALUES(note), updated_by = VALUES(updated_by)`,
    [schoolId, Math.max(0, Math.floor(quotaSms)), note ?? null, updatedBy],
  );
}

/** A single school's live SMS position — used by the send-path enforcement. */
export async function getSchoolSmsPosition(schoolId: number): Promise<{ quota: number | null; used: number; remaining: number }> {
  await ensureSchema();
  const [alloc, usage] = await Promise.all([
    query(`SELECT quota_sms FROM sms_allocations WHERE school_id = ? LIMIT 1`, [schoolId]).catch(() => []) as Promise<any[]>,
    query(
      `SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(details, '$.segments')) AS UNSIGNED)), 0) AS segments
         FROM audit_logs WHERE action = 'SMS_SENT' AND school_id = ? AND JSON_EXTRACT(details, '$.success') = true`,
      [schoolId],
    ).catch(() => [{ segments: 0 }]) as Promise<any[]>,
  ]);
  const quota = alloc[0]?.quota_sms != null ? Number(alloc[0].quota_sms) : null;
  const used = Number(usage[0]?.segments || 0);
  return { quota, used, remaining: remainingQuota(quota, used) };
}
