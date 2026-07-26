// Billing webhook — pure signature + payload normalisation (Phase 12).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature, normalizeWebhookPayload } from '@/lib/control/billing-webhook';

const sign = (body, secret) => createHmac('sha256', secret).update(body, 'utf8').digest('hex');

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ invoice_id: 5, amount: 1000, provider_ref: 'TX1' });
  it('accepts a correct signature', () => {
    assert.equal(verifyWebhookSignature(body, sign(body, 's3cret'), 's3cret'), true);
  });
  it('accepts a sha256= prefixed signature', () => {
    assert.equal(verifyWebhookSignature(body, 'sha256=' + sign(body, 's3cret'), 's3cret'), true);
  });
  it('rejects a wrong signature / secret / tampered body', () => {
    assert.equal(verifyWebhookSignature(body, sign(body, 'other'), 's3cret'), false);
    assert.equal(verifyWebhookSignature(body + ' ', sign(body, 's3cret'), 's3cret'), false);
    assert.equal(verifyWebhookSignature(body, sign(body, 's3cret'), ''), false);
    assert.equal(verifyWebhookSignature(body, null, 's3cret'), false);
  });
});

describe('normalizeWebhookPayload', () => {
  it('normalises a well-formed payload + field aliases', () => {
    const r = normalizeWebhookPayload({ invoiceId: '7', amount: '2500', transaction_id: 'MPESA-9', channel: 'mobile money' });
    assert.equal(r.ok, true);
    assert.equal(r.payment.invoiceId, 7);
    assert.equal(r.payment.amount, 2500);
    assert.equal(r.payment.providerRef, 'MPESA-9');
    assert.equal(r.payment.method, 'mobile money');
  });
  it('requires invoice_id, positive amount, and a provider ref', () => {
    assert.equal(normalizeWebhookPayload({ amount: 10, provider_ref: 'x' }).ok, false);
    assert.equal(normalizeWebhookPayload({ invoice_id: 1, amount: 0, provider_ref: 'x' }).ok, false);
    assert.equal(normalizeWebhookPayload({ invoice_id: 1, amount: 10 }).ok, false);
    assert.equal(normalizeWebhookPayload(null).ok, false);
  });
});
