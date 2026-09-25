/**
 * SMS top-ups: a school pays by mobile money (MarzPay); DRAIS adds the SMS to its allowance.
 *
 * Safety rules (each one is enforced here and tested):
 *  - Units and price are snapshotted when the purchase starts.
 *  - A payment is credited ONLY after an authenticated lookup with MarzPay says completed, live (not sandbox),
 *    UGX and the exact amount. A webhook body alone never credits anything.
 *  - Crediting happens once: status paid -> credited and the allowance increase share one transaction.
 *  - Adding SMS keeps the allowance's "since" baseline (updated_at) so earlier usage is not forgotten.
 */
import { randomUUID } from 'node:crypto';
import { getConnection, query } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { getSmsPricing } from '@/lib/control/sms-economics';
import { collectMoney, getCollection, marzConfigured } from '@/lib/payments/marzpay';
import { judgePayment, maskPhone, normalizeUgPhone, quoteTopup } from './topup-math';

export type TopupStatus = 'initiated' | 'processing' | 'paid' | 'credited' | 'failed' | 'expired' | 'review';
const FINAL: TopupStatus[] = ['credited', 'failed', 'review'];
const EXPIRE_AFTER_MIN = 30;

export async function getSchoolPrice(schoolId: number): Promise<{ priceUgx: number; topupEnabled: boolean; isOverride: boolean }> {
  const row = ((await query(`SELECT price_ugx, topup_enabled FROM sms_school_prices WHERE school_id = ? LIMIT 1`, [schoolId]).catch(() => [])) as any[])[0];
  const enabled = row ? Number(row.topup_enabled) === 1 : true;
  if (row && row.price_ugx != null && Number(row.price_ugx) > 0) return { priceUgx: Number(row.price_ugx), topupEnabled: enabled, isOverride: true };
  return { priceUgx: (await getSmsPricing()).retailPrice, topupEnabled: enabled, isOverride: false };
}

export interface CreateResult { ok: boolean; id?: number; status?: TopupStatus; units?: number; amountUgx?: number; error?: string }

export async function createTopup(p: {
  schoolId: number; userId: number | null; requestedUgx: number; phone: string; callbackUrl: string | null;
}): Promise<CreateResult> {
  if (!marzConfigured()) return { ok: false, error: 'Online payment is not set up yet. Please contact Xhenvolt.' };
  const price = await getSchoolPrice(p.schoolId);
  if (!price.topupEnabled) return { ok: false, error: 'Online SMS purchase is switched off for this school. Please contact Xhenvolt.' };
  const quote = quoteTopup(p.requestedUgx, price.priceUgx);
  if (!quote.ok) return { ok: false, error: quote.error };
  const phone = normalizeUgPhone(p.phone);
  if (!phone) return { ok: false, error: 'Enter a valid MTN or Airtel number, for example 0772 123 456' };

  // One purchase at a time per school: stops double-taps and accidental duplicate prompts on the payer's phone.
  const open = ((await query(
    `SELECT COUNT(*) n FROM sms_topups WHERE school_id = ? AND status IN ('initiated','processing') AND created_at > DATE_SUB(NOW(), INTERVAL 3 MINUTE)`,
    [p.schoolId],
  )) as any[])[0];
  if (Number(open?.n ?? 0) > 0) return { ok: false, error: 'A payment is already waiting for approval. Approve it on the phone, or wait a few minutes and try again.' };

  const reference = randomUUID();
  const ins = (await query(
    `INSERT INTO sms_topups (reference, school_id, user_id, amount_ugx, price_ugx, sms_units, phone_masked, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'initiated')`,
    [reference, p.schoolId, p.userId, quote.amountUgx, quote.priceUgx, quote.units, maskPhone(phone)],
  )) as unknown as { insertId?: number };
  const id = Number(ins?.insertId);

  const r = await collectMoney({
    amountUgx: quote.amountUgx, phone, reference,
    description: `DRAIS SMS top-up: ${quote.units.toLocaleString('en-US')} SMS`,
    callbackUrl: p.callbackUrl,
    metadata: [{ topup_id: String(id), school_id: String(p.schoolId) }],
  });
  if (!r.ok || !r.tx?.uuid) {
    await query(`UPDATE sms_topups SET status = 'failed', failure_reason = ? WHERE id = ? AND status = 'initiated'`, [(r.error || 'Could not start the payment').slice(0, 250), id]);
    return { ok: false, id, error: r.error || 'Could not start the payment. Please try again.' };
  }
  await query(
    `UPDATE sms_topups SET status = 'processing', provider_uuid = ?, provider_status = ?, provider_network = ? WHERE id = ? AND status = 'initiated'`,
    [r.tx.uuid, r.tx.status, r.tx.provider, id],
  );
  return { ok: true, id, status: 'processing', units: quote.units, amountUgx: quote.amountUgx };
}

/** Credit a confirmed payment. Returns true only for the call that actually added the SMS. */
export async function creditTopup(id: number): Promise<boolean> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.query(`SELECT school_id, sms_units, amount_ugx FROM sms_topups WHERE id = ? AND status = 'paid' FOR UPDATE`, [id]);
    const row = rows?.[0];
    if (!row) { await conn.rollback(); return false; }
    const [upd]: any = await conn.query(`UPDATE sms_topups SET status = 'credited', credited_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'paid'`, [id]);
    if (!upd?.affectedRows) { await conn.rollback(); return false; }
    await conn.query(
      `INSERT INTO sms_allocations (school_id, quota_sms, note) VALUES (?, ?, 'Online top-up')
       ON DUPLICATE KEY UPDATE quota_sms = quota_sms + VALUES(quota_sms), updated_at = updated_at`,
      [row.school_id, row.sms_units],
    );
    await conn.commit();
    await logAudit({ schoolId: Number(row.school_id), userId: null, action: 'SMS_TOPUP_CREDITED', entityType: 'sms_topup', entityId: id, details: { sms: Number(row.sms_units), amountUgx: Number(row.amount_ugx) } }).catch(() => undefined);
    return true;
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    await conn.end().catch(() => undefined);
  }
}

/**
 * Bring one purchase up to date with MarzPay and credit it if (and only if) it is truly paid.
 * Safe to call any number of times, from the webhook, the status poll and the operator's recheck button.
 */
export async function syncTopup(id: number, opts: { force?: boolean } = {}): Promise<{ status: TopupStatus; credited: boolean; failureReason: string | null }> {
  const row = ((await query(
    `SELECT id, status, provider_uuid, amount_ugx, sms_units, created_at, failure_reason FROM sms_topups WHERE id = ? LIMIT 1`, [id],
  )) as any[])[0];
  if (!row) return { status: 'failed', credited: false, failureReason: 'Not found' };
  let status = row.status as TopupStatus;
  if (status === 'paid') {                       // a previous credit attempt did not finish: finish it
    const credited = await creditTopup(id);
    return { status: credited ? 'credited' : 'paid', credited, failureReason: null };
  }
  // Final states are left alone; a failed/review purchase is re-checked only when an operator forces it.
  if (status === 'credited') return { status, credited: false, failureReason: row.failure_reason };
  if (FINAL.includes(status) && !(opts.force && (status === 'failed' || status === 'review') && row.provider_uuid)) {
    return { status, credited: false, failureReason: row.failure_reason };
  }

  if (!row.provider_uuid) {
    const ageMin = (Date.now() - new Date(row.created_at).getTime()) / 60_000;
    if (ageMin > 2) await query(`UPDATE sms_topups SET status = 'failed', failure_reason = 'The payment was never started' WHERE id = ? AND status = 'initiated'`, [id]);
    return { status: ageMin > 2 ? 'failed' : status, credited: false, failureReason: null };
  }

  const got = await getCollection(String(row.provider_uuid));
  if (!got.ok || !got.tx) return { status, credited: false, failureReason: null };   // provider unreachable: try again later

  const allowSandbox = process.env.NODE_ENV !== 'production' && process.env.MARZPAY_ALLOW_SANDBOX === '1';
  const verdict = judgePayment({
    providerStatus: got.tx.status, mode: got.tx.mode, currency: got.tx.currency, amountRaw: got.tx.amountRaw,
    expectedUgx: Number(row.amount_ugx), allowSandbox,
  });
  const sandbox = String(got.tx.status).toLowerCase() === 'sandbox' || String(got.tx.mode).toLowerCase() === 'sandbox' ? 1 : 0;

  if (verdict.kind === 'pay') {
    const moved = (await query(
      `UPDATE sms_topups SET status = 'paid', paid_at = UTC_TIMESTAMP(), provider_status = ?, provider_network = ?
        WHERE id = ? AND status IN ('initiated','processing','expired','failed','review')`,
      [got.tx.status, got.tx.provider, id],
    )) as unknown as { affectedRows?: number };
    void moved;
    const credited = await creditTopup(id);
    return { status: credited ? 'credited' : 'paid', credited, failureReason: null };
  }
  if (verdict.kind === 'fail') {
    await query(`UPDATE sms_topups SET status = 'failed', provider_status = ?, is_sandbox = ?, failure_reason = ? WHERE id = ? AND status IN ('initiated','processing','expired')`,
      [got.tx.status, sandbox, verdict.reason.slice(0, 250), id]);
    return { status: 'failed', credited: false, failureReason: verdict.reason };
  }
  if (verdict.kind === 'review') {
    await query(`UPDATE sms_topups SET status = 'review', provider_status = ?, failure_reason = ? WHERE id = ? AND status IN ('initiated','processing','expired')`,
      [got.tx.status, verdict.reason.slice(0, 250), id]);
    return { status: 'review', credited: false, failureReason: verdict.reason };
  }
  // still waiting
  const ageMin = (Date.now() - new Date(row.created_at).getTime()) / 60_000;
  if (ageMin > EXPIRE_AFTER_MIN) {
    await query(`UPDATE sms_topups SET status = 'expired', provider_status = ?, failure_reason = 'Not approved in time' WHERE id = ? AND status IN ('initiated','processing')`, [got.tx.status, id]);
    return { status: 'expired', credited: false, failureReason: 'Not approved in time' };
  }
  await query(`UPDATE sms_topups SET provider_status = ? WHERE id = ? AND status IN ('initiated','processing')`, [got.tx.status, id]);
  return { status: 'processing', credited: false, failureReason: null };
}

export async function listTopups(schoolId: number, limit = 20) {
  return (await query(
    `SELECT id, amount_ugx, sms_units, price_ugx, phone_masked, status, failure_reason, created_at, credited_at
       FROM sms_topups WHERE school_id = ? ORDER BY id DESC LIMIT ?`, [schoolId, Math.min(Math.max(limit, 1), 100)],
  ).catch(() => [])) as any[];
}
