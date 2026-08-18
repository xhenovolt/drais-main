// Regression test for the getProvider() channel-fallback bug found and
// fixed 2026-08-19 while adding the WhatsApp channel: the fallback used
// to always return a hardcoded channel:'sms' console stand-in, even when
// a non-SMS channel (e.g. 'whatsapp') was requested and its real provider
// wasn't found/registered — masking a genuine "unmonitored channel"
// signal with a mislabeled one.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getProvider, listProviders } from '@/lib/comm/providers';

describe('getProvider', () => {
  it('returns the real provider when name+channel match', () => {
    const p = getProvider('africas_talking', 'sms');
    assert.equal(p.name, 'africas_talking');
    assert.equal(p.channel, 'sms');
  });

  it('returns the real WhatsApp provider when registered', () => {
    const p = getProvider('infobip_whatsapp', 'whatsapp');
    assert.equal(p.name, 'infobip_whatsapp');
    assert.equal(p.channel, 'whatsapp');
  });

  it('falls back to a console stand-in labeled with the REQUESTED channel, not a hardcoded sms', () => {
    const p = getProvider('nonexistent_provider', 'whatsapp');
    assert.equal(p.name, 'console');
    assert.equal(p.channel, 'whatsapp'); // the bug: this used to always be 'sms'
  });

  it('falls back correctly when asking for sms with an unknown name too', () => {
    const p = getProvider('nonexistent_provider', 'sms');
    assert.equal(p.channel, 'sms');
  });

  it('falls back correctly for an unregistered channel like push', () => {
    const p = getProvider('anything', 'push');
    assert.equal(p.channel, 'push');
  });

  it('a channel mismatch (real name, wrong channel) also falls back to the requested channel', () => {
    // africas_talking is registered for 'sms' — asking for it under 'whatsapp'
    // must not silently return the SMS provider mislabeled.
    const p = getProvider('africas_talking', 'whatsapp');
    assert.equal(p.channel, 'whatsapp');
    assert.notEqual(p.name, 'africas_talking');
  });

  it('the fallback console provider still "sends" successfully (never crashes the dispatcher)', async () => {
    const p = getProvider('nonexistent', 'whatsapp');
    const r = await p.send({ to: '+256700000000', body: 'test' });
    assert.equal(r.success, true);
  });
});

describe('listProviders', () => {
  it('lists both africas_talking (sms) and infobip_whatsapp (whatsapp)', () => {
    const names = listProviders().map(p => `${p.name}:${p.channel}`);
    assert.ok(names.includes('africas_talking:sms'));
    assert.ok(names.includes('infobip_whatsapp:whatsapp'));
  });
});
