// The confirmation SMS a school receives after its payment is credited.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTopupConfirmationSms } from '@/lib/sms/topup-math.ts';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const base = { school: 'Nakifuma Mixed Secondary School', amountUgx: 9990, units: 333, remaining: 1333, ref: 12 };

describe('confirmation SMS text', () => {
  it('says what was paid, how many SMS were added and what is now available', () => {
    const m = buildTopupConfirmationSms(base);
    assert.match(m, /Nakifuma Mixed Secondary School/);
    assert.match(m, /UGX 9,990 received/);
    assert.match(m, /333 SMS added/);
    assert.match(m, /1,333 SMS now available/);
    assert.match(m, /Ref 12/);
  });

  it('is always a single SMS (160 characters or fewer), even for a long school name and big numbers', () => {
    const long = buildTopupConfirmationSms({
      ...base, school: "St. Mary's Boys Senior Secondary and Vocational Training Institute Kisubi Hill Campus",
      amountUgx: 10_000_000, units: 333_333, remaining: 1_234_567, ref: 123456,
    });
    assert.ok(long.length <= 160, `length ${long.length}`);
    assert.match(long, /UGX 10,000,000 received/);
    assert.match(long, /333,333 SMS added/);
  });

  it('leaves out the balance when the school has no SMS limit, and uses plain characters only', () => {
    const m = buildTopupConfirmationSms({ ...base, remaining: null, school: 'Al-Ihsan ’Academy — Girls' });
    assert.doesNotMatch(m, /now available/);
    assert.match(m, /^[\x20-\x7E]+$/);
    assert.ok(buildTopupConfirmationSms({ ...base, school: '' }).startsWith('Your school:'));
  });
});

describe('confirmation SMS safety', () => {
  const svc = read('lib/sms/topup.ts');

  it('is sent only after the credit really happened, at both credit points', () => {
    assert.equal((svc.match(/if \(credited\) await sendTopupConfirmation\(id\)/g) ?? []).length, 2);
  });

  it('uses the platform SMS account and never counts against the school\'s own SMS balance', () => {
    assert.ok(svc.includes('sendCentralSMS(String(row.notify_phone), text, undefined, undefined)'), 'no school credentials passed');
    assert.doesNotMatch(svc, /recordSmsUsage/);
  });

  it('is sent at most once: atomic claim, bounded retries, phone cleared once sent', () => {
    assert.match(svc, /confirm_attempts = confirm_attempts \+ 1/);
    assert.match(svc, /confirm_sent_at IS NULL AND confirm_attempts < \?/);
    assert.match(svc, /confirm_sent_at = UTC_TIMESTAMP\(\), notify_phone = NULL/);
    assert.match(svc, /MAX_CONFIRM_ATTEMPTS = 3/);
  });

  it('never throws into the payment flow, and storing the payer\'s number is best-effort', () => {
    assert.match(svc, /catch \(e: any\) \{\s*console\.error\('\[sms-topup\] confirmation failed:'[\s\S]*?return false;/);
    assert.match(svc, /SET notify_phone = \? WHERE id = \?`, \[phone, id\]\)\.catch/);
  });

  it('the migration adds only nullable / defaulted columns (safe to apply before or after the deploy)', () => {
    const sql = readFileSync(new URL('../../../../database/migrations/tidb/057_sms_topup_confirmation.sql', import.meta.url), 'utf8');
    const adds = sql.match(/ADD COLUMN [a-z_]+ [^;]+;/g) ?? [];
    assert.equal(adds.length, 5);
    for (const a of adds) assert.match(a, /DEFAULT/);
  });
});
