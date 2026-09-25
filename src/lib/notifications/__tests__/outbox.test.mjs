// SMS Outbox: honest statuses, safe filters, tenant isolation, PII masking (scenarios F, G, H support).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOutboxWhere, maskPhone, normalizeDeliveryStatus, DISPLAY_STATUS_SQL, STATUS_HELP, DISPLAY_STATUSES } from '@/lib/notifications/outbox-query.ts';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

describe('honest status vocabulary', () => {
  it('provider acceptance is SENT; only a delivery report makes DELIVERED', () => {
    assert.match(DISPLAY_STATUS_SQL, /status = 'delivered' AND o\.delivery_confirmed_at IS NOT NULL THEN 'delivered'/);
    assert.match(DISPLAY_STATUS_SQL, /WHEN o\.status = 'delivered' THEN 'sent'/);
  });
  it('every status has plain-language help', () => {
    for (const s of DISPLAY_STATUSES) assert.ok(STATUS_HELP[s].length > 10, s);
  });
  it('filtering by sent / delivered maps onto the confirmation column', () => {
    assert.match(buildOutboxWhere({ schoolId: 1, status: 'sent' }).where, /o\.status = 'delivered' AND o\.delivery_confirmed_at IS NULL/);
    assert.match(buildOutboxWhere({ schoolId: 1, status: 'delivered' }).where, /delivery_confirmed_at IS NOT NULL/);
    assert.match(buildOutboxWhere({ schoolId: 1, status: 'failed' }).where, /o\.status = \?/);
  });
  it('provider delivery-report states are normalised, never guessed', () => {
    assert.equal(normalizeDeliveryStatus('Success'), 'delivered');
    assert.equal(normalizeDeliveryStatus('Failed'), 'failed');
    assert.equal(normalizeDeliveryStatus('Rejected'), 'failed');
    assert.equal(normalizeDeliveryStatus('Sent'), 'pending');
    assert.equal(normalizeDeliveryStatus('Buffered'), 'pending');
    assert.equal(normalizeDeliveryStatus('SomethingNew'), 'unknown');
    assert.equal(normalizeDeliveryStatus(undefined), 'unknown');
  });
});

describe('filters are parameterised and school-pinned', () => {
  it('the school is always the first predicate and a bound parameter', () => {
    const b = buildOutboxWhere({ schoolId: 12020 });
    assert.match(b.where, /^o\.school_id = \?/);
    assert.equal(b.params[0], 12020);
  });
  it('user text never reaches the SQL string', () => {
    const evil = "x'; DROP TABLE notification_outbox; --";
    const b = buildOutboxWhere({ schoolId: 1, q: evil, type: 'ABSENT', channel: 'sms' });
    assert.doesNotMatch(b.where, /DROP|--|x'/);
    assert.ok(b.params.some((p) => String(p).includes('DROP')), 'the text is only ever a bound parameter');
  });
  it('rejects malformed values instead of passing them through', () => {
    assert.ok(buildOutboxWhere({ schoolId: 1, status: 'weird' }).error);
    assert.ok(buildOutboxWhere({ schoolId: 1, channel: 'fax' }).error);
    assert.ok(buildOutboxWhere({ schoolId: 1, type: 'abc; x' }).error);
    assert.ok(buildOutboxWhere({ schoolId: 1, dateFrom: '2026-13-99x' }).error);
  });
  it('LIKE wildcards in a search are escaped', () => {
    const b = buildOutboxWhere({ schoolId: 1, q: '100%_a' });
    assert.ok(b.params.some((p) => String(p).includes('\\%') && String(p).includes('\\_')));
  });
  it('the look-back window is capped', () => {
    assert.equal(buildOutboxWhere({ schoolId: 1, sinceHours: 999999 }).params[1], 24 * 90);
  });
  it('date range filters use bounds, not the window', () => {
    const b = buildOutboxWhere({ schoolId: 1, dateFrom: '2026-09-01', dateTo: '2026-09-25' });
    assert.match(b.where, /o\.created_at >= \?/); assert.doesNotMatch(b.where, /INTERVAL \? HOUR/);
  });
});

describe('PII', () => {
  it('phone numbers are masked in lists', () => {
    assert.equal(maskPhone('0772123456'), '0772***456');
    assert.equal(maskPhone('123'), '***');
    assert.equal(maskPhone(null), '');
  });
});

describe('routes: permission + tenant isolation', () => {
  const list = read('app/api/admin/notifications/outbox/route.ts');
  const detail = read('app/api/admin/notifications/outbox/[id]/route.ts');
  const hook = read('app/api/comm/webhooks/sms-delivery/route.ts');

  it('the list is permission-gated (it used to be readable by any signed-in user)', () => {
    assert.match(list, /canAny\(gate, \['comm\.dispatch\.view'/);
    assert.match(detail, /canAny\(gate, \['comm\.dispatch\.view'/);
  });
  it('only a super-admin may query another school; everyone else is pinned to their session school', () => {
    assert.match(list, /session\.isSuperAdmin && Number\.isFinite\(schoolIdRaw\)/);
    assert.match(list, /: session\.schoolId/);
  });
  it('the detail view is school-scoped and cannot be used to probe other schools\' ids', () => {
    assert.match(detail, /o\.school_id = \? OR \?/);
    assert.match(detail, /Message not found/);
    assert.match(detail, /notification_deliveries WHERE outbox_id = \? AND school_id = \?/);
    assert.match(detail, /attendance_sms_decisions WHERE id = \? AND school_id = \?/);
  });
  it('the list masks phones; only the detail exposes a full number', () => {
    assert.match(list, /maskPhone\(r\.recipient_phone\)/);
    assert.match(list, /LEFT\(o\.body, 90\)/, 'only a short preview of the text is listed');
    assert.doesNotMatch(list, /SELECT o\.\*|recipient_email/);
  });
  it('the delivery-report webhook is disabled without a secret, checks it in constant time, and never regresses a status', () => {
    assert.match(hook, /SMS_DLR_SECRET/);
    assert.match(hook, /status: 503/);
    assert.match(hook, /timingSafeEqual/);
    assert.match(hook, /COALESCE\(delivery_confirmed_at/);
    assert.match(hook, /delivery_confirmed_at IS NULL/);
  });
});

describe('scenario G — provider failure is visible with a reason', () => {
  it('the drain records the provider error on the row and the list shows it', () => {
    const drain = read('lib/notifications/drain.ts');
    assert.match(drain, /markFailed\(row\.id, sendResult\.error \?\? 'Provider rejected'\)/);
    assert.match(read('app/admin/notifications/outbox/page.tsx'), /r\.last_error/);
  });
});
