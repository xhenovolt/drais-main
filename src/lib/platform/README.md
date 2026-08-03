# `src/lib/platform/` — Platform API v1

The **external** API. Machine-to-machine, key-authenticated, frozen contract. This is how JETON and future Xhenvolt systems talk to DRAIS.

Not to be confused with `/api/*` (the app's own routes, session-authenticated) or `src/lib/control/` (Xhenvolt operator console, cookie-authenticated). Three different auth systems for three different callers.

## Responsibilities

Authenticate API keys, enforce scopes and IP allowlists, rate-limit, deduplicate mutations, audit every request, and emit webhooks — so that route handlers under `/api/platform/v1/` contain only business logic.

## The contract is frozen

`contracts.ts` is the canonical schema, and v1 is **frozen** ([ADR-0011](../../../docs/adr/0011-platform-api-contract-freeze.md)):

- Fields may be **added** to responses.
- Fields will **not** be removed, nor have their types narrowed.
- Error codes will **not** be repurposed.
- Enum values may be **added** — consumers must tolerate unknown values.
- Anything breaking ships as `/api/platform/v2` **alongside** v1, never replacing it.

This is why the scopes list has a comment marking `staff:read` / `features:read` / `features:write` as post-freeze additions: adding a scope is non-breaking, removing one is not.

## Request lifecycle

Every platform route runs the same sequence, in this order — the order is the security model:

```
requirePlatformAuth(req, ['schools:read'])
   1. parse Bearer  keyId:secret
   2. look up key            → 401 UNAUTHORIZED
   3. revoked?               → 401 KEY_REVOKED
   4. expired?               → 401 KEY_EXPIRED
   5. bcrypt-verify secret   → 401 UNAUTHORIZED   (same message as 2 — no oracle)
   6. IP allowlist           → 403 IP_NOT_ALLOWED
   7. required scopes        → 403 INSUFFICIENT_SCOPE
   8. rate limit             → 429 + Retry-After
   9. touch last_used_at     (fire-and-forget, never blocks)
      ↓
   handler
      ↓
finalizeAudit(ctx, status)
```

**Every terminal branch writes an audit row**, including the failures. A rejected request that left no trace would make the audit log useless for exactly the incidents it exists for.

Steps 2 and 5 return the identical `401 UNAUTHORIZED / "Invalid key"` on purpose — distinguishing "no such key" from "wrong secret" would confirm valid key ids to an attacker.

## Files

| File | Purpose |
|---|---|
| `contracts.ts` | The frozen v1 types. External consumers copy from here. **Read the compatibility rules at the top before editing.** |
| `auth.ts` | `requirePlatformAuth` — the gate above. Also `finalizeAudit` and `rateLimitHeaders`. |
| `keys.ts` | Key issuance, revocation, listing, lookup. Secrets are **bcrypt-hashed**; the plaintext is shown once at issue time and never recoverable. `tokenFingerprint` gives a loggable non-reversible handle. |
| `scopes.ts` | The scope vocabulary. `resource:action` — additive only. |
| `rateLimit.ts` | Per-key sliding-minute window, TiDB-backed. Atomic via `INSERT … ON DUPLICATE KEY UPDATE` — no in-memory counter, because serverless instances don't share memory. |
| `idempotency.ts` | `Idempotency-Key` support. Caches the response body keyed on (key, idem-key) and **hashes method+path+body** so replaying the same key with a *different* payload is reported as a conflict rather than silently returning the old response. |
| `withMutation.ts` | Wrapper for POST/PATCH/PUT/DELETE: 1 MB body cap, idempotency, and a try/catch that always finalizes audit on the way out. Use it for every mutation handler. |
| `response.ts` | The `{ success, data }` / `{ success, error }` envelope, `X-Request-Id`, `X-Api-Version`, `Cache-Control: no-store`, and the shared `Errors` catalog. |
| `audit.ts` | `platform_audit` writes. Wrapped in try/catch — **an audit failure must never fail the request**. |
| `events.ts` | Domain events (`school.suspended`, `subscription.expired`, `sms.balance.low`, …) persisted for webhook fan-out and consumer polling. |
| `webhooks.ts` | Delivery worker. HMAC-signed payloads (`whsec_…` secrets), batches of 25, exponential backoff at 30s / 2m / 10m / 30m / 2h / 6h. |

## Writing a platform route

```ts
const auth = await requirePlatformAuth(req, ['schools:read']);
if ('errorResponse' in auth) return auth.errorResponse;
const { ctx } = auth;

const data = await loadSchools();          // business logic only
const res  = ok(data, ctx.requestId, rateLimitHeaders(ctx));
await finalizeAudit(ctx, 200);
return res;
```

For mutations, wrap the handler in `runMutation` instead — it supplies the raw body, the idempotency check, and audit finalization.

## Working in this folder

- **Never widen a response type or remove a field.** See the freeze rules. Adding is free; anything else is v2.
- **New capability → new scope, never a broader existing one.** Reusing `schools:read` for something that isn't reading schools silently grants it to every existing consumer.
- **State goes in TiDB, not in memory.** Rate-limit buckets, idempotency records and webhook queues all live in tables because serverless instances are not shared. An in-memory rate limiter here would be a rate limiter per lambda, i.e. none.
- **Audit writes must stay non-fatal.** Keep the try/catch.
- **Changing the request lifecycle order?** Don't, without an ADR. Rate-limiting before scope checking, for instance, would let an unauthorized caller consume another consumer's budget.

## Known constraints

- **Rate limiting costs a database round trip per request.** Accepted, for correctness across instances.
- **Webhook delivery needs something to invoke `processPendingDeliveries`.** It is a worker function, not a daemon; if nothing calls it, events queue up silently.
- **`pruneRateLimits` must be called periodically** or `platform_rate_limits` grows without bound.
- **Rate limits are per key, not per consumer.** A consumer holding several keys gets the sum.
- **The IP allowlist is exact-match on the parsed client IP.** No CIDR ranges. Behind proxies it depends on `x-forwarded-for` being trustworthy.

## Dependencies

`src/lib/db` · `bcryptjs` · `node:crypto` · `next/server`

## Related

[`docs/PLATFORM_API.md`](../../../docs/PLATFORM_API.md) — consumer-facing reference · [`docs/PLATFORM_CONTRACT_FREEZE.md`](../../../docs/PLATFORM_CONTRACT_FREEZE.md) — what may never change · [`docs/PLATFORM_READINESS.md`](../../../docs/PLATFORM_READINESS.md) — deferred follow-ups · [ADR-0011](../../../docs/adr/0011-platform-api-contract-freeze.md) · [ADR-0008](../../../docs/adr/0008-two-auth-systems.md)
