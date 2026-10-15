/**
 * Control Center SMS — limits a super admin sets, and sending through the
 * platform's ACTIVE provider (the same one schools use, chosen in SMS Providers).
 *
 * Before this, test SMS were capped at a hardcoded "1 per operator per 10 minutes"
 * that nobody could change, and the /control/sms test box sent through Africa's
 * Talking from environment variables — not the active provider — so a test said
 * nothing about whether real school messages would go out.
 *
 * Limits live in platform_settings ('control_sms_limits') and are edited in
 * Control Center → Compose SMS (super admins only, permission sms.limits).
 */
import { query } from '@/lib/control/db';
import { getSetting, setSetting } from '@/lib/control/platform-settings';
import { getActiveCentralId, recordProviderSend } from '@/lib/sms/school-routing';
import { getSmsProviderForTest } from '@/lib/control/sms-providers';
import { sendWithAdapter, SMS_PROVIDER_ADAPTERS } from '@/lib/sms/providers';
import type { ControlUser } from '@/lib/control/auth';

export interface SmsLimits {
  /** Test SMS (SMS page and provider tests): how many per operator per window. 0 = unlimited. */
  testPerWindow: number;
  testWindowMinutes: number;
  /** Compose: recipients in one send. */
  composeMaxRecipients: number;
  /** Compose: messages (recipients) per operator per day. 0 = unlimited. */
  composePerDay: number;
  /** Longest message, in characters (a 160-character SMS is one part; longer ones are sent as several). */
  maxMessageLength: number;
  /** Super admins are not counted against the limits above. */
  superAdminUnlimited: boolean;
}

export const DEFAULT_SMS_LIMITS: SmsLimits = {
  testPerWindow: 10, testWindowMinutes: 10, composeMaxRecipients: 100, composePerDay: 500,
  maxMessageLength: 612, superAdminUnlimited: true,
};

const KEY = 'control_sms_limits';
const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

export function sanitizeLimits(v: any): SmsLimits {
  const d = DEFAULT_SMS_LIMITS;
  return {
    testPerWindow: clampInt(v?.testPerWindow, 0, 1000, d.testPerWindow),
    testWindowMinutes: clampInt(v?.testWindowMinutes, 1, 1440, d.testWindowMinutes),
    composeMaxRecipients: clampInt(v?.composeMaxRecipients, 1, 1000, d.composeMaxRecipients),
    composePerDay: clampInt(v?.composePerDay, 0, 100000, d.composePerDay),
    maxMessageLength: clampInt(v?.maxMessageLength, 70, 1530, d.maxMessageLength),
    superAdminUnlimited: v?.superAdminUnlimited === undefined ? d.superAdminUnlimited : !!v.superAdminUnlimited,
  };
}

export async function getSmsLimits(): Promise<SmsLimits> {
  const raw = await getSetting(KEY).catch(() => null);
  if (!raw) return DEFAULT_SMS_LIMITS;
  try { return sanitizeLimits(JSON.parse(raw)); } catch { return DEFAULT_SMS_LIMITS; }
}

export async function setSmsLimits(v: unknown): Promise<SmsLimits> {
  const limits = sanitizeLimits(v);
  await setSetting(KEY, JSON.stringify(limits));
  return limits;
}

const exempt = (user: ControlUser, l: SmsLimits) => l.superAdminUnlimited && user.role === 'XHENVOLT_SUPER_ADMIN';

/** Null when allowed; otherwise the reason. Counts both kinds of test the operator sent. */
export async function checkTestLimit(user: ControlUser): Promise<string | null> {
  const l = await getSmsLimits();
  if (exempt(user, l) || l.testPerWindow === 0) return null;
  const r = (await query(
    `SELECT COUNT(*) AS n FROM control_audit_logs
      WHERE user_id = ? AND action IN ('sms_test', 'sms_provider_test') AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [user.id, l.testWindowMinutes],
  ).catch(() => [{ n: 0 }])) as any[];
  return Number(r[0]?.n || 0) >= l.testPerWindow
    ? `Test limit reached: ${l.testPerWindow} per ${l.testWindowMinutes} minute${l.testWindowMinutes === 1 ? '' : 's'}. A super admin can change this in Compose SMS → Limits.`
    : null;
}

/** Recipients this operator has sent to today via Compose. */
export async function composeUsedToday(userId: number): Promise<number> {
  const r = (await query(
    `SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.sent')) AS UNSIGNED)), 0) AS n
       FROM control_audit_logs WHERE user_id = ? AND action = 'sms_compose' AND created_at >= CURDATE()`,
    [userId],
  ).catch(() => [{ n: 0 }])) as any[];
  return Number(r[0]?.n || 0);
}

export async function composeAllowance(user: ControlUser): Promise<{ limits: SmsLimits; usedToday: number; remainingToday: number | null }> {
  const limits = await getSmsLimits();
  const usedToday = await composeUsedToday(user.id);
  const unlimited = exempt(user, limits) || limits.composePerDay === 0;
  return { limits, usedToday, remainingToday: unlimited ? null : Math.max(0, limits.composePerDay - usedToday) };
}

/** Uganda numbers as the providers expect them (2567XXXXXXXX), or null. */
export function normalizeUgPhone(raw: string): string | null {
  const d = String(raw || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (/^0\d{9}$/.test(d)) return `256${d.slice(1)}`;
  if (/^256\d{9}$/.test(d)) return d;
  if (/^7\d{8}$/.test(d)) return `256${d}`;
  return null;
}

/** Split pasted text into valid, de-duplicated numbers and the entries that are not numbers. */
export function parseRecipients(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = []; const invalid: string[] = [];
  for (const part of String(text || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const n = normalizeUgPhone(part);
    if (n) { if (!valid.includes(n)) valid.push(n); } else invalid.push(part);
  }
  return { valid, invalid };
}

export interface ActiveProvider { id: number; type: string; name: string; status: string | null }

export async function activeProvider(): Promise<ActiveProvider | null> {
  const id = await getActiveCentralId();
  if (!id) return null;
  const r = ((await query(`SELECT id, provider_type, display_name, status FROM sms_provider_configs WHERE id = ? LIMIT 1`, [id]).catch(() => [])) as any[])[0];
  if (!r) return null;
  return { id, type: r.provider_type, name: r.display_name || SMS_PROVIDER_ADAPTERS[r.provider_type as keyof typeof SMS_PROVIDER_ADAPTERS]?.displayName || r.provider_type, status: r.status ?? null };
}

export interface SendOutcome { phone: string; ok: boolean; messageId: string | null; error: string | null }

/**
 * Send one message to each number through the active provider, one at a time.
 * A per-minute "rate limit" answer waits the time the provider asks for (max 30s)
 * and retries once. Every send is recorded against the provider like school traffic.
 */
export async function sendThroughActiveProvider(numbers: string[], message: string, senderId?: string | null): Promise<{ provider: ActiveProvider | null; results: SendOutcome[] }> {
  const provider = await activeProvider();
  if (!provider) return { provider: null, results: numbers.map((phone) => ({ phone, ok: false, messageId: null, error: 'No active SMS provider' })) };
  const p = await getSmsProviderForTest(provider.id);
  if (!p) return { provider, results: numbers.map((phone) => ({ phone, ok: false, messageId: null, error: 'Active provider could not be loaded' })) };
  const config = { ...p.config, ...(senderId ? { senderId } : {}) };
  const results: SendOutcome[] = [];
  for (const phone of numbers) {
    let r = await sendWithAdapter(p.providerType, phone, message, config);
    const wait = /rate limit/i.test(r.error || '') ? Number((r.error || '').match(/in (\d+)s/)?.[1] || 5) : 0;
    if (!r.success && wait > 0 && wait <= 30) {
      await new Promise((res) => setTimeout(res, wait * 1000 + 250));
      r = await sendWithAdapter(p.providerType, phone, message, config);
    }
    await recordProviderSend(provider.id, p.providerType, phone, r, null).catch(() => undefined);
    results.push({ phone, ok: !!r.success, messageId: r.messageId || null, error: r.success ? null : (r.error || 'Provider rejected the message') });
  }
  return { provider, results };
}
