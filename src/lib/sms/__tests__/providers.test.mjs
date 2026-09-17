import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encryptProviderConfig, decryptProviderConfig, fingerprintProviderConfig, SMS_PROVIDER_ADAPTERS, UGATEXT_API_BASE_URL } from '../providers.ts';

describe('central SMS providers', () => {
  it('encrypts provider config without changing its usable values', () => {
    const config = { apiKey: 'secret-key', senderId: 'DRAIS' };
    const encrypted = encryptProviderConfig(config);
    assert.notEqual(encrypted, JSON.stringify(config));
    assert.deepEqual(decryptProviderConfig(encrypted), config);
  });

  it('requires only the fields defined by each provider', async () => {
    const yoola = await SMS_PROVIDER_ADAPTERS.yoola.validate({ apiKey: 'key' });
    const at = await SMS_PROVIDER_ADAPTERS.africas_talking.validate({ apiKey: 'key' });
    assert.equal(yoola.ok, true);
    assert.equal(at.ok, false);
    assert.match(at.message || '', /username/);
  });

  it('fingerprints field presence without hashing secret values into the fingerprint input', () => {
    assert.equal(fingerprintProviderConfig({ apiKey: 'one' }), fingerprintProviderConfig({ apiKey: 'two' }));
    assert.notEqual(fingerprintProviderConfig({ apiKey: 'one' }), fingerprintProviderConfig({}));
  });

  it('reproduces the working Yoola request shape', async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        status: 'success', message_id: 375232,
        per_recipient: [{ status: 'Success', reference: 'YOOLA-EQ6MV7', cost: 'UGX 35' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    try {
      const result = await SMS_PROVIDER_ADAPTERS.yoola.send('0741341483', 'test', { apiKey: 'key' });
      assert.equal(result.success, true);
      assert.equal(request.url, 'https://yoolasms.com/api/v1/send');
      assert.deepEqual(request.body, { api_key: 'key', phone: '256741341483', message: 'test' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('supports UgaText API-key validation without requiring wallet credentials', async () => {
    const result = await SMS_PROVIDER_ADAPTERS.ugatext.validate({ apiKey: 'ugx_live_test' });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'configured');
  });

  it('matches the successful UgaText queued-send contract', async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        success: true, message_id: 'msg_test', status: 'queued',
        recipient: '+256741341483', sender_id: 'UGATEXT', segments: 1,
        estimated_cost: 25, currency: 'UGX', mode: 'live',
      }), { status: 202, headers: { 'content-type': 'application/json' } });
    };
    try {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.send('0741341483', 'test', { apiKey: 'key' });
      assert.equal(result.success, true);
      assert.equal(result.status, 'queued');
      assert.equal(result.messageId, 'msg_test');
      assert.equal(request.url, `${UGATEXT_API_BASE_URL}/messages`);
      assert.equal(request.options.headers.Authorization, 'Bearer key');
      assert.ok(request.options.headers['Idempotency-Key']);
      assert.deepEqual(request.body, { to: '256741341483', senderId: 'UGATEXT', message: 'test' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
