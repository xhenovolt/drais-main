// Infobip WhatsApp provider adapter — mocked HTTP, success/failure/
// missing-config shapes. Mirrors the quality bar of africastalking.ts's
// sendSMS() (every failure path caught and normalized, nothing thrown).
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendWhatsAppMessage } from '@/lib/comm/providers/infobip-whatsapp';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('sendWhatsAppMessage', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('reports missing config when neither creds nor env vars are set', async () => {
    const savedBase = process.env.INFOBIP_WHATSAPP_API_BASE_URL;
    const savedKey  = process.env.INFOBIP_WHATSAPP_API_KEY;
    delete process.env.INFOBIP_WHATSAPP_API_BASE_URL;
    delete process.env.INFOBIP_WHATSAPP_API_KEY;
    try {
      const r = await sendWhatsAppMessage('+256700000000', 'hello', 'DRAIS');
      assert.equal(r.success, false);
      assert.match(r.error, /not configured/);
    } finally {
      if (savedBase !== undefined) process.env.INFOBIP_WHATSAPP_API_BASE_URL = savedBase;
      if (savedKey  !== undefined) process.env.INFOBIP_WHATSAPP_API_KEY  = savedKey;
    }
  });

  it('rejects an invalid phone number before ever calling fetch', async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; return jsonResponse(200, {}); };
    const r = await sendWhatsAppMessage('not-a-phone', 'hello', 'sender', { baseUrl: 'x.example.com', apiKey: 'k' });
    assert.equal(r.success, false);
    assert.equal(called, false);
  });

  it('requires a sender/business number', async () => {
    const r = await sendWhatsAppMessage('+256700000000', 'hello', '', { baseUrl: 'x.example.com', apiKey: 'k' });
    assert.equal(r.success, false);
    assert.match(r.error, /sender/i);
  });

  it('parses a real Infobip success shape (verified against a live credential check this session)', async () => {
    globalThis.fetch = async (url, opts) => {
      assert.match(url, /^https:\/\/x\.example\.com\/whatsapp\/1\/message\/text$/);
      assert.equal(opts.headers['Authorization'], 'App test-key');
      const body = JSON.parse(opts.body);
      assert.equal(body.from, 'sender123');
      assert.equal(body.content.text, 'hello');
      return jsonResponse(200, {
        to: '256700000000', messageCount: 1, messageId: 'msg-1',
        status: { groupId: 1, groupName: 'PENDING', id: 26, name: 'PENDING_ENROUTE', description: 'Message sent to next instance' },
      });
    };
    const r = await sendWhatsAppMessage('+256700000000', 'hello', 'sender123', { baseUrl: 'x.example.com', apiKey: 'test-key' });
    assert.equal(r.success, true);
    assert.equal(r.messageId, 'msg-1');
  });

  it('treats a REJECTED status as a failure even on HTTP 200', async () => {
    globalThis.fetch = async () => jsonResponse(200, {
      messageId: 'msg-2',
      status: { groupId: 5, groupName: 'REJECTED', id: 8, name: 'REJECTED_PREFIX_MISSING', description: 'Number prefix missing' },
    });
    const r = await sendWhatsAppMessage('+256700000000', 'hello', 'sender', { baseUrl: 'x.example.com', apiKey: 'k' });
    assert.equal(r.success, false);
    assert.match(r.error, /Number prefix missing/);
  });

  it('surfaces the provider error text on a non-2xx response', async () => {
    globalThis.fetch = async () => jsonResponse(401, {
      requestError: { serviceException: { messageId: 'UNAUTHORIZED', text: 'Invalid login details' } },
    });
    const r = await sendWhatsAppMessage('+256700000000', 'hello', 'sender', { baseUrl: 'x.example.com', apiKey: 'bad-key' });
    assert.equal(r.success, false);
    assert.match(r.error, /Invalid login details/);
  });

  it('reports a clean error on network failure rather than throwing', async () => {
    globalThis.fetch = async () => { throw new Error('ECONNRESET'); };
    const r = await sendWhatsAppMessage('+256700000000', 'hello', 'sender', { baseUrl: 'x.example.com', apiKey: 'k' });
    assert.equal(r.success, false);
    assert.match(r.error, /ECONNRESET/);
  });

  it('per-call creds win over env vars', async () => {
    process.env.INFOBIP_WHATSAPP_API_BASE_URL = 'env.example.com';
    process.env.INFOBIP_WHATSAPP_API_KEY = 'env-key';
    let seenAuth = null;
    globalThis.fetch = async (url, opts) => {
      seenAuth = opts.headers['Authorization'];
      assert.match(url, /^https:\/\/school\.example\.com\//);
      return jsonResponse(200, { messageId: 'm', status: { groupName: 'PENDING' } });
    };
    await sendWhatsAppMessage('+256700000000', 'hi', 'sender', { baseUrl: 'school.example.com', apiKey: 'school-key' });
    assert.equal(seenAuth, 'App school-key');
  });
});
