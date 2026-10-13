import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encryptProviderConfig, decryptProviderConfig, fingerprintProviderConfig, SMS_PROVIDER_ADAPTERS, UGATEXT_API_BASE_URL, normalizeUgaTextBaseUrl, checkUgaTextKey } from '../providers.ts';

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

  it('a refused key is flagged as a key problem, not a failed message, and never retried on the sender', async () => {
    let calls = 0;
    await withFetch(async () => { calls++; return new Response(JSON.stringify({ success: false, error: 'Invalid or revoked API key.' }), { status: 401, headers: { 'x-request-id': 'req_abc' } }); }, async () => {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.send('0741341483', 'hi', { apiKey: 'old', senderId: 'UNREG' });
      assert.equal(result.success, false);
      assert.equal(calls, 1, 'only one way to present the credentials is configured, so one request');
      assert.equal(result.authRejected, true);
      assert.equal(result.triedAlternateAuth, false);
      assert.equal(result.requestId, 'req_abc');
      assert.equal(result.status, 'HTTP 401');
      assert.match(result.error, /held and retried automatically/);
      assert.doesNotMatch(result.error, /update the UgaText API key/);
    });
  });

  it('when the Bearer key is refused, the same credentials are tried as Client-ID + Client-Secret', async () => {
    const seen = [];
    await withFetch(async (_url, options) => {
      const bearer = !!options.headers.Authorization;
      seen.push(bearer ? 'bearer' : 'client-pair');
      return bearer
        ? new Response(JSON.stringify({ success: false, error: 'Invalid or revoked API key.' }), { status: 401 })
        : new Response(JSON.stringify({ success: true, message_id: 'msg_alt', status: 'queued' }), { status: 202 });
    }, async () => {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.send('0741341483', 'hi', { apiKey: 'k', clientId: 'uga_x', clientSecret: 'sk_y' });
      assert.deepEqual(seen, ['bearer', 'client-pair']);
      assert.equal(result.success, true);
      assert.equal(result.messageId, 'msg_alt');
      assert.equal(result.details.auth_alternate_used, true);
    });
  });

  it('reports both presentations refused, after exactly two requests', async () => {
    let calls = 0;
    await withFetch(async () => { calls++; return new Response(JSON.stringify({ success: false, error: 'Invalid or revoked API key.' }), { status: 401 }); }, async () => {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.send('0741341483', 'hi', { apiKey: 'k', clientId: 'uga_x', clientSecret: 'sk_y' });
      assert.equal(calls, 2);
      assert.equal(result.authRejected, true);
      assert.equal(result.triedAlternateAuth, true);
    });
  });

  it('the key check asks without sending, and an unreachable gateway is not a verdict on the key', async () => {
    let asked;
    await withFetch(async (url, options) => { asked = { url: String(url), method: options?.method ?? 'GET' }; return new Response(JSON.stringify({ success: true, authenticated: true }), { status: 200, headers: { 'x-request-id': 'req_ok' } }); }, async () => {
      const r = await checkUgaTextKey({ apiKey: 'k' });
      assert.equal(r.ok, true);
      assert.equal(r.requestId, 'req_ok');
      assert.match(asked.url, /\/auth\/verify$/);
      assert.equal(asked.method, 'GET');
    });
    await withFetch(async () => new Response(JSON.stringify({ success: false, error: 'Invalid or revoked API key.' }), { status: 401 }), async () => {
      const r = await checkUgaTextKey({ apiKey: 'k' });
      assert.equal(r.ok, false);
      assert.equal(r.httpStatus, 401);
    });
    await withFetch(async () => { throw new TypeError('fetch failed'); }, async () => {
      const r = await checkUgaTextKey({ apiKey: 'k' });
      assert.equal(r.ok, false);
      assert.equal(r.httpStatus, null, 'no HTTP answer means no verdict');
    });
  });

  it('flags an UgaText rate-limit refusal and reads how long to wait', async () => {
    await withFetch(async () => new Response(JSON.stringify({ success: false, error: 'Account rate limit exceeded (60 req/min). Try again in 12s.', code: 'RATE_LIMIT_EXCEEDED' }), { status: 429 }), async () => {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.send('0741341483', 'hi', { apiKey: 'key' });
      assert.equal(result.success, false);
      assert.equal(result.rateLimited, true);
      assert.equal(result.retryAfterSeconds, 12);
    });
    await withFetch(async () => new Response(JSON.stringify({ success: false, error: 'Invalid or revoked API key.' }), { status: 401 }), async () => {
      const result = await SMS_PROVIDER_ADAPTERS.ugatext.send('0741341483', 'hi', { apiKey: 'old' });
      assert.equal(result.rateLimited, undefined);
    });
    assert.equal(SMS_PROVIDER_ADAPTERS.ugatext.defaultRateLimitPerMinute, 50);
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
