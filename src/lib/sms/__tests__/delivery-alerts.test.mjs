import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shouldAlert, buildAlertBody } from '../delivery-alert-text.ts';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(src, p), 'utf8');
const alerts = read('lib/sms/delivery-alerts.ts');

describe('delivery alerts: what gets texted', () => {
  it('"failed" mode (the default) only reports messages that were not delivered', () => {
    assert.equal(shouldAlert('failed', 'failed'), true);
    assert.equal(shouldAlert('failed', 'delivered'), false);
    assert.equal(shouldAlert(null, 'delivered'), false);
    assert.equal(shouldAlert(undefined, 'failed'), true);
  });
  it('"all" reports both outcomes and "off" reports nothing', () => {
    assert.equal(shouldAlert('all', 'delivered'), true);
    assert.equal(shouldAlert('all', 'failed'), true);
    assert.equal(shouldAlert('off', 'failed'), false);
  });
  it('the text names the learner and guardian, masks the phone and fits one SMS', () => {
    const ok = buildAlertBody({ schoolId: 1, state: 'delivered', learnerName: 'Kigoonya Yusufu', recipientName: 'Mr Kigoonya', recipientPhone: '+256772123456' }, 'NAKIFUMA HIGH SCH:');
    assert.equal(ok, "NAKIFUMA HIGH SCH: SMS DELIVERED to Kigoonya Yusufu's guardian Mr Kigoonya (+256***456).");
    const bad = buildAlertBody({ schoolId: 1, state: 'failed', recipientName: 'Jane', recipientPhone: '+256772123456', reason: 'Absent subscriber' }, null);
    assert.equal(bad, 'SMS NOT DELIVERED to Jane (+256***456). Reason: Absent subscriber');
    assert.ok(!ok.includes('772123456'));
    assert.ok(buildAlertBody({ schoolId: 1, state: 'failed', recipientName: 'X', reason: 'r'.repeat(400) }, null).length <= 160);
  });
});

describe('delivery alerts: safe by construction', () => {
  const report = read('lib/sms/delivery-report.ts');
  it('an alert is capped per school per hour, and the cap is counted before sending', () => {
    assert.match(alerts, /recent >= DELIVERY_ALERT_HOURLY_CAP\) return/);
    assert.ok(alerts.indexOf('INSERT INTO sms_status_alerts') < alerts.indexOf('await sendViaSchoolRoute('));
  });
  it('an alert can never cause another alert', () => {
    // sent straight through the route: no outbox / dispatch-log row for a later report to match
    const send = alerts.slice(alerts.indexOf('export async function notifyDeliveryStatus'));
    assert.doesNotMatch(send, /INSERT INTO (notification_outbox|comm_dispatch_log|notification_deliveries)/);
    assert.match(alerts, /normalizePhoneNumber\(a\.recipientPhone\) === phone\) return/);
  });
  it('a repeated provider report never sends a second alert', () => {
    assert.match(report, /if \(recorded && ctx\.schoolId && \(state === 'delivered' \|\| state === 'failed'\)\) \{\s+await notifyDeliveryStatus\(/);
  });
  it('the school setting is validated and stored normalised', () => {
    const api = read('app/api/admin/comm/settings/route.ts');
    assert.match(api, /normalizePhoneNumber\(raw\)/);
    assert.match(api, /DELIVERY_ALERT_MODES\.includes\(body\.deliveryAlertMode\)/);
  });
  it('alerting never throws into the delivery report or the send that triggered it', () => {
    assert.match(alerts, /\} catch \{\s+return \{ sent: false, skipped: 'error' \};/);
  });
});
