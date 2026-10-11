import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encryptProviderConfig, decryptProviderConfig, fingerprintProviderConfig, SMS_PROVIDER_ADAPTERS, UGATEXT_API_BASE_URL, normalizeUgaTextBaseUrl } from '../providers.ts';

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

  it('validates UgaText API keys through the account balance endpoint', async () => {
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ success: true, balance_ugx: 500, sms_balance_units: 20, currency: 'UGX' }), { status: 200 });
    };
    try {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.validate({ apiKey: 'ugx_live_test' });
      assert.equal(result.ok, true);
      assert.equal(result.status, 'connected');
      assert.equal(result.balance.units, 20);
      assert.equal(request.url, `${UGATEXT_API_BASE_URL}/account/balance`);
      assert.equal(request.options.headers.Authorization, 'Bearer ugx_live_test');
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  const withFetch = async (impl, fn) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = impl;
    try { await fn(); } finally { globalThis.fetch = originalFetch; }
  };
  const queued = (extra = {}) => new Response(JSON.stringify({ success: true, message_id: 'msg_x', status: 'queued', ...extra }), { status: 202 });

  it('uses a configured UgaText sender ID instead of the default', async () => {
    let body;
    await withFetch(async (_url, options) => { body = JSON.parse(options.body); return queued(); }, async () => {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.send('0741341483', 'hi', { apiKey: 'key', senderId: 'NAKIFUMA' });
      assert.equal(result.success, true);
      assert.equal(body.senderId, 'NAKIFUMA');
    });
  });

  it('retries once with the account default when UgaText rejects a custom sender ID', async () => {
    const senders = [];
    await withFetch(async (_url, options) => {
      const b = JSON.parse(options.body);
      senders.push(b.senderId);
      return b.senderId === 'UGATEXT' ? queued() : new Response(JSON.stringify({ success: false, error: 'Sender ID not approved', code: 'INVALID_SENDER_ID' }), { status: 400 });
    }, async () => {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.send('0741341483', 'hi', { apiKey: 'key', senderId: 'UNREG' });
      assert.equal(result.success, true);
      assert.deepEqual(senders, ['UNREG', 'UGATEXT']);
      assert.equal(result.details.sender_id_used, 'UGATEXT');
    });
  });

  it('does not retry non-sender failures, and points 401s at Control Center', async () => {
    let calls = 0;
    await withFetch(async () => { calls++; return new Response(JSON.stringify({ success: false, error: 'Invalid or revoked API key.' }), { status: 401 }); }, async () => {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.send('0741341483', 'hi', { apiKey: 'old', senderId: 'UNREG' });
      assert.equal(result.success, false);
      assert.equal(calls, 1);
      assert.match(result.error, /Control Center/);
    });
  });

  it('authenticates with Client-ID + Client-Secret when no API key is set', async () => {
    let headers;
    await withFetch(async (_url, options) => { headers = options.headers; return queued(); }, async () => {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.send('0741341483', 'hi', { clientId: 'uga_x', clientSecret: ' "sk_live_y" ' });
      assert.equal(result.success, true);
      assert.equal(headers['Client-ID'], 'uga_x');
      assert.equal(headers['Client-Secret'], 'sk_live_y');
      assert.equal(headers.Authorization, undefined);
    });
  });

  it('falls back to the next UgaText host only when a host is unreachable', async () => {
    const urls = [];
    await withFetch(async (url) => {
      urls.push(url);
      if (String(url).startsWith('https://api.ugatext.com')) throw new TypeError('fetch failed (ENOTFOUND)');
      return queued();
    }, async () => {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.send('0741341483', 'hi', { apiKey: 'key', baseUrl: 'https://api.ugatext.com' });
      assert.equal(result.success, true);
      assert.deepEqual(urls, ['https://api.ugatext.com/v1/messages', `${UGATEXT_API_BASE_URL}/messages`]);
    });
  });

  it('normalises dashboard-style UgaText base URLs to the /v1 root', () => {
    assert.equal(normalizeUgaTextBaseUrl('https://www.ugatext.com/api'), 'https://www.ugatext.com/api/v1');
    assert.equal(normalizeUgaTextBaseUrl('https://www.ugatext.com/api/v1/'), 'https://www.ugatext.com/api/v1');
  });
});
