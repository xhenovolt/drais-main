import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(src, p), 'utf8');

describe('SMS delivery events: storage', () => {
  const events = read('lib/sms/delivery-events.ts');
  const report = read('lib/sms/delivery-report.ts');

  it('a repeated provider report is ignored, never duplicated', () => {
    assert.match(events, /UNIQUE KEY uk_sde_message_state \(provider_message_id, state\)/);
    assert.match(events, /INSERT IGNORE INTO sms_delivery_events/);
  });
  it('every read of the feed is pinned to one school', () => {
    for (const fn of ['deliveryEventsAfter', 'deliveryEventCursor', 'deliveryEventsForOutbox', 'latestDeliveryEventsForOutbox']) {
      const body = events.slice(events.indexOf(`export async function ${fn}`));
      const sql = body.slice(0, body.indexOf('\n}\n'));
      assert.match(sql, /school_id = \?/, `${fn} must filter by school`);
    }
  });
  it('a late "on the network" report never replaces a confirmed outcome in the list', () => {
    assert.match(events, /prev\.state !== 'sent' && r\.state === 'sent'\) continue/);
  });
  it('a report is only recorded for a message DRAIS can tie to a school', () => {
    assert.ok(report.indexOf('if (!ctx) return') < report.indexOf('recordDeliveryEvent({'));
    assert.match(report, /state: state === 'pending' \? 'sent' : state/);
  });
});

describe('SMS delivery events: real-time feed', () => {
  const stream = read('app/api/attendance/live-scan/route.ts');
  const indicator = read('components/notifications/LiveScanSmsIndicator.tsx');
  const outbox = read('app/admin/notifications/outbox/page.tsx');

  it('the stream tails the database for the session school and masks the phone number', () => {
    assert.match(stream, /deliveryEventsAfter\(session\.schoolId, deliveryCursor\)/);
    assert.match(stream, /recipient_phone: maskPhone\(e\.recipient_phone\)/);
  });
  it('reports go out as a named SSE event so the identity popup stream is untouched', () => {
    assert.match(stream, /event: sms_delivery\\ndata: /);
    assert.match(indicator, /addEventListener\('sms_delivery'/);
  });
  it('one toast per report however many indicators are mounted, and open lists are told to refresh', () => {
    // module scope (column 0), not inside the component — shared by the Navbar and Topbar copies
    assert.match(indicator, /^const seenDeliveries = new Set<number>\(\);/m);
    assert.match(indicator, /seenDeliveries\.has\(d\.id\)\) return/);
    assert.match(indicator, /window\.dispatchEvent\(new CustomEvent\(SMS_DELIVERY_EVENT/);
    assert.match(outbox, /window\.addEventListener\(SMS_DELIVERY_EVENT, h\)/);
  });
  it('delivered and not-delivered toast; "on the network" only updates the pill', () => {
    assert.match(indicator, /toast: 'success'/);
    assert.match(indicator, /toast: 'error'/);
    assert.match(indicator, /toast: null/);
  });
});
