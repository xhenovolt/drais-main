import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verifyUgaTextSignature, readUgaTextEvent, describeSignatureHeader } from '../ugatext-webhook.ts';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(src, p), 'utf8');

const SECRET = 'whsec_test_secret';
const sign = (t, raw, secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;

// Body exactly as UgaText dispatched it to a live endpoint on 2026-10-11 (simulator event).
const LIVE_RAW = '{"id":"evt_1791749098091_c28fb1d4","event":"sms.delivered","delivery_id":"del_1791749098091_79027d44","created_at":"2026-10-11T20:04:58.091Z","data":{"event":"sms.delivered","event_id":"evt_test_4old6w4d","data":{"message_id":"msg_test_7qht1hk6","recipient":"256750625684","sender_id":"UGATEXT","status":"delivered","network":"MTN_UGANDA","units_used":1,"cost_ugx":25,"currency":"UGX","delivered_at":"2026-10-11T20:04:58.091Z"},"timestamp":"2026-10-11T20:04:58.091Z"}}';

describe('UgaText webhook signature', () => {
  const now = 1791749100;
  it('accepts the documented t=<ts>,v1=HMAC(secret, "<ts>.<raw body>") scheme', () => {
    assert.deepEqual(verifyUgaTextSignature(sign(now, LIVE_RAW), LIVE_RAW, SECRET, now), { ok: true, scheme: 't.body' });
  });
  it('accepts the bare-digest framings live events use, always keyed with the secret', () => {
    const hex = (payload) => createHmac('sha256', SECRET).update(payload).digest('hex');
    const b64 = createHmac('sha256', SECRET).update(LIVE_RAW).digest('base64');
    assert.deepEqual(verifyUgaTextSignature(hex(LIVE_RAW), LIVE_RAW, SECRET, now), { ok: true, scheme: 'body' });
    assert.deepEqual(verifyUgaTextSignature(`sha256=${hex(LIVE_RAW)}`, LIVE_RAW, SECRET, now), { ok: true, scheme: 'body' });
    assert.deepEqual(verifyUgaTextSignature(b64, LIVE_RAW, SECRET, now), { ok: true, scheme: 'body' });
    assert.deepEqual(verifyUgaTextSignature(hex(`${now}.${LIVE_RAW}`), LIVE_RAW, SECRET, now, undefined, String(now)), { ok: true, scheme: 'timestamp-header.body' });
    assert.equal(verifyUgaTextSignature(hex(`${now - 7200}.${LIVE_RAW}`), LIVE_RAW, SECRET, now, undefined, String(now - 7200)).ok, false);
    assert.equal(verifyUgaTextSignature(createHmac('sha256', 'whsec_other').update(LIVE_RAW).digest('hex'), LIVE_RAW, SECRET, now).ok, false);
    assert.equal(verifyUgaTextSignature('0'.repeat(64), LIVE_RAW, SECRET, now).ok, false);
    assert.equal(verifyUgaTextSignature('not-a-signature', LIVE_RAW, SECRET, now).ok, false);
  });
  it('describes a signature header without leaking it', () => {
    assert.equal(describeSignatureHeader(sign(now, LIVE_RAW)), 't=<num:10>,v1=<hex:64>');
    assert.equal(describeSignatureHeader(null), '(none)');
  });
  it('rejects a tampered body, a wrong secret, a stale timestamp and a missing/malformed header', () => {
    assert.equal(verifyUgaTextSignature(sign(now, LIVE_RAW), LIVE_RAW.replace('delivered', 'failed'), SECRET, now).ok, false);
    assert.equal(verifyUgaTextSignature(sign(now, LIVE_RAW, 'whsec_other'), LIVE_RAW, SECRET, now).ok, false);
    assert.equal(verifyUgaTextSignature(sign(now - 3600, LIVE_RAW), LIVE_RAW, SECRET, now).ok, false);
    assert.equal(verifyUgaTextSignature(null, LIVE_RAW, SECRET, now).ok, false);
    assert.equal(verifyUgaTextSignature('t=abc,v1=zz', LIVE_RAW, SECRET, now).ok, false);
    assert.equal(verifyUgaTextSignature(sign(now, LIVE_RAW), LIVE_RAW, '', now).ok, false);
  });
});

describe('UgaText webhook payload', () => {
  it('reads the live (double-wrapped) simulator event', () => {
    const e = readUgaTextEvent(JSON.parse(LIVE_RAW));
    assert.equal(e.messageId, 'msg_test_7qht1hk6');
    assert.equal(e.state, 'delivered');
    assert.equal(e.eventId, 'evt_1791749098091_c28fb1d4');
    assert.equal(e.network, 'MTN_UGANDA');
    assert.equal(e.nonMessage, false);
  });
  it('reads a single-level event and both event namespaces', () => {
    const e = readUgaTextEvent({ id: 'evt_1', event: 'message.delivered', data: { message_id: 'msg_1', recipient: '256741341483', status: 'delivered' } });
    assert.equal(e.messageId, 'msg_1');
    assert.equal(e.state, 'delivered');
  });
  it('trusts the event name over the status field for failures, and keeps the reason', () => {
    const e = readUgaTextEvent({ event: 'sms.failed', data: { message_id: 'msg_2', status: 'delivered', failure_reason: 'Absent subscriber' } });
    assert.equal(e.state, 'failed');
    assert.equal(e.reason, 'Absent subscriber');
  });
  it('treats sent/queued as pending and never guesses an unknown status', () => {
    assert.equal(readUgaTextEvent({ event: 'sms.sent', data: { message_id: 'm', status: 'sent' } }).state, 'pending');
    assert.equal(readUgaTextEvent({ event: 'sms.weird', data: { message_id: 'm', status: 'strange' } }).state, 'unknown');
  });
  it('flags non-message events so they never touch a message', () => {
    const e = readUgaTextEvent({ event: 'wallet.topup', data: { amount: 5000 } });
    assert.equal(e.nonMessage, true);
    assert.equal(e.state, 'unknown');
  });
});

describe('UgaText webhook route is safe by construction', () => {
  const route = read('app/api/comm/webhooks/ugatext/route.ts');
  const shared = read('lib/sms/delivery-report.ts');
  it('reads the signing secret from Control Center first, env only as a fallback', () => {
    assert.match(route, /decryptProviderConfig\(String\(row\.encrypted_config\)\)\.webhookSecret/);
    assert.ok(route.indexOf('webhookSecret') < route.indexOf('UGATEXT_WEBHOOK_SECRET ||'));
  });
  it('is disabled without a secret and verifies the signature before parsing or writing anything', () => {
    assert.match(route, /status: 503/);
    assert.ok(route.indexOf('verifyUgaTextSignature(header, raw') < route.indexOf('JSON.parse(raw)'));
    assert.ok(route.indexOf('status: 401') < route.indexOf('applyDeliveryReport('));
  });
  it('only confirmed outcomes change a message, and a status never regresses', () => {
    assert.match(shared, /state !== 'delivered' && state !== 'failed'\)\) return/);
    assert.match(shared, /status IN \('sent','queued'\)/);
    assert.match(shared, /delivery_confirmed_at IS NULL/);
  });
});
