# DRAIS — Architectural Gap Analysis (read-only)

Scope: what's genuinely missing in DRAIS for the Jeton master-control goal + general readiness. Evidence from the codebase + live checks (sims.drais.pro, shared TiDB). Reads & manual control work; **the event-driven/automation side is built but not running.**

---

## 🔴 Critical — these make master-control automation non-functional today

### C1. Webhook deliveries are never sent
`emitPlatformEvent()` only **enqueues** (`platform_events` + `webhook_deliveries` rows). Actual delivery happens in `/api/cron/platform-webhooks` — which is **not in `vercel.json` crons** and has **no opportunistic trigger** (unlike the notification drain, which `zk-handler` kicks). So every enqueued event sits undelivered. Even the events DRAIS *does* emit never reach Jeton.
- **Fix:** the cron route already accepts `CRON_SECRET` (Bearer / `x-cron-secret`). Point an external scheduler (GitHub Actions / cron-job.org / Jeton's own scheduler) at `POST /api/cron/platform-webhooks` every 1–5 min. Or add an opportunistic drain after `emitPlatformEvent`.

### C2. Most webhook events are never emitted
Only **`school.suspended` / `school.reactivated` / `school.updated` / `subscription.changed`** are emitted — and only when someone calls the platform API. **Declared-but-never-emitted:** `subscription.expired`, `subscription.expiring`, `payment.received`, `learner.limit.exceeded`, `sms.balance.low`, `tenant.health.degraded`, `school.created`, `school.deleted`.
- Consequence: **auto-suspend-on-expiry via webhook never fires**; no payment/health/limit alerts. (Jeton's `/api/drais/reconcile` sweep is the working workaround for expiry.)
- **Fix:** call `emitPlatformEvent` from the expiry path, payment recording, learner-limit + SMS-balance checks, and school create/delete.

### C3. No DRAIS-native expiry enforcement
`subscription.ts` auto-expires **lazily** — only when a school's own users hit `auth/login` or `auth/me`, it sets `subscription_status='expired'`. It does **not** suspend the school and does **not** emit an event. And `auth.ts` blocks access **only on `school_status='suspended'`**, not on `subscription_status='expired'`. So an expired school keeps working until it's explicitly suspended.
- **Fix:** a scheduled sweep that suspends (or emits `subscription.expired` for) schools past `subscription_end_date`. Until then, **Jeton's reconcile sweep owns this** (and works, because it calls `suspend`).

---

## 🟠 Important — Jeton use-case coverage gaps

### I1. Devices count not exposed
Jeton wants per-school device count; `devices` exists (with `school_id`) but `/usage` doesn't include it. Additive fix to `/usage`.

### I2. Attendance activity summary not exposed
No platform endpoint summarizes attendance activity per school (a stated Jeton use-case). Additive.

### I3. Billing detail thin
`/subscriptions/{id}` exposes plan/status/dates but not amount_paid / amount_owed / payment history, and `payment.received` isn't emitted. Jeton can't show real billing flow yet.

---

## 🟡 Operational / hygiene

### O1. Cron coverage
Only `result-deadlines` is scheduled. `notification-drain` (opportunistic ✓), but `device-status`, `aggregate-refresh`, `platform-webhooks` are unscheduled → stale device status, stale aggregates, undelivered webhooks (see C1).

### O2. Migration/schema drift
This session found `schools.external_id`, the parent-portal tables, the platform tables, and `comm_settings.sms_enabled` **missing from the live DB** until applied by hand — code shipped expecting columns that weren't there. There's no migration ledger/runner discipline.
- **Fix:** a `schema_migrations` ledger + an apply step in deploy, so code never outruns schema.

### O3. Platform key management is API-only
`/api/admin/platform-keys` exists but there's **no admin UI** to issue / revoke / rotate / view keys. Keys are minted by curl or DB insert. A small admin page would de-risk key ops.

### O4. Legacy `/portal` latent bugs
The old parent portal still has the `exams.created_at` / `report_snapshots.created_at` query bugs (fixed in the new `/parent`). It's superseded but still reachable. Retire or fix.

---

## ✅ What's solid
- Platform API surface: schools, subscriptions, usage (+storage/db_footprint/staff/features), analytics, events, audit, webhooks — with scopes, rate limiting, IP allowlist, audit log, idempotency.
- Bearer auth + consistent `external_id` (after the list-route fix).
- Parent portal `/parent` (Track A) — complete, tested, responsive.
- Jeton side (Track B2): receiver, auto-suspend handler, reconcile, consolidated client, one-click webhook registration.

---

## Recommended order for "next step"
1. **C1 — make webhook delivery run** (external scheduler hitting the cron with `CRON_SECRET`). Single highest-impact fix; unblocks all push automation.
2. **C2/C3 — emit `subscription.expired` + `payment.received`, add an expiry sweep** (or formally let Jeton reconcile own expiry).
3. **I1/I2 — add `devices` + `attendance_summary` to `/usage`** (additive).
4. **O2 — migration ledger** so schema stops drifting from code.
5. **I3 billing detail, O3 key admin UI, O4 retire /portal** — as polish.
