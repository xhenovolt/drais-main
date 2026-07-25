// withRoute error mapping — pure (Phase G).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveError } from '@/lib/api/resolve-error';

describe('resolveError', () => {
  it('passes through a 4xx statusCode with its message', () => {
    const r = resolveError({ statusCode: 403, message: "Forbidden: missing permission 'attendance.manage'" });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /Forbidden/);
  });

  it('supports `status` as well as `statusCode`', () => {
    assert.equal(resolveError({ status: 400, message: 'Bad range' }).status, 400);
  });

  it('a 400 validation message is preserved', () => {
    const r = resolveError({ statusCode: 400, message: 'Dates must be YYYY-MM-DD' });
    assert.deepEqual(r, { status: 400, body: { error: 'Dates must be YYYY-MM-DD' } });
  });

  it('an untagged error becomes 500', () => {
    assert.equal(resolveError(new Error('kaboom')).status, 500);
  });

  it('hides the internal message in production', () => {
    const r = resolveError(new Error('SELECT * blew up: connection refused'), true);
    assert.equal(r.status, 500);
    assert.equal(r.body.error, 'Internal server error');
  });

  it('surfaces the message outside production (dev)', () => {
    const r = resolveError(new Error('kaboom'), false);
    assert.equal(r.body.error, 'kaboom');
  });

  it('a 5xx statusCode is treated as server error (hidden in prod)', () => {
    // Only 4xx are "deliberate/safe"; a thrown 503 still hides its internals in prod.
    const r = resolveError({ statusCode: 503, message: 'upstream down' }, true);
    assert.equal(r.status, 500);
    assert.equal(r.body.error, 'Internal server error');
  });

  it('never throws on a null/odd throw value', () => {
    assert.equal(resolveError(null).status, 500);
    assert.equal(resolveError('a string error', false).body.error, 'Internal server error');
  });
});
