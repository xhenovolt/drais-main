/**
 * SMS top-up rules — pure functions (no DB, no network), so every money decision is unit-tested.
 */

export const MIN_TOPUP_UGX = 500;          // MarzPay's Uganda minimum
export const MAX_TOPUP_UGX = 10_000_000;   // MarzPay's Uganda maximum

export interface TopupQuote { ok: true; amountUgx: number; units: number; priceUgx: number }
export type TopupQuoteResult = TopupQuote | { ok: false; error: string };

/**
 * What a school gets for money. The school is charged exactly units × price (rounded up to a whole shilling),
 * never more than they typed, so there is no unspent remainder to argue about:
 *   300,000 at 30/SMS -> 10,000 SMS for 300,000.   300,005 at 30 -> 10,000 SMS for 300,000.
 */
export function quoteTopup(requestedUgx: number, priceUgx: number): TopupQuoteResult {
  if (!Number.isFinite(requestedUgx) || !Number.isFinite(priceUgx) || priceUgx <= 0) return { ok: false, error: 'Invalid amount or price' };
  const requested = Math.floor(requestedUgx);
  if (requested < MIN_TOPUP_UGX) return { ok: false, error: `The minimum top-up is UGX ${MIN_TOPUP_UGX.toLocaleString()}` };
  if (requested > MAX_TOPUP_UGX) return { ok: false, error: `The maximum single top-up is UGX ${MAX_TOPUP_UGX.toLocaleString()}` };
  const units = Math.floor(requested / priceUgx);
  if (units < 1) return { ok: false, error: `That is less than one SMS at UGX ${priceUgx} each` };
  const charge = Math.ceil(units * priceUgx);
  if (charge < MIN_TOPUP_UGX) return { ok: false, error: `The minimum top-up is UGX ${MIN_TOPUP_UGX.toLocaleString()}` };
  return { ok: true, amountUgx: Math.min(charge, requested), units, priceUgx };
}

/** Uganda mobile number -> +2567XXXXXXXX, or null. Accepts 07…, 7…, 256…, +256…, with spaces/dashes. */
export function normalizeUgPhone(input: string | null | undefined): string | null {
  let d = String(input ?? '').replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('0')) d = `256${d.slice(1)}`;
  else if (/^7\d{8}$/.test(d) || /^3\d{8}$/.test(d)) d = `256${d}`;
  return /^256[37]\d{8}$/.test(d) ? `+${d}` : null;
}

export const maskPhone = (p: string | null | undefined): string => {
  const s = String(p ?? '');
  return s.length < 8 ? '' : `${s.slice(0, 6)}***${s.slice(-3)}`;
};

export type ProviderState = 'completed' | 'failed' | 'pending' | 'sandbox' | 'unknown';

/** MarzPay statuses -> ours. Anything unrecognised stays 'unknown' (never guessed as paid). */
export function normalizeProviderStatus(raw: string | null | undefined): ProviderState {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'completed' || s === 'successful' || s === 'success') return 'completed';
  if (s === 'failed' || s === 'cancelled' || s === 'canceled' || s === 'rejected' || s === 'expired') return 'failed';
  if (s === 'processing' || s === 'pending' || s === 'initiated' || s === 'queued') return 'pending';
  if (s === 'sandbox') return 'sandbox';
  return 'unknown';
}

export type Verdict =
  | { kind: 'pay' }
  | { kind: 'wait' }
  | { kind: 'fail'; reason: string }
  | { kind: 'review'; reason: string };

/**
 * The ONLY rule that lets money become SMS. A payment is credited only when the provider itself
 * (authenticated lookup, not a webhook body) says completed, in live mode, in UGX, for exactly the amount we asked for.
 */
export function judgePayment(p: {
  providerStatus: string | null | undefined;
  mode?: string | null;
  currency?: string | null;
  amountRaw?: number | null;
  expectedUgx: number;
  allowSandbox?: boolean;
}): Verdict {
  const state = normalizeProviderStatus(p.providerStatus);
  const sandbox = state === 'sandbox' || String(p.mode ?? '').toLowerCase() === 'sandbox';
  if (sandbox && !p.allowSandbox) return { kind: 'fail', reason: 'Sandbox payment - no real money moved, so no SMS were added' };
  if (state === 'failed') return { kind: 'fail', reason: 'The mobile money payment was not completed' };
  if (state === 'pending' || state === 'unknown') return { kind: 'wait' };
  // completed (or sandbox explicitly allowed for testing)
  if (p.currency && p.currency.toUpperCase() !== 'UGX') return { kind: 'review', reason: `Paid in ${p.currency}, expected UGX` };
  if (p.amountRaw == null || Number(p.amountRaw) !== p.expectedUgx) {
    return { kind: 'review', reason: `Amount paid (${p.amountRaw ?? 'unknown'}) does not match the amount requested (${p.expectedUgx})` };
  }
  return { kind: 'pay' };
}

/** HMAC-SHA256 webhook signature: header `t=<ts>,v1=<hex>` over `${ts}.${rawBody}`. Pure given the crypto function. */
export function parseSignatureHeader(header: string | null | undefined): { t: string; v1: string } | null {
  const m = /t=(\d+)\s*,\s*v1=([0-9a-fA-F]+)/.exec(String(header ?? ''));
  return m ? { t: m[1], v1: m[2].toLowerCase() } : null;
}
