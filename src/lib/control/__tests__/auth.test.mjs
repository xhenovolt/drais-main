// Control Center auth — isolated-domain primitives (no DB needed).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, hashToken, canManage } from '@/lib/control/auth';

describe('control password hashing (scrypt)', () => {
  it('round-trips and salts uniquely', async () => {
    const h1 = await hashPassword('correct horse battery');
    const h2 = await hashPassword('correct horse battery');
    assert.notEqual(h1, h2); // unique salt per hash
    assert.equal(await verifyPassword('correct horse battery', h1), true);
    assert.equal(await verifyPassword('correct horse battery', h2), true);
  });

  it('rejects wrong passwords and malformed hashes', async () => {
    const h = await hashPassword('secret-password-1');
    assert.equal(await verifyPassword('secret-password-2', h), false);
    assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
    assert.equal(await verifyPassword('anything', ''), false);
    assert.equal(await verifyPassword('anything', 'bcrypt$x$y'), false);
  });
});

describe('session token hashing', () => {
  it('sha256 hex, deterministic, 64 chars', () => {
    const t = 'a'.repeat(96);
    assert.equal(hashToken(t), hashToken(t));
    assert.match(hashToken(t), /^[0-9a-f]{64}$/);
    assert.notEqual(hashToken('x'), hashToken('y'));
  });
});

describe('role gate', () => {
  it('only XHENVOLT_SUPER_ADMIN can manage', () => {
    assert.equal(canManage('XHENVOLT_SUPER_ADMIN'), true);
    assert.equal(canManage('XHENVOLT_OPERATOR'), false);
    assert.equal(canManage('XHENVOLT_VIEWER'), false);
    assert.equal(canManage('admin'), false);       // school roles never pass
    assert.equal(canManage('super_admin'), false); // school super-admin ≠ Xhenvolt
    assert.equal(canManage(null), false);
  });
});
