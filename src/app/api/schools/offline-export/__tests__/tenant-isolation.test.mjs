/**
 * Tenant-isolation tests for POST /api/schools/offline-export (Phase 7
 * sub-effort 23). This is the self-service lean .drs export — the whole
 * point of the brief's Phase 2.3 requirement is that NOTHING about which
 * school gets exported can come from the client. Two complementary
 * checks:
 *
 *   1. A source-level guard (like src/app/api/__tests__/
 *      tenant-isolation-guard.test.mjs, but written separately rather than
 *      force-fit into that list — this route's scoping shape is
 *      structurally different: it delegates to exportSchoolToDrs() rather
 *      than inlining school_id-scoped SQL, so that guard's literal
 *      `school_id` regex wouldn't mean the same thing here). Fails loudly
 *      if a future edit adds a body/query-derived school id.
 *   2. A real behavioral check of the one path that's testable without a
 *      live TiDB connection: no session → 401, before anything else runs.
 *      The authenticated/authorized/export paths all require a real
 *      online session and hit live TiDB (exportSchoolToDrs's whole job) —
 *      not exercised in this suite; see export-drs.mjs's own manual
 *      validation run against Albayan for that proof.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NextRequest } from 'next/server';

const routePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../route.ts');
const source = readFileSync(routePath, 'utf8');

describe('offline-export route — source-level tenant isolation guard', () => {
  it('resolves the school from the session, not the client', () => {
    assert.match(source, /getSessionSchoolId/, 'must derive the school from the authenticated session');
    assert.match(source, /session\.schoolId/, 'must actually use session.schoolId somewhere');
  });

  it('never reads a school id from anything the client controls', () => {
    assert.ok(!/body\.schoolId/.test(source), 'must not accept schoolId from the request body');
    assert.ok(!/body\[.school/.test(source), 'must not accept a school id via bracket access on the body either');
    assert.ok(!/searchParams\.get\(.school/i.test(source), 'must not accept a school id via a query param');
    assert.ok(!/params\.schoolId/.test(source), 'must not accept a school id via a route param');
  });

  it('passes the session-derived school id into the real export engine', () => {
    assert.match(source, /exportSchoolToDrs\(\{\s*schoolId:\s*session\.schoolId/, 'must call exportSchoolToDrs with session.schoolId specifically');
  });

  it('is permission-gated, not just session-gated', () => {
    assert.match(source, /requirePermission/, 'must check a permission, not just "is logged in"');
  });
});

describe('offline-export route — unauthenticated request', () => {
  it('a request with no session cookie is refused with 401 before any export work starts', async () => {
    const { POST } = await import('../route.ts');
    const req = new NextRequest('http://localhost/api/schools/offline-export', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passphrase: 'irrelevant-but-long-enough' }),
    });
    const res = await POST(req);
    assert.equal(res.status, 401);
  });

  // The exact attack this route must resist: a logged-out (or differently-
  // authenticated) caller trying to smuggle another school's id in anyway.
  // Still refused with 401 — the body is never even inspected for a
  // schoolId before the session check, confirmed above at the source level.
  it('a tampered body with a schoolId still gets refused with 401 when unauthenticated', async () => {
    const { POST } = await import('../route.ts');
    const req = new NextRequest('http://localhost/api/schools/offline-export', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase: 'irrelevant-but-long-enough', schoolId: 1 }),
    });
    const res = await POST(req);
    assert.equal(res.status, 401);
  });
});
