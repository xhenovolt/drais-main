# DRAIS Platform API — Production Readiness

Checklist for going live with external consumers. Each item is either **DONE**
(implemented in code now), **WIRE** (code exists, needs ops to enable), or
**FOLLOW-UP** (deferred, listed so it isn't lost).

---

## 1. Security boundaries

| Item | State |
|---|---|
| Bearer-token auth on every platform route | DONE — `requirePlatformAuth` |
| bcrypt-hashed secrets at rest | DONE — `src/lib/platform/keys.ts` |
| Token shown once at issue, never readable again | DONE |
| Timing-safe secret comparison | DONE (bcrypt.compare) |
| Per-key IP allowlist | DONE — `allowed_ips` JSON |
| Per-key scope check on every route | DONE — `PLATFORM_SCOPES` enforced |
| Per-key expiry / revocation | DONE — `expires_at` / `revoked_at` |
| Rate limiting per key, DB-backed sliding minute | DONE |
| Request body size cap (1 MB) on mutations | DONE — `runMutation` |
| Idempotency-Key dedup on mutations | DONE — `runMutation` + `platform_idempotency_keys` |
| `409 CONFLICT` on idempotency-key body mismatch | DONE |
| Internal numeric `schools.id` never exposed externally | DONE — `external_id` only in public shapes |
| Stack traces / SQL errors stripped from responses | DONE — all errors normalized to error codes |
| Audit row written on every request (incl. 401/403/429) | DONE |
| HMAC-signed outbound webhooks (SHA-256, `t=…,v1=…`) | DONE |
| Webhook retries with exponential backoff (30s→6h, 6 attempts) | DONE |
| Webhook dedup at enqueue (unique on subscription_id, event_id) | DONE — `platform_api_hardening.sql` |
| HMAC on **inbound** mutations | FOLLOW-UP — token-only is sufficient until a leak; design ready |
| Vault / KMS for token storage | FOLLOW-UP — currently env vars / DB; rotate via revoke + issue |

## 2. Tenant isolation

| Item | State |
|---|---|
| Platform routes never read session cookie | DONE |
| School identifier always `external_id` in URLs and payloads | DONE |
| Aggregates never include per-pupil PII | DONE — `/analytics` returns counts only |
| `/usage?school=...` resolves `external_id → id` server-side; rejects unknown ids | DONE |
| `/webhooks` scoped to caller's `consumer` (cannot list/manage another consumer's hooks) | DONE |
| `/audit` filters by caller-controllable params only | DONE — `key_id`, `path`, cursor |
| Cross-school read attempts via numeric ID | NOT POSSIBLE — no numeric ID route exists |
| Tenant manipulation requires `schools:write` + IP allowlist (recommended) | DONE / WIRE |

## 3. Contract stability

| Item | State |
|---|---|
| URI versioning (`/api/platform/v1/...`) | DONE |
| Stable response envelope `{success, data}` / `{success, error}` | DONE |
| Stable error codes (documented enum) | DONE — `PlatformErrorCode` |
| TypeScript contracts file for consumers | DONE — `src/lib/platform/contracts.ts` |
| Backwards-compat policy documented | DONE — see contracts.ts header |
| `Deprecation:` / `Sunset:` headers on retired endpoints | FOLLOW-UP — when v2 ships |
| OpenAPI spec generated | FOLLOW-UP — `contracts.ts` is the current source of truth |

## 4. Failure modes

| Failure | Behavior |
|---|---|
| DB unreachable | `health` reports `degraded`; mutations 500 with `SERVER_ERROR`, no partial writes |
| Expired key | 401 `KEY_EXPIRED`, audited |
| Revoked key | 401 `KEY_REVOKED`, audited |
| Missing scope | 403 `INSUFFICIENT_SCOPE`, audited |
| IP not on allowlist | 403 `IP_NOT_ALLOWED`, audited |
| Body > 1 MB | 413 `PAYLOAD_TOO_LARGE`, audited |
| Malformed JSON | 400 `BAD_REQUEST`, audited |
| Duplicate POST with same Idempotency-Key + same body | 200 with cached response + `X-Idempotent-Replay: true` |
| Duplicate POST with same Idempotency-Key + different body | 409 `CONFLICT` |
| Handler throws | 500 `SERVER_ERROR`, audited, no leak of internals |
| Webhook receiver returns 5xx | retried 6× with backoff; then `dead`; visible via `/webhooks/{id}/deliveries?status=dead` |
| Webhook receiver hangs > 10 s | aborted, counted as failure |
| Same event enqueued twice for one subscription | second enqueue silently ignored (unique constraint) |
| Cron skipped (Hobby plan) | next invocation drains backlog up to 25 deliveries; no data loss |

## 5. Observability

| Signal | Where |
|---|---|
| Request count, latency, errors per key | `GET /api/platform/v1/ops?window=15` (scope `audit:read`) |
| Auth failures, scope denials, rate-limit hits | same |
| Webhook pending / failed / dead totals | same |
| Full request log | `GET /audit` with cursor pagination |
| Per-delivery log (response code, ms, body excerpt) | `GET /webhooks/{id}/deliveries` |
| Per-event log | `GET /events` |
| `X-Request-Id` on every response | DONE — log on consumer side for cross-system join |

## 6. Scaling

| Concern | Status |
|---|---|
| `platform_api_audit` index `(key_id, created_at)` for per-key timeline | DONE |
| `platform_api_audit` index `(error_code, created_at)` for ops | DONE |
| `webhook_deliveries` index `(status, next_retry_at)` for worker scan | DONE |
| `platform_rate_limits` PK on bucket; pruned by cron | DONE |
| Rate limiter survives multi-instance (DB-backed, not Map) | DONE — was Map in `/api/control`, replaced |
| Audit table growth | FOLLOW-UP — partition by month or retain N days; recommend retention job |
| `platform_events` growth | FOLLOW-UP — same |

## 7. Rollback

| Scenario | Procedure |
|---|---|
| Bad release introduces a regression in platform routes | `git revert`; `/api/internal/*` and `/api/control` still functional |
| Key compromised | `DELETE /api/admin/platform-keys?key_id=...`; issue a new one; consumer rotates env var |
| Receiver malfunction | toggle `is_active = false` on the webhook; failed deliveries stop retrying |
| Bad webhook URL | `PATCH /webhooks/{id}` to fix URL, then `POST /webhooks/{id}/deliveries/{deliveryId}/retry` |
| Migration broken | each platform migration is additive; rollback = `DROP TABLE` + `git revert` |

## 8. Disaster recovery

- Token secrets are not recoverable. If the DB is restored from a backup
  taken before a key was issued, that key will not authenticate. Re-issue.
- Webhook secrets follow the same rule. After a restore, all subscriptions
  may need to be recreated.
- `platform_api_audit` is the source of truth for "what did consumer X do."
  Treat it as financial-grade — back up with the rest of the database.

## 9. Pre-launch gate (must all be GREEN before pointing JETON at production)

- [ ] `platform_api_foundation.sql` applied to production TiDB
- [ ] `platform_api_hardening.sql` applied to production TiDB
- [ ] `JETON_API_KEY` removed from env (replaced by per-consumer keys)
- [ ] `CRON_SECRET` set in env
- [ ] Webhook delivery worker scheduled (Vercel Pro `* * * * *`, or external scheduler)
- [ ] First production key issued with minimum-needed scopes and IP allowlist
- [ ] `curl /api/platform/v1/health` returns 200 with `X-Request-Id`
- [ ] `curl /api/platform/v1/ops` returns 200 from the issued key
- [ ] `/api/platform/v1/webhooks` POST registers a test receiver and a probe event delivers
- [ ] Audit row written for each of the above

---

## When this checklist is green: how external consumers safely begin

Recommended JETON consumption order (in JETON, **not** built here):

1. **Smoke**: `GET /health` then `GET /ops?window=5` on first deploy.
2. **Backfill**: `GET /schools?limit=100` cursor-paginate fully into JETON's
   own tenants table.
3. **Subscribe**: `POST /webhooks` with `["school.*", "subscription.*"]`.
   Store the returned `secret`.
4. **Catch-up loop on JETON start**: `GET /events?since=<last_seen_emitted_at>`.
5. **Headline tiles**: poll `GET /analytics` no more than once per minute;
   polling more often is wasted (data is aggregated, not push-fresh).
6. **Per-tenant detail**: `GET /usage?school={external_id}` on demand only —
   do not pre-aggregate cross-tenant in JETON.
7. **Actions**: `POST /schools/{external_id}/suspend` and `/reactivate`,
   always with `X-Idempotency-Key`.
8. **Self-healing**: on JETON cold-start, also `GET /webhooks/{id}/deliveries?status=dead`
   and decide whether to retry via `POST .../retry` or drop.

Rollout plan:

- **Stage 0**: shadow mode — JETON consumes read-only endpoints; no
  suspensions or subscription changes.
- **Stage 1**: enable webhook reception in JETON; verify HMAC.
- **Stage 2**: enable subscription mutations from JETON, behind a feature
  flag, with IP allowlist on the key.
- **Stage 3**: enable suspension/reactivation. Require human approval in
  JETON UI for the first 30 days.
- **Stage 4**: lift the human-approval gate once `/ops` shows <0.1% server
  errors over 7 days.
