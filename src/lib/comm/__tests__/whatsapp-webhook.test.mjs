// Infobip WhatsApp delivery-status webhook — pure auth + payload
// normalisation, mirroring billing-webhook.test.mjs's shape.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyWebhookAuth, normalizeDeliveryResult, extractResults,
} from '@/lib/comm/whatsapp-webhook';

describe('verifyWebhookAuth', () => {
  it('accepts a matching Authorization: Bearer header', () => {
    assert.equal(verifyWebhookAuth('Bearer s3cret', null, 's3cret'), true);
  });
  it('accepts a matching x-infobip-webhook-secret header', () => {
    assert.equal(verifyWebhookAuth(null, 's3cret', 's3cret'), true);
  });
  it('is case-insensitive on the Bearer prefix', () => {
    assert.equal(verifyWebhookAuth('bearer s3cret', null, 's3cret'), true);
  });
  it('rejects a wrong secret', () => {
    assert.equal(verifyWebhookAuth('Bearer wrong', null, 's3cret'), false);
  });
  it('rejects when neither header is present', () => {
    assert.equal(verifyWebhookAuth(null, null, 's3cret'), false);
  });
  it('rejects when the server secret is unset (endpoint should be disabled upstream)', () => {
    assert.equal(verifyWebhookAuth('Bearer anything', null, undefined), false);
  });
  it('rejects a secret that is a prefix/suffix of the real one (no partial match)', () => {
    assert.equal(verifyWebhookAuth('Bearer s3cre', null, 's3cret'), false);
    assert.equal(verifyWebhookAuth('Bearer s3cretX', null, 's3cret'), false);
  });
});

describe('normalizeDeliveryResult', () => {
  it('maps DELIVERED to delivered', () => {
    const r = normalizeDeliveryResult({ messageId: 'm1', status: { groupName: 'DELIVERED' } });
    assert.equal(r.status, 'delivered');
    assert.equal(r.providerMessageId, 'm1');
    assert.equal(r.errorText, null);
  });
  it('maps READ and SEEN to read', () => {
    assert.equal(normalizeDeliveryResult({ messageId: 'm1', status: { groupName: 'READ' } }).status, 'read');
    assert.equal(normalizeDeliveryResult({ messageId: 'm1', status: { groupName: 'SEEN' } }).status, 'read');
  });
  it('maps REJECTED/UNDELIVERABLE/EXPIRED to failed, with error text', () => {
    const r = normalizeDeliveryResult({
      messageId: 'm1',
      status: { groupName: 'REJECTED' },
      error: { groupName: 'ERROR', description: 'invalid number' },
    });
    assert.equal(r.status, 'failed');
    assert.equal(r.errorText, 'invalid number');
  });
  it('maps PENDING/PENDING_ENROUTE to sent (no-op, already sent)', () => {
    assert.equal(normalizeDeliveryResult({ messageId: 'm1', status: { groupName: 'PENDING' } }).status, 'sent');
  });
  it('returns null for an unrecognized group name rather than guessing', () => {
    assert.equal(normalizeDeliveryResult({ messageId: 'm1', status: { groupName: 'SOMETHING_NEW' } }), null);
  });
  it('returns null when messageId or status is missing', () => {
    assert.equal(normalizeDeliveryResult({ status: { groupName: 'DELIVERED' } }), null);
    assert.equal(normalizeDeliveryResult({ messageId: 'm1' }), null);
    assert.equal(normalizeDeliveryResult(null), null);
  });
  it('does not report error text when error.groupName is OK', () => {
    const r = normalizeDeliveryResult({ messageId: 'm1', status: { groupName: 'DELIVERED' }, error: { groupName: 'OK' } });
    assert.equal(r.errorText, null);
  });
});

describe('extractResults', () => {
  it('extracts from { results: [...] }', () => {
    assert.deepEqual(extractResults({ results: [{ a: 1 }] }), [{ a: 1 }]);
  });
  it('extracts a bare array payload', () => {
    assert.deepEqual(extractResults([{ a: 1 }]), [{ a: 1 }]);
  });
  it('returns [] for anything else', () => {
    assert.deepEqual(extractResults(null), []);
    assert.deepEqual(extractResults({}), []);
    assert.deepEqual(extractResults({ results: 'not an array' }), []);
  });
});
