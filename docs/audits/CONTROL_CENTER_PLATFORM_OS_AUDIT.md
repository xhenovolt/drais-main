# DRAIS Control Center — Platform-OS Audit (Phase 0)

**Framing:** treat Control as a *Platform Operating System*, not a dashboard.
**Status: AUDIT ONLY — no implementation.** All findings verified against the
codebase as of v1.118.0.

## Where we start from (already shipped, v1.106.0 → v1.118.0)

Isolated platform auth · device fleet management · school lifecycle
(archive/soft/hard-delete + enforced) · platform reads without impersonation ·
opt-out module control (UI + gate) · cross-school health scan · subscription
**plans with billing** (price/cycle/installments/deliverables) · assign/renew →
date-based auto-suspend via the session gate · exports/print · theming · full
audit.

So the *daily-ops surface* is done. This audit is about the **infrastructure
underneath**: money, trust, automation, resilience, and scale. Nine pillars,
each finding tagged with the requested fields.

Legend — **Cx** complexity (S/M/L/XL) · **FD** founder-dependence removed ·
**Risk** of the change itself.

---

## Pillar A — Console Security & Governance  *(highest operational risk)*

### E-1 · No login rate-limiting or lockout  — **P0**
- **Business impact:** the one credential that controls every tenant is
  brute-forceable at full speed; a breach = total platform compromise.
- **Technical cause:** `loginControl` verifies a password with no attempt
  tracking, backoff, lockout, or `429`.
- **Current arch:** scrypt verify → issue session. Constant-shape failure only.
- **Proposed arch:** `control_login_attempts` (email+IP, window); exponential
  backoff + temporary lockout + `429`; pure `shouldThrottle()`; optional
  alert on repeated failures.
- **Cx:** S · **FD:** — (security) · **Benefit:** brute-force resistant login ·
  **Version:** v1.119.0 · **Risk:** low.

### E-2 · Optional 2FA (TOTP) — *not mandatory*  — **P1**
- **Business impact:** password-only access to God-mode; a leaked password is
  game over.
- **Technical cause:** no MFA anywhere in the control stack.
- **Current arch:** cookie session after password.
- **Proposed arch:** per-operator **opt-in** TOTP enrolment (QR + recovery
  codes) stored on `control_users`; verified at login *only when enabled*; an
  org-level "require 2FA for new operators" toggle in settings — never forced
  globally.
- **Cx:** M · **FD:** — · **Benefit:** operators/orgs opt into strong auth ·
  **Version:** v1.121.0 · **Risk:** medium (must not lock out un-enrolled users).

### E-3 · No impersonation kill-switch / active-session view  — **P1**
- **Business impact:** a leaked or forgotten impersonation token lives its full
  2h with no way to see or revoke it.
- **Technical cause:** `impersonationStatus` inspects one token; no listing/
  revoke-all.
- **Proposed arch:** `listActiveImpersonations()` + `endImpersonation(byId)` /
  `endAll()`; a live panel with one-click revoke; auto-expire sweep.
- **Cx:** S · **FD:** — · **Benefit:** provable control over tenant access ·
  **Version:** v1.120.0 · **Risk:** low.

### E-4 · Binary governance (super-admin vs the rest)  — **P2**
- **Business impact:** can't safely delegate — a billing clerk or support agent
  needs full super-admin, over-privileging every helper.
- **Technical cause:** roles exist (`SUPER_ADMIN`/`OPERATOR`/`VIEWER`) but
  `canManage` only checks SUPER_ADMIN; operator/viewer are undifferentiated.
- **Proposed arch:** a permission catalog (billing / support / devices /
  schools / read-only) mapped to roles; `requireControlPermission(code)`
  replacing the blanket `canManage`.
- **Cx:** M · **FD:** delegated ops without founder · **Benefit:** least-
  privilege operators · **Version:** v1.124.0 · **Risk:** medium.

### E-5 · Open first-run bootstrap  — **P2**
- **Business impact:** whoever hits a fresh deployment first claims the founder
  account.
- **Technical cause:** setup is gated only by "no control user exists yet".
- **Proposed arch:** require `CONTROL_BOOTSTRAP_SECRET` (env) to create the
  first operator.
- **Cx:** S · **FD:** — · **Version:** v1.119.0 (with E-1) · **Risk:** low.

---

## Pillar B — Commercial Operations: Billing, Invoicing, Reconciliation  *(highest business value)*

### E-6 · Billing is declarative, not transactional — no ledger  — **P0 (business)**
- **Business impact:** the platform can price and time-suspend, but cannot
  answer "who owes what, who paid, what's outstanding" — no revenue truth, no
  receipts, no installment tracking. This is the core of running a SaaS.
- **Technical cause:** plans carry price/cycle, but there is **no
  invoices/payments schema** and no reconciliation.
- **Current arch:** `subscription_end_date` + session gate = time-based suspend.
- **Proposed arch:** `platform_invoices` (school, plan, period, amount, due_date,
  status) + `platform_payments` (invoice, amount, method, ref, received_at) +
  reconciliation that marks invoices paid and (re)computes `subscription_end_date`
  from **payment**, not a date pick. Installment schedule per invoice.
- **Cx:** L · **FD:** the founder stops tracking payments in a spreadsheet ·
  **Benefit:** real accounts-receivable, receipts, statements · **Version:**
  v1.122.0 · **Risk:** medium (money — needs careful tests + audit).

### E-7 · No payment-gateway / mobile-money reconciliation  — **P1**
- **Business impact:** payments are recorded by hand; no automatic "paid →
  reactivated".
- **Technical cause:** no gateway webhook receiver on the platform side.
- **Proposed arch:** a pluggable payment provider interface (mobile money / bank
  / manual) + a webhook receiver that creates `platform_payments` and triggers
  reconciliation → auto-renew. (Mirrors the Jeton webhook pattern already in the
  repo.)
- **Cx:** L · **FD:** payment→reactivation with no human · **Version:** v1.123.0
  · **Risk:** medium.

### E-8 · No dunning / grace period / proration  — **P1**
- **Business impact:** schools are suspended cold with no warning, hurting
  retention; upgrades mid-cycle aren't prorated.
- **Proposed arch:** dunning schedule (T-7/T-1/T+0 reminders), a configurable
  grace window before hard suspend, and proration on plan change.
- **Cx:** M · **FD:** — · **Version:** v1.125.0 · **Risk:** low.

---

## Pillar C — Entitlement Enforcement

### E-9 · Plan limits declared but not enforced at create-time  — **P1**
- **Business impact:** a Starter school can add unlimited learners/devices —
  limits are advisory, so plans don't actually gate usage or drive upsell.
- **Technical cause:** `checkCanAdd` exists + usage is shown, but it isn't wired
  into the learner/staff/device create paths.
- **Proposed arch:** a `enforcePlanLimit(schoolId, resource)` guard at each
  create endpoint returning a clear "plan limit reached — upgrade" error.
- **Cx:** M · **FD:** — · **Benefit:** plans mean something; upsell trigger ·
  **Version:** v1.126.0 · **Risk:** medium (must not block legitimate growth —
  needs per-school override).

### E-10 · Module server-gate coverage incomplete  — **P2**
- **Business impact:** a disabled module is hidden in the sidebar but some APIs
  still answer — defence-in-depth gap.
- **Technical cause:** `requireModule` gates ~49 routes; Finance/Academics/
  Attendance API routes aren't all wrapped.
- **Proposed arch:** wrap the remaining module routes with `requireModule`
  (mechanical), ideally via the `withRoute` wrapper.
- **Cx:** M · **FD:** — · **Version:** v1.127.0 · **Risk:** low.

---

## Pillar D — Tenant Communications & Lifecycle Automation

### E-11 · Platform never talks to the tenant  — **P1**
- **Business impact:** suspension/expiry/renewal happen silently; schools are
  surprised and churn; the founder fields "why am I locked out" calls.
- **Technical cause:** no platform→school notification on lifecycle events.
- **Proposed arch:** platform lifecycle events (`expiring_soon`, `suspended`,
  `renewed`, `plan_changed`) → in-app + email/SMS to school admins, reusing the
  existing NotificationService + outbox.
- **Cx:** M · **FD:** the founder stops manually warning schools · **Version:**
  v1.125.0 (with dunning) · **Risk:** low.

---

## Pillar E — Operational Intelligence, Predictive Monitoring, Health Scoring

### E-12 · Health is a point-in-time scan, not intelligence  — **P2**
- **Business impact:** the founder sees "now" but not trends, and isn't *told* —
  problems are still pull, not push.
- **Technical cause:** `getPlatformHealth` runs synchronously per request; no
  history, no scoring over time, no alerting.
- **Proposed arch:** persist daily platform-health snapshots → per-school health
  **score + trend**; predictive flags (e.g. "attendance decaying 5 days →
  device failing"); founder alerting via email/webhook when a school crosses a
  threshold.
- **Cx:** L · **FD:** discover problems before the school calls · **Version:**
  v1.128.0 · **Risk:** low.

### E-13 · No founder alerting channel  — **P2**
- **Business impact:** you must open the console to learn anything.
- **Proposed arch:** an outbound alert sink (email/Slack/webhook) for
  critical platform events (school down, payment failed, backup failed).
- **Cx:** S · **Version:** v1.128.0 · **Risk:** low.

---

## Pillar F — Background Processing & Scheduled Maintenance

### E-14 · Single cron is a structural ceiling  — **P1**
- **Business impact:** every automation (intelligence sweep, digest, health
  snapshots, dunning, reconciliation retries) must piggyback ONE daily cron —
  fragile and non-scalable.
- **Technical cause:** Vercel Hobby allows exactly one cron; everything hangs off
  `/api/result-deadlines`.
- **HARD CONSTRAINT:** **no new cron may ever be added** (Hobby-plan limit). The
  fix must make the *existing* cron do more, not add a second.
- **Proposed arch:** a lightweight **in-DB job runner** — a `platform_jobs`
  table (type, run_after, status, attempts, locked_at) + a **dispatcher invoked
  by the ONE existing cron** on each daily fire, which claims and runs all *due*
  jobs (dunning, health snapshot, reconciliation retry, maintenance) with row
  locking + retry/backoff. Jobs may also be enqueued to run on the *next*
  request-driven tick or triggered on-demand from Control. This decouples "what
  runs" from "how many crons exist" — zero new crons. (An optional paid-tier
  external scheduler can later hit the same dispatcher endpoint more often, but
  is never required.)
- **Cx:** L · **FD:** automation stops being founder-triggered · **Version:**
  v1.129.0 · **Risk:** medium.

### E-15 · No platform-level guided repair / scheduled maintenance  — **P3**
- **Business impact:** cross-school fixes (re-evaluate a region, resync a fleet)
  are still per-school/manual.
- **Proposed arch:** platform maintenance actions run as background jobs with
  progress + audit.
- **Cx:** M · **Version:** v1.130.0 · **Risk:** low.

---

## Pillar G — Provisioning & Onboarding

### E-16 · School provisioning is thin  — **P2**
- **Business impact:** onboarding a school still needs manual steps; no clone,
  no seed, no license/activation keys.
- **Technical cause:** create exists (school app); Control has no clone / seed-
  defaults / license-key generation / guided onboarding.
- **Proposed arch:** Control "New school" wizard → create + assign plan + seed
  default data (terms, roles, grading) + issue an activation/license key +
  optional device pre-assignment.
- **Cx:** L · **FD:** onboard a school end-to-end from Control · **Version:**
  v1.131.0 · **Risk:** medium.

---

## Pillar H — Scalability & Multi-tenant at Scale

### E-17 · Control queries scan all schools per request  — **P2**
- **Business impact:** fine for tens, breaks the console at thousands (slow
  loads, DB pressure).
- **Technical cause:** schools list, health scan, device list load full sets;
  no pagination/virtualization; health scan is synchronous.
- **Proposed arch:** server-side pagination + search + indexed filters;
  precomputed health snapshots (E-12) instead of live scans; response caching
  for read-heavy overviews.
- **Cx:** L · **FD:** — · **Benefit:** console stays fast at 10³ schools ·
  **Version:** v1.132.0 · **Risk:** medium.

### E-18 · Multi-tenant isolation is enforced but not continuously verified  — **P2**
- **Business impact:** a future query that drops `school_id` silently re-opens a
  cross-tenant leak (this happened once — the device list).
- **Technical cause:** isolation is per-route; only the device routes have a
  regression guard.
- **Proposed arch:** an automated isolation test suite + a lint/CI check that
  flags any tenant query lacking a `school_id` predicate.
- **Cx:** M · **Version:** v1.127.0 (with E-10) · **Risk:** low.

---

## Pillar I — Disaster Recovery, Backup, Deployment/Rollback

### E-19 · No backup validation / restore workflow surfaced  — **P1**
- **Business impact:** TiDB Cloud backs up, but there's no *validated* restore
  drill and no per-tenant export — an untested backup is a hope, not a plan.
- **Technical cause:** no DR tooling in Control.
- **Proposed arch:** scheduled **backup-verification job** (restore a snapshot
  to a scratch schema, run integrity checks, report), per-tenant data export,
  and a documented restore runbook surfaced in Control.
- **Cx:** L · **FD:** DR without the founder SSH-ing anywhere · **Version:**
  v1.133.0 · **Risk:** medium.

### E-20 · No deployment-safety / rollback strategy in-product  — **P2**
- **Business impact:** a bad deploy or migration can hurt every tenant at once;
  recovery is ad-hoc.
- **Technical cause:** runtime schema-ensure is forward-only; no migration
  versioning/rollback; no maintenance mode.
- **Proposed arch:** versioned migrations with up/down, a platform
  **maintenance-mode** flag (read-only banner), a pre-deploy smoke check, and a
  documented rollback (redeploy previous tag) — the `withRoute`/health surface
  can host a "platform status" toggle.
- **Cx:** L · **Version:** v1.134.0 · **Risk:** medium.

---

## Pillar J — Platform APIs & Business Intelligence

### E-21 · No revenue / platform BI  — **P3**
- **Business impact:** no MRR, churn, ARPU, plan-mix, or growth view — you can't
  see the *business*, only the operations.
- **Technical cause:** no BI aggregation over subscriptions/payments.
- **Proposed arch:** a platform BI page (MRR, active/suspended, churn, revenue
  by plan/region) built on the billing ledger (E-6).
- **Cx:** M · **FD:** — · **Version:** v1.135.0 · **Risk:** low.

### E-22 · External platform API is partial  — **P3**
- **Business impact:** partners/automation (e.g. Jeton) have limited surface.
- **Technical cause:** `platform/v1` exists but isn't a complete, documented,
  key-scoped API for platform operations.
- **Proposed arch:** round out `platform/v1` (schools, subscriptions, health)
  with scoped API keys + rate limits + docs.
- **Cx:** M · **Version:** v1.136.0 · **Risk:** low.

---

## Recommended roadmap (ordered by risk × business value × founder-independence)

| Phase | Theme | Findings | Version | Why here |
|------|-------|----------|---------|----------|
| **8** | **Console security** | E-1, E-5 | v1.119.0 | Highest risk, smallest lift — brute-force + bootstrap |
| **9** | Impersonation control | E-3 | v1.120.0 | Provable tenant-access control |
| **10** | Optional 2FA | E-2 | v1.121.0 | Opt-in strong auth (never forced) |
| **11** | **Billing ledger** | E-6 | v1.122.0 | Revenue truth — the core SaaS gap |
| **12** | Payments + reconciliation | E-7 | v1.123.0 | Payment → auto-reactivate |
| **13** | Control RBAC | E-4 | v1.124.0 | Safe delegation of ops |
| **14** | Dunning + tenant comms | E-8, E-11 | v1.125.0 | Retention; stop silent suspends |
| **15** | Limit enforcement | E-9 | v1.126.0 | Plans that actually gate + upsell |
| **16** | Gate coverage + isolation CI | E-10, E-18 | v1.127.0 | Defence-in-depth |
| **17** | Predictive health + alerting | E-12, E-13 | v1.128.0 | Push, not pull |
| **18** | Job runner | E-14 | v1.129.0 | Break the single-cron ceiling |
| **19** | Guided maintenance | E-15 | v1.130.0 | Fleet-wide repair |
| **20** | Provisioning wizard | E-16 | v1.131.0 | End-to-end onboarding |
| **21** | Scale (pagination/caching) | E-17 | v1.132.0 | 10³ schools |
| **22** | Backup validation + restore | E-19 | v1.133.0 | Tested DR |
| **23** | Deploy safety + rollback | E-20 | v1.134.0 | Blast-radius control |
| **24** | Platform BI | E-21 | v1.135.0 | See the business |
| **25** | Platform API v1 complete | E-22 | v1.136.0 | Partner/automation surface |

### Sequencing rationale
1. **Security first (8–10, 13):** the console governs every tenant; harden it
   before building more power on top. Cheap, high-risk-reduction.
2. **Money next (11–12, 14–15):** the billing ledger + payments + dunning +
   enforcement is the single biggest founder-independence and revenue lever.
3. **Resilience & automation (16–19, 22–23):** once money flows, make it run
   itself and survive failure.
4. **Scale & insight (21, 24–25):** last, because they matter at volume you
   reach *after* the above.

### Execution rules (per approved phase)
Visible production-ready improvement · minor version bump · migration notes +
release notes · regression tests · commit + push **after verification only**.
2FA ships **optional** (per-operator opt-in, org-level "encourage/require for
new operators" — never a hard global requirement).

### Global platform constraints (apply to every phase)
- **No new cron, ever.** Vercel Hobby permits exactly one; all scheduled work
  (dunning, health snapshots, reconciliation, backup checks, maintenance) must
  route through the **existing** `/api/result-deadlines` cron via the E-14 job
  dispatcher, or be request-/on-demand-triggered. Any phase that needs periodic
  work enqueues a `platform_jobs` row — it never adds a schedule.
- **Runtime schema-ensure** stays the migration mechanism (additive, promise-
  gated) — no destructive auto-migrations.
- **Everything audited**, every mutation reversible or export-first where it
  isn't.

---

## Bottom line
The Control Center is a complete **operations** layer sitting on an **incomplete
platform**. The missing quartile is, in order: **trust** (console hardening),
**money** (a real billing/payment ledger), **automation** (a job runner beyond
one cron + predictive health), and **resilience** (validated DR + deploy
safety). None are cosmetic; each is additive on what exists. Ship security first,
money second.
