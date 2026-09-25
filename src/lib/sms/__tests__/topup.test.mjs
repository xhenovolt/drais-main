// SMS top-ups via MarzPay: the money rules.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { quoteTopup, normalizeUgPhone, judgePayment, normalizeProviderStatus, maskPhone, parseSignatureHeader, MIN_TOPUP_UGX } from '@/lib/sms/topup-math.ts';
import { readTransaction, verifyWebhookSignature } from '@/lib/payments/marzpay.ts';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

describe('what money buys', () => {
  it('UGX 300,000 at UGX 30 per SMS = 10,000 SMS (the example from the brief)', () => {
    const q = quoteTopup(300_000, 30);
    assert.deepEqual(q, { ok: true, amountUgx: 300_000, units: 10_000, priceUgx: 30 });
  });
  it('per-school prices change the quantity', () => {
    assert.equal(quoteTopup(300_000, 25).units, 12_000);
    assert.equal(quoteTopup(300_000, 40).units, 7_500);
  });
  it('the school is never charged more than it typed and there is no leftover: 300,005 -> 10,000 SMS for 300,000', () => {
    const q = quoteTopup(300_005, 30);
    assert.equal(q.units, 10_000); assert.equal(q.amountUgx, 300_000);
    for (const [req, price] of [[12_345, 30], [999_999, 27.5], [500, 30], [77_777, 33]]) {
      const r = quoteTopup(req, price);
      if (r.ok) assert.ok(r.amountUgx <= req && r.amountUgx >= r.units * price - 1e-9, `${req}@${price}`);
    }
  });
  it('rejects amounts below the provider minimum, above the maximum, and less than one SMS', () => {
    assert.match(quoteTopup(499, 30).error, /minimum/);
    assert.match(quoteTopup(10_000_001, 30).error, /maximum/);
    assert.match(quoteTopup(MIN_TOPUP_UGX, 600).error, /less than one SMS/);
    assert.ok(!quoteTopup(NaN, 30).ok); assert.ok(!quoteTopup(1000, 0).ok); assert.ok(!quoteTopup(1000, -5).ok);
  });
});

describe('phone numbers', () => {
  it('accepts common Ugandan formats and normalises them', () => {
    for (const p of ['0772123456', '0772 123 456', '772123456', '256772123456', '+256772123456', '+256-772-123-456']) assert.equal(normalizeUgPhone(p), '+256772123456', p);
    assert.equal(normalizeUgPhone('0702123456'), '+256702123456');
  });
  it('rejects junk', () => {
    for (const p of ['', 'abc', '12345', '0172123456', '+254712345678', '07721234567', null, undefined]) assert.equal(normalizeUgPhone(p), null, String(p));
  });
  it('masks the number for storage', () => assert.equal(maskPhone('+256772123456'), '+25677***456'));
});

describe('the only rule that turns a payment into SMS', () => {
  const ok = { providerStatus: 'completed', mode: 'live', currency: 'UGX', amountRaw: 300_000, expectedUgx: 300_000 };
  it('completed + live + UGX + exact amount = pay', () => assert.deepEqual(judgePayment(ok), { kind: 'pay' }));
  it('processing / pending / unknown = keep waiting, never credit', () => {
    for (const s of ['processing', 'pending', 'initiated', 'weird-new-status', null]) assert.equal(judgePayment({ ...ok, providerStatus: s }).kind, 'wait', String(s));
  });
  it('failed / cancelled / rejected = fail', () => {
    for (const s of ['failed', 'cancelled', 'rejected']) assert.equal(judgePayment({ ...ok, providerStatus: s }).kind, 'fail', s);
  });
  it('SANDBOX payments never credit (no real money moved)', () => {
    assert.equal(judgePayment({ ...ok, providerStatus: 'sandbox' }).kind, 'fail');
    assert.equal(judgePayment({ ...ok, mode: 'sandbox' }).kind, 'fail');
    assert.equal(judgePayment({ ...ok, providerStatus: 'sandbox', allowSandbox: true }).kind, 'pay', 'only when explicitly allowed outside production');
  });
  it('a wrong amount or currency is held for review, never credited', () => {
    assert.equal(judgePayment({ ...ok, amountRaw: 30_000 }).kind, 'review');
    assert.equal(judgePayment({ ...ok, amountRaw: 999_999 }).kind, 'review');
    assert.equal(judgePayment({ ...ok, amountRaw: null }).kind, 'review');
    assert.equal(judgePayment({ ...ok, currency: 'KES' }).kind, 'review');
  });
  it('provider status vocabulary is normalised, never guessed as paid', () => {
    assert.equal(normalizeProviderStatus('COMPLETED'), 'completed');
    assert.equal(normalizeProviderStatus('processing'), 'pending');
    assert.equal(normalizeProviderStatus('nonsense'), 'unknown');
  });
});

describe('MarzPay payloads and webhook signatures', () => {
  it('reads the create/get response and the webhook payload', () => {
    const create = readTransaction({ status: 'success', data: { transaction: { uuid: 'u-1', reference: 'r-1', status: 'processing' }, collection: { amount: { raw: 1000, currency: 'UGX' }, provider: 'mtn', mode: 'live' } } });
    assert.deepEqual([create.uuid, create.reference, create.status, create.amountRaw, create.currency, create.mode], ['u-1', 'r-1', 'processing', 1000, 'UGX', 'live']);
    const hook = readTransaction({ event_type: 'collection.completed', transaction: { uuid: 'u-2', reference: 'r-2', status: 'completed', amount: { raw: 10000, currency: 'UGX' } }, collection: { mode: 'mtnuganda', provider: 'mtn' } });
    assert.deepEqual([hook.reference, hook.status, hook.amountRaw], ['r-2', 'completed', 10000]);
  });
  const secret = 'whsec_test'; const body = '{"transaction":{"reference":"r"}}';
  const sign = (ts, b = body, s = secret) => `t=${ts},v1=${createHmac('sha256', s).update(`${ts}.${b}`).digest('hex')}`;
  const now = 1_800_000_000_000; const ts = Math.floor(now / 1000);
  it('accepts a correct signature, rejects tampering, wrong secret, and stale timestamps', () => {
    assert.equal(verifyWebhookSignature(body, sign(ts), secret, now), 'valid');
    assert.equal(verifyWebhookSignature(body + ' ', sign(ts), secret, now), 'invalid');
    assert.equal(verifyWebhookSignature(body, sign(ts, body, 'other'), secret, now), 'invalid');
    assert.equal(verifyWebhookSignature(body, sign(ts - 3600), secret, now), 'invalid');
    assert.equal(verifyWebhookSignature(body, 'garbage', secret, now), 'invalid');
    assert.equal(verifyWebhookSignature(body, null, secret, now), 'unsigned');
    assert.deepEqual(parseSignatureHeader('t=12,v1=ABCDEF'), { t: '12', v1: 'abcdef' });
  });
});

describe('the flow is safe by construction', () => {
  const svc = read('lib/sms/topup.ts');
  const hook = read('app/api/webhooks/marzpay/route.ts');
  it('a webhook never credits by itself: it only triggers an authenticated lookup', () => {
    assert.match(hook, /syncTopup\(Number\(row\.id\)\)/);
    assert.doesNotMatch(hook, /creditTopup|UPDATE sms_topups|allocations/);
    assert.match(svc, /getCollection\(String\(row\.provider_uuid\)\)/);
  });
  it('credit happens once, in one transaction, and keeps the usage baseline', () => {
    assert.match(svc, /beginTransaction\(\)/);
    assert.match(svc, /WHERE id = \? AND status = 'paid' FOR UPDATE/);
    assert.match(svc, /UPDATE sms_topups SET status = 'credited'[^`]*AND status = 'paid'/);
    assert.match(svc, /quota_sms = quota_sms \+ VALUES\(quota_sms\), updated_at = updated_at/);
    assert.match(svc, /await conn\.commit\(\)/);
  });
  it('units and price are snapshotted at purchase time; only one open payment per school at a time', () => {
    assert.match(svc, /amount_ugx, price_ugx, sms_units/);
    assert.match(svc, /A payment is already waiting for approval/);
  });
  it('sandbox credit can only be enabled outside production', () => {
    assert.match(svc, /process\.env\.NODE_ENV !== 'production' && process\.env\.MARZPAY_ALLOW_SANDBOX === '1'/);
  });
  it('school routes take the school from the session, need an administrator, and cannot see other schools\' purchases', () => {
    const list = read('app/api/sms/topups/route.ts');
    const one = read('app/api/sms/topups/[id]/route.ts');
    assert.match(list, /getSessionSchoolId\(req\)/); assert.match(list, /\['admin'\]/);
    assert.doesNotMatch(list, /body\??\.school_?[iI]d|searchParams\.get\(['"]school/);
    assert.match(one, /WHERE id = \? AND school_id = \?/); assert.match(one, /Not found/);
  });
  it('the Control Center price/recheck API is permission-gated, audited and never returns credentials', () => {
    const api = read('app/api/control-center/sms/pricing/route.ts');
    assert.match(api, /controlCan\(user\.role, 'billing\.manage'\)/);
    assert.match(api, /controlAudit\(user\.id, 'set_sms_school_price'/);
    assert.match(api, /controlAudit\(user\.id, 'recheck_sms_topup'/);
    assert.doesNotMatch(api, /MARZPAY_API_SECRET|process\.env\.MARZPAY/);
  });
  it('credentials come only from the environment and are never sent to the browser or the mobile bundle', () => {
    const client = read('lib/payments/marzpay.ts');
    assert.match(client, /process\.env\.MARZPAY_API_KEY/); assert.match(client, /process\.env\.MARZPAY_API_SECRET/);
    for (const f of ['app/admin/sms/buy/page.tsx', 'app/control/sms/pricing/page.tsx', 'app/api/sms/topups/route.ts', 'app/api/sms/topups/[id]/route.ts']) {
      assert.doesNotMatch(read(f), /marz_[A-Za-z0-9]{8,}|process\.env\.MARZPAY_API/, `${f} must not touch or embed credentials`);
    }
    assert.doesNotMatch(readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8'), /marz_[A-Za-z0-9]{6,}/, 'no real key in the committed example file');
    assert.doesNotMatch(readFileSync(new URL('../../../../.env.production.example', import.meta.url), 'utf8'), /marz_[A-Za-z0-9]{6,}/);
  });
});
