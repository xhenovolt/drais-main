/**
 * Control Center — payment-gateway webhook reconciliation (Phase 12 / E-7).
 *
 * A provider-agnostic receiver: a mobile-money / bank gateway POSTs a signed
 * payment notification; we verify the HMAC signature, normalise the payload,
 * dedupe on the gateway transaction id, and record the payment — which
 * reconciles the invoice and (if paid in full) auto-reactivates the school. No
 * human in the loop.
 *
 * `verifyWebhookSignature` and `normalizeWebhookPayload` are PURE + unit-tested.
 * The DB record path reuses the audited `recordPayment` from the ledger.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { controlAudit } from '@/lib/control/auth';
import { recordPayment, paymentExistsByProviderRef } from '@/lib/control/billing';

/** PURE: HMAC-SHA256 of the raw body, timing-safe compared to the header. */
export function verifyWebhookSignature(rawBody: string, signature: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature).replace(/^sha256=/, ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface NormalizedPayment {
  invoiceId: number; amount: number; method: string; providerRef: string; reference?: string; currency?: string;
}

/** PURE: normalise a provider's payload into our payment shape (tolerant of field aliases). */
export function normalizeWebhookPayload(body: any): { ok: boolean; reason?: string; payment?: NormalizedPayment } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Invalid payload' };
  const invoiceId = Number(body.invoice_id ?? body.invoiceId);
  const amount = Number(body.amount);
  const providerRef = String(body.provider_ref ?? body.transaction_id ?? body.tx_ref ?? body.reference ?? '').trim();
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) return { ok: false, reason: 'invoice_id is required' };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'a positive amount is required' };
  if (!providerRef) return { ok: false, reason: 'provider transaction reference is required' };
  return {
    ok: true,
    payment: {
      invoiceId, amount, providerRef,
      method: String(body.method ?? body.channel ?? 'gateway').slice(0, 32),
      reference: body.reference != null ? String(body.reference) : undefined,
      currency: body.currency != null ? String(body.currency) : undefined,
    },
  };
}

/** Record a verified gateway payment idempotently → reconcile → maybe reactivate. */
export async function recordGatewayPayment(p: NormalizedPayment, ip?: string | null): Promise<{ ok: boolean; reason?: string; duplicate?: boolean; paidInFull?: boolean; newEnd?: string | null }> {
  if (await paymentExistsByProviderRef(p.providerRef)) {
    return { ok: true, duplicate: true }; // already processed — idempotent no-op
  }
  const res = await recordPayment({
    invoiceId: p.invoiceId, amount: p.amount, method: p.method,
    reference: p.reference, providerRef: p.providerRef, operatorId: null, ip,
  });
  if (!res.ok) return res;
  await controlAudit(null, 'gateway_payment_received', `invoices:${p.invoiceId}`,
    { amount: p.amount, method: p.method, provider_ref: p.providerRef, paid_in_full: res.paidInFull, new_end: res.newEnd }, ip ?? null);
  return res;
}
