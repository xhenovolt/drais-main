# Jeton ↔ DRAIS — Track B Phase 0 Two-Project Audit (read-only)

DRAIS: this repo (Next.js / TiDB-MySQL). Jeton: `/home/xhenvolt/projects/jeton` (Next.js / PostgreSQL via `pg`). **No code changed.** No DB merge, no cross-DB reads — integration is API-only.

## Headline
This is **not greenfield** — a real integration already exists on both sides. DRAIS has a **frozen, scope-gated platform API**; Jeton already has a client, proxy routes, DRAIS dashboards, and an API-call observability table. The work is **consolidate + fill two gaps**, not build from scratch. The two gaps: (1) Jeton runs **two clients with different auth** (one wrong), and (2) Jeton has **no webhook receiver**.

---

## 1. DRAIS Platform API readiness map  ✅ ~95%
Base: `/api/platform/v1` · auth `Authorization: Bearer <keyId>.<secret>` (or `X-Api-Key: <keyId>.<secret>`) · bcrypt-hashed keys · per-key scopes, rate limit (600/min), optional IP allowlist, full audit. **Contract FROZEN** (`docs/PLATFORM_CONTRACT_FREEZE.md`, commit `a16dcb6`; `/api/platform/v2` reserved).

| Capability | Endpoint | Scope | Jeton use-case |
|---|---|---|---|
| Health | `GET /health` | `health:read` | system health ✅ |
| List/get schools | `GET /schools`, `/schools/{external_id}` | `schools:read` | list schools, status ✅ |
| Update/suspend/reactivate | `PATCH/.../suspend/.../reactivate` | `schools:write` | suspend/reactivate ✅ |
| Subscription r/w | `GET/PUT /subscriptions/{external_id}` | `subscriptions:read/write` | subscription + **paid/owed** ✅ |
| Usage | `GET /usage` (learners, staff, sms_sent, active_sessions, bytes) | `usage:read` | active learners ✅ |
| Analytics | `GET /analytics` (tenants, active/suspended/trial/expired, new_schools, plans) | `analytics:read` | portfolio analytics ✅ |
| Events feed | `GET /events?since&cursor&event_type` | `events:read` | recent events ✅ |
| Audit | `GET /audit`, `GET /ops` | `audit:read` | audit ✅ |
| Webhooks | `GET/POST/.../deliveries/.../retry` | `webhooks:manage` | webhook mgmt ✅ |

**Webhook SENDER exists** (`cron/platform-webhooks`) emitting: `school.created/updated/suspended/reactivated/deleted`, `subscription.changed/expired/expiring`, `payment.received`, `learner.limit.exceeded`, `sms.balance.low`, `tenant.health.degraded`.

**Scopes:** `schools:read|write`, `subscriptions:read|write`, `usage:read`, `analytics:read`, `events:read`, `webhooks:manage`, `audit:read`, `health:read`, plus `*`.

## 2. Jeton integration readiness map  ⚠️ ~70% (split + gap)
- **Two clients (inconsistent auth):**
  - `src/lib/draisClient.ts` — **OLD/WRONG**: sends `x-api-key` + `x-api-secret` as **two headers** (contract accepts only `X-Api-Key: keyId.secret` single header or Bearer); default base `https://drais-api.example.com` (placeholder). **Used by 6 `/api/drais/*` proxy routes** → these likely 401 against the real contract.
  - `src/lib/drais-platform.js` — **CORRECT/contract-aligned**: `DRAIS_PLATFORM_BASE_URL` + `DRAIS_PLATFORM_TOKEN`, X-Request-Id tracking, idempotency keys, logs every call to `drais_api_calls`. **Used by 1 route.**
- **Storage:** `drais_api_calls` observability table (migration 972); pricing/subscription engine (942/958/965); `950_drais_pricing_config`. Postgres, external-ref oriented.
- **UI:** `dashboard/drais/{activity,schools,pricing}`, `app/admin/drais/health`, `integrations` + key rotation. Jeton positions itself as DRAIS's "Master Control Panel" (`DRAIS_README.md`).
- **Webhook RECEIVER: MISSING.** `DRAIS_WEBHOOK_SECRET` is referenced but there is **no** `/api/.../webhook` route to receive/verify DRAIS events.

## 3. Missing DRAIS endpoints (additive; v1 is frozen → new non-breaking routes or v2)
- **Devices count** per school — not in `usage`/`analytics`. (Jeton use-case "devices count".)
- **Attendance activity summary** per school — no platform endpoint. (Jeton use-case "attendance activity summary".)
- Everything else Jeton needs is already served. *Recommendation:* add `devices` + `attendance_summary` as **new additive fields on `/usage`** (frozen contract allows additive fields) or new `GET /usage/devices` style endpoints — decide in Phase 1.

## 4. Missing Jeton client/services
1. **Consolidate** all `/api/drais/*` proxy routes onto `drais-platform.js`; **retire** `draisClient.ts` (wrong auth, placeholder URL).
2. **Webhook receiver**: `POST /api/drais/webhook` — verify HMAC with `DRAIS_WEBHOOK_SECRET`, idempotent by event id, upsert into Postgres, then register the endpoint via `POST /webhooks`.
3. **Sync/reconciliation job** (cron): pull `/events?since=<cursor>` + periodic `/analytics` + per-school `/usage` snapshots to self-heal missed webhooks.

## 5. Required env vars (Jeton)
Keep: `DRAIS_PLATFORM_BASE_URL`, `DRAIS_PLATFORM_TOKEN` (= `keyId.secret`), `DRAIS_WEBHOOK_SECRET`. **Deprecate:** `DRAIS_API_BASE_URL`, `DRAIS_API_KEY`, `DRAIS_API_SECRET` (old client). Add `.env.example` documenting the three.

## 6. Required scopes (for the Jeton platform key)
`schools:read`, `schools:write`, `subscriptions:read`, `subscriptions:write`, `usage:read`, `analytics:read`, `events:read`, `webhooks:manage`, `audit:read`, `health:read`. (Issue via DRAIS `POST /api/admin/platform-keys`, super-admin, with an IP allowlist for the production key.)

## 7. Recommended sync model — webhook-first + pull reconciliation
- **Push (primary):** DRAIS webhooks → Jeton receiver → update Postgres immediately (near-real-time status/subscription/payment).
- **Pull (safety net):** cron every N min reads `/events` from the stored cursor + refreshes `/analytics` and per-school `/usage`; reconciles anything missed.
- **Identity:** key everything on DRAIS `external_id`; **never store DRAIS internal numeric ids** in Jeton.

## 8. Webhook plan
DRAIS side is ready (sender + registration + delivery log + retry). Jeton must: build the receiver (HMAC verify, idempotent by event id, 2xx fast then process async), then `POST /webhooks` to register its URL + subscribe to the event types in §1. Use `/webhooks/{id}/deliveries` + retry for debugging.

## 9. No-DB-touch integration plan
All access via `/api/platform/v1` with the scoped key. Jeton's Postgres stores only: external refs (`external_id`), cached snapshots (status/subscription/usage/analytics), the events cursor, and `drais_api_calls`. DRAIS never reads Jeton; Jeton never reads DRAIS's TiDB.

---

## Recommended Phase order (await go-ahead)
- **B1 (DRAIS side):** add additive `devices` + `attendance_summary` to `/usage` (only the two genuine gaps); leave the frozen surface otherwise untouched.
- **B2 (Jeton side):** consolidate onto `drais-platform.js`, retire `draisClient.ts`, build the webhook receiver + registration, add the reconciliation cron, write `.env.example`.

**STOP / await confirmation before any implementation.** No STOP-blocker found — integration is safe to proceed.
