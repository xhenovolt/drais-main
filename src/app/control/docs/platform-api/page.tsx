'use client';

import React from 'react';
import Link from 'next/link';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="platform-api">
      <p>
        The external, machine-to-machine API. Key-authenticated, scoped, rate-limited, audited — and{' '}
        <strong>frozen</strong>. This is how JETON and future Xhenvolt systems talk to DRAIS.
      </p>

      <Box kind="warning" title="Three different things called &quot;API&quot;">
        <ul className="list-disc pl-5 space-y-1">
          <li><code>/api/*</code> — the app&apos;s own routes, session-authenticated.</li>
          <li><code>/api/control-center/*</code> — the operator console, control-cookie authenticated.</li>
          <li><code>/api/platform/v1/*</code> — this. Bearer <code>keyId:secret</code>.</li>
        </ul>
      </Box>

      <h2>The freeze</h2>

      <Table
        head={['Allowed', 'Not allowed']}
        rows={[
          [<>Add a field to a response</>, <>Remove a field</>],
          [<>Add an enum value <em>(consumers must tolerate unknown values)</em></>, <>Narrow a field&apos;s type</>],
          [<>Add a scope</>, <>Repurpose an error code</>],
          [<>Ship <code>/api/platform/v2</code> <strong>alongside</strong> v1</>, <>Replace v1</>],
        ]}
      />

      <p>
        This is why <code>scopes.ts</code> marks <code>staff:read</code>, <code>features:read</code> and{' '}
        <code>features:write</code> as post-freeze additions: adding a scope is non-breaking, removing one is
        not.
      </p>

      <Source path="src/lib/platform/contracts.ts">The canonical schema. Compatibility rules are stated at the top.</Source>
      <Source path="docs/adr/0011-platform-api-contract-freeze.md" />
      <Source path="docs/PLATFORM_CONTRACT_FREEZE.md" />

      <h2>Request lifecycle — the order is the security model</h2>

      <pre><code>{`requirePlatformAuth(req, ['schools:read'])
   1. parse Bearer  keyId:secret
   2. look up key            → 401 UNAUTHORIZED
   3. revoked?               → 401 KEY_REVOKED
   4. expired?               → 401 KEY_EXPIRED
   5. bcrypt-verify secret   → 401 UNAUTHORIZED   (same message as 2)
   6. IP allowlist           → 403 IP_NOT_ALLOWED
   7. required scopes        → 403 INSUFFICIENT_SCOPE
   8. rate limit             → 429 + Retry-After
   9. touch last_used_at     (fire-and-forget, never blocks)
        ↓  handler  ↓
finalizeAudit(ctx, status)`}</code></pre>

      <Box kind="invariant" title="Two properties of that order">
        <p>
          <strong>Every terminal branch writes an audit row</strong>, failures included. A rejected request
          that left no trace makes the audit log useless for exactly the incidents it exists for.
        </p>
        <p>
          <strong>Steps 2 and 5 return an identical 401.</strong> Distinguishing &quot;no such key&quot; from
          &quot;wrong secret&quot; would confirm valid key ids to an attacker.
        </p>
        <p>
          Do not reorder without an ADR. Rate-limiting before scope checking, for instance, would let an
          unauthorized caller consume another consumer&apos;s budget.
        </p>
      </Box>

      <h2>Writing a route</h2>

      <pre><code>{`const auth = await requirePlatformAuth(req, ['schools:read']);
if ('errorResponse' in auth) return auth.errorResponse;
const { ctx } = auth;

const data = await loadSchools();            // business logic only
const res  = ok(data, ctx.requestId, rateLimitHeaders(ctx));
await finalizeAudit(ctx, 200);
return res;`}</code></pre>

      <p>
        For mutations use <code>runMutation</code> instead — it supplies the raw body (1MB capped), the
        idempotency check, and audit finalisation on every exit path.
      </p>

      <h2>Why state lives in tables</h2>

      <Table
        head={['Concern', 'Where', 'Why not memory']}
        rows={[
          [<>Rate limiting</>, <><code>platform_rate_limits</code>, atomic upsert per minute window</>, <>An in-memory limiter on serverless is a limiter per lambda, i.e. none.</>],
          [<>Idempotency</>, <><code>Idempotency-Key</code> + hash of method+path+body</>, <>Replaying a key with a <em>different</em> payload must conflict, not silently return the old response.</>],
          [<>Webhooks</>, <>Queue + delivery worker</>, <>Nothing survives an invocation. Backoff: 30s / 2m / 10m / 30m / 2h / 6h.</>],
        ]}
      />

      <h2>Keys</h2>

      <ul>
        <li>Secrets are <strong>bcrypt-hashed</strong>; plaintext is shown once at issue and never recoverable.</li>
        <li><code>tokenFingerprint</code> gives a loggable, non-reversible handle.</li>
        <li>IP allowlist is exact-match on the parsed client IP — <strong>no CIDR ranges</strong>.</li>
        <li>Rate limits are per key, not per consumer. A consumer with several keys gets the sum.</li>
      </ul>

      <Box kind="warning" title="Operational gaps to know about">
        <ul className="list-disc pl-5 space-y-1">
          <li><code>processPendingDeliveries</code> is a worker function, not a daemon. If nothing invokes it, webhooks queue silently.</li>
          <li><code>pruneRateLimits</code> must be called periodically or the table grows without bound.</li>
          <li>Behind proxies, the IP allowlist depends on <code>x-forwarded-for</code> being trustworthy.</li>
        </ul>
      </Box>

      <h2>Adding capability</h2>

      <p>
        <strong>New capability means a new scope, never a broader existing one.</strong> Reusing{' '}
        <code>schools:read</code> for something that is not reading schools silently grants it to every
        existing consumer.
      </p>

      <Source path="src/lib/platform/README.md" />
      <Source path="docs/PLATFORM_API.md">Consumer-facing reference.</Source>
      <Source path="docs/PLATFORM_READINESS.md">Deferred follow-ups.</Source>

      <h2>The JETON integration</h2>

      <p>
        The live path is the platform v1 bearer integration. The older{' '}
        <code>external_connections</code> / drais-proxy route is deprecated. A deployed JETON needs a valid
        platform token and webhook secret in its hosting environment — a missing one fails as an auth error,
        not as an obvious configuration message.
      </p>

      <p>
        Next: <Link href="/control/docs/operations">Build &amp; operations</Link>.
      </p>
      <SeeAlso slugs={['security', 'operations', 'playbook-api', 'architecture']} />
    </ControlDoc>
  );
}
