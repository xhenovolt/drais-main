import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (p) => readFileSync(join(src, p), 'utf8');
const drain = read('lib/notifications/drain.ts');
const core = drain.slice(drain.indexOf('export async function drainNotificationOutbox'), drain.indexOf('// ── Opportunistic pump'));

describe('outbox drain: a message is never sent twice', () => {
  it('a run claims rows with its own token and reads back only those rows', () => {
    assert.match(core, /claim_token = \?\s+WHERE status = 'queued'/);
    assert.match(core, /WHERE status = 'sending' AND claim_token = \?/);
    // the old "anything attempted in the last 30 seconds" re-select matched other runs' rows
    assert.doesNotMatch(core, /INTERVAL 30 SECOND/);
  });
  it('every status change after the claim requires still owning the row', () => {
    assert.match(core, /const OWNED = `id = \? AND status = 'sending' AND claim_token = \?`/);
    const updates = core.split('UPDATE notification_outbox').slice(1);
    // [0] closes out stale rows from dead runs, [1] is the claim itself; the rest act on one row
    const perRow = updates.slice(2);
    assert.ok(perRow.length >= 5, `expected the per-row updates, found ${perRow.length}`);
    for (const u of perRow) assert.match(u.slice(0, 400), /WHERE \$\{OWNED\}/);
    assert.doesNotMatch(core, /WHERE id = \?`/);
  });
});

describe('outbox drain: provider rate limits', () => {
  it('a rate-limit reply refunds the attempt and waits, instead of counting as a failure', () => {
    assert.match(core, /routed\?\.response\.rateLimited/);
    assert.match(core, /attempts = GREATEST\(attempts - 1, 0\)/);
    const limited = core.slice(core.indexOf('routed?.response.rateLimited'));
    assert.ok(limited.indexOf('await release(') < limited.indexOf('INSERT INTO notification_deliveries'), 'must release before recording a delivery attempt');
  });
  it('the run stops sending to a provider once its per-minute budget is used', () => {
    assert.match(core, /providerPacingForSchool\(schoolId\)/);
    assert.match(core, /pace\.budget\.remaining <= 0 \|\| cooling != null/);
    assert.match(core, /result\.deferred\+\+/);
  });
  it('an accepted message no longer shows an earlier retry reason as a problem', () => {
    assert.match(core, /SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP, last_error = NULL/);
  });
  it('a refused key holds the message with its attempt refunded, instead of failing it', () => {
    assert.match(core, /routed\?\.response\.authRejected/);
    const refused = core.slice(core.indexOf('routed?.response.authRejected'));
    assert.ok(refused.indexOf('await release(row.id, KEY_REFUSED_PAUSE_SECONDS, KEY_REFUSED_NOTE)') < refused.indexOf('INSERT INTO notification_deliveries'), 'must release before recording a delivery attempt');
    assert.ok(refused.indexOf('await release(') < refused.indexOf('await markFailed('), 'a key refusal must never reach markFailed');
  });
  it('while the provider is refusing the key, a run sends nothing to it until the pause ends', () => {
    const routing = read('lib/sms/school-routing.ts');
    assert.match(routing, /row\.status === 'authentication_failed' && since != null && since >= 0 && since < KEY_REFUSED_PAUSE_SECONDS/);
    assert.match(routing, /remaining: holdSeconds > 0 \? 0 :/);
    assert.match(core, /p\.holdSeconds > 0 && !coolingDown\.has\(p\.providerId\)/);
  });
  it('the key is checked before each opportunistic drain, and the check only asks', () => {
    assert.match(drain, /return checkProviderKeys\(\)\s+\.catch\(\(\) => undefined\)\s+\.then\(\(\) => drainNotificationOutbox\(\)\)/);
    const health = read('lib/sms/key-health.ts');
    assert.match(health, /checkUgaTextKey\(config\)/);
    assert.doesNotMatch(health, /encrypted_config\s*=|sendWithAdapter|\.send\(/, 'the health check must never send or rewrite the stored key');
    assert.match(health, /operation = 'key_check' AND created_at > DATE_SUB\(NOW\(\), INTERVAL \? MINUTE\)/);
  });
  it('pacing counts every send on the provider account in the last minute', () => {
    const routing = read('lib/sms/school-routing.ts');
    assert.match(routing, /operation = 'send' AND created_at > DATE_SUB\(NOW\(\), INTERVAL 60 SECOND\)/);
    assert.match(routing, /defaultRateLimitPerMinute/);
  });
});
