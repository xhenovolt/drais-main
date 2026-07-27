/**
 * Platform API reachability guard (P25).
 *
 * The external /api/platform/v1 surface authenticates per-route via API keys,
 * NOT the session cookie. If it's ever dropped from the middleware's public
 * list, the session gate would 401 every external consumer before their key is
 * checked — silently breaking the whole API. Lock the invariant in CI.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8');

describe('external platform API is reachable', () => {
  it('middleware treats /api/platform as public (route enforces key auth itself)', () => {
    const mw = read('middleware.ts');
    // Must appear as a PUBLIC_ROUTES entry, not merely mentioned in a comment.
    assert.match(mw, /['"]\/api\/platform['"]/, '/api/platform must be in PUBLIC_ROUTES');
  });

  it('the v1 discovery endpoint exists and enforces platform auth', () => {
    const route = read('src/app/api/platform/v1/route.ts');
    assert.match(route, /requirePlatformAuth\(\s*req\s*,\s*\[\s*\]\s*\)/, 'discovery must authenticate the key (empty scope list)');
    assert.match(route, /version:\s*'v1'/, 'discovery must advertise the version');
  });
});
