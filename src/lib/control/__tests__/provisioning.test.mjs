import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateProvisionInput, generateTempPassword } from '../provisioning.ts';

describe('validateProvisionInput', () => {
  it('accepts a well-formed payload and normalises it', () => {
    const r = validateProvisionInput({ name: '  Kampala High  ', adminName: 'Jane Doe', adminEmail: 'Jane@Example.COM', planCode: 'Standard' });
    assert.equal(r.ok, true);
    assert.equal(r.value.name, 'Kampala High');
    assert.equal(r.value.adminEmail, 'jane@example.com');
    assert.equal(r.value.planCode, 'standard');
  });
  it('rejects a short school name', () => {
    const r = validateProvisionInput({ name: 'K', adminName: 'Jane Doe', adminEmail: 'a@b.com' });
    assert.equal(r.ok, false);
  });
  it('rejects a missing admin name', () => {
    const r = validateProvisionInput({ name: 'Valid Name', adminName: '', adminEmail: 'a@b.com' });
    assert.equal(r.ok, false);
  });
  it('rejects an invalid email', () => {
    for (const bad of ['nope', 'a@b', 'a b@c.com', '']) {
      assert.equal(validateProvisionInput({ name: 'Valid Name', adminName: 'Jane', adminEmail: bad }).ok, false);
    }
  });
  it('defaults optional fields to null', () => {
    const r = validateProvisionInput({ name: 'Valid Name', adminName: 'Jane', adminEmail: 'a@b.com' });
    assert.equal(r.ok, true);
    assert.equal(r.value.planCode, null);
    assert.equal(r.value.district, null);
  });
});

describe('generateTempPassword', () => {
  it('is grouped, readable, and free of ambiguous chars', () => {
    const p = generateTempPassword();
    assert.match(p, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    assert.ok(!/[0O1lI]/.test(p), 'no ambiguous characters');
  });
  it('is effectively unique per call', () => {
    const s = new Set(Array.from({ length: 50 }, () => generateTempPassword()));
    assert.equal(s.size, 50);
  });
});
