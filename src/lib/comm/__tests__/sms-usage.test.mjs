// SMS allowance: "6000 given, 100 sent, still shows 6000" — root cause was that only the single
// composer wrote usage. These tests pin the segment maths and that EVERY send path records into the
// usage ledger that the dashboard / composer / Control Center all read.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { smsSegments, remainingFrom } from '@/lib/sms/usage.ts';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

describe('smsSegments', () => {
  it('plain GSM text: 160 chars is one SMS, 161 is two (153 per part)', () => {
    assert.equal(smsSegments('a'.repeat(160)), 1);
    assert.equal(smsSegments('a'.repeat(161)), 2);
    assert.equal(smsSegments('a'.repeat(306)), 2);
    assert.equal(smsSegments('a'.repeat(307)), 3);
  });
  it('extension characters cost two septets', () => {
    assert.equal(smsSegments('{'.repeat(80)), 1);
    assert.equal(smsSegments('{'.repeat(81)), 2);
  });
  it('Arabic / emoji / curly quotes switch to UCS-2: 70 then 67 per part', () => {
    assert.equal(smsSegments('م'.repeat(70)), 1);
    assert.equal(smsSegments('م'.repeat(71)), 2);
    assert.equal(smsSegments('a'.repeat(69) + '’'), 1);
    assert.equal(smsSegments('a'.repeat(160) + '’'), 3);
  });
  it('empty text still bills one segment', () => {
    assert.equal(smsSegments(''), 1);
  });
});

describe('remainingFrom', () => {
  it('never negative; null quota means no cap', () => {
    assert.equal(remainingFrom(6000, 100), 5900);
    assert.equal(remainingFrom(35, 446), 0);
    assert.equal(remainingFrom(null, 999), null);
  });
});

describe('every send path records usage', () => {
  it('composer (/api/sms/send) records and checks the segments the message needs', () => {
    const s = read('app/api/sms/send/route.ts');
    assert.match(s, /recordSmsUsage\(\{ schoolId: session\.schoolId, source: 'single'/);
    assert.match(s, /pos\.remaining < segmentsNeeded/);
  });
  it('bulk broadcast checks the WHOLE audience up front and records each success', () => {
    const s = read('app/api/admin/comm/broadcast/route.ts');
    assert.match(s, /pos\.remaining < needed/);
    assert.match(s, /source: 'broadcast'/);
    assert.ok(s.indexOf('pos.remaining < needed') < s.indexOf('provider.send('), 'gate runs before any send');
  });
  it('attendance outbox drain records usage but never blocks safety alerts', () => {
    const s = read('lib/notifications/drain.ts');
    assert.match(s, /recordSmsUsage\(\{ schoolId: row\.school_id, source: 'attendance'/);
    assert.doesNotMatch(s, /getSmsPosition|getSchoolSmsPosition/);
  });
  it('event dispatcher records on both the auto path and the manual "send now" path', () => {
    const s = read('lib/comm/dispatcher.ts');
    assert.equal((s.match(/recordSmsUsage\(/g) ?? []).length >= 2, true);
    assert.doesNotMatch(s, /rule\.channel === 'sms' \? 'central_sms' : provider\.name,\s*\n\s*result\.providerMessageId,\s*\n\s*result\.cost,\s*\n\s*result\.error,\s*\n\s*args\.userId/, 'manualSendFromLog must not reference an out-of-scope rule');
  });
  it('recording never throws into the send path and only charges successful sends', () => {
    const s = read('lib/sms/usage.ts');
    assert.match(s, /if \(p\.success === false\) return;/);
    assert.match(s, /catch \(e: any\)/);
  });
});

describe('reading the balance', () => {
  it('economics + quota read the ledger, counting only usage since the allocation was set', () => {
    const e = read('lib/control/sms-economics.ts');
    assert.match(e, /FROM sms_usage_events u/);
    assert.match(e, /u\.created_at >= a\.updated_at/);
    assert.doesNotMatch(e, /action = 'SMS_SENT'/);
    assert.match(read('lib/sms/usage.ts'), /created_at >= \?/);
  });
  it('the dashboard shows the SMS card', () => {
    assert.match(read('app/dashboard/page.tsx'), /<SmsBalanceCard \/>/);
    assert.match(read('components/dashboard/SmsBalanceCard.tsx'), /\/api\/sms\/quota/);
  });
  it('migration backfills history idempotently', () => {
    const m = read('../database/migrations/tidb/053_sms_usage_ledger.sql');
    assert.equal((m.match(/INSERT IGNORE INTO sms_usage_events/g) ?? []).length, 3);
    assert.match(m, /UNIQUE KEY uk_usage_ref \(source, ref\)/);
  });
});
