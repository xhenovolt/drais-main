# `src/lib/control/` — Xhenvolt Control Center

The **platform operator's** console. Not a school feature. This is how Xhenvolt runs DRAIS as a business: provision tenants, bill them, watch their health, and support them without asking for their password.

UI at `/control`, API at `/api/control-center/*`.

> **`/api/control` belongs to JETON, not to this.** Control Center routes are always under `/api/control-center`. Getting this wrong routes platform operations into a different product.

## Responsibilities

Everything that is true *across* schools rather than inside one: tenant lifecycle, subscriptions and money, plan limits, cross-school health, device ownership, SMS economics, impersonation, and the operator accounts themselves.

## The isolation boundary — read this first

The Control Center is a **separate security domain** from school authentication ([ADR-0008](../../../docs/adr/0008-two-auth-systems.md)):

| | School auth | Control auth |
|---|---|---|
| Tables | `users`, `sessions` | `control_users`, `control_sessions`, `control_audit_logs` |
| Cookie | `drais_session` | `drais_control` |
| Hashing | bcrypt | node `scrypt` |
| Code | `src/lib/auth.ts` | `src/lib/control/auth.ts` |

**No shared code path, no shared table.** The point is blunt: a mistake in the Control Center cannot break school login, and a compromise of one domain is not automatically a compromise of the other. Session tokens are 48 random bytes; only their SHA-256 is stored, so a database leak yields no usable sessions.

Do not "helpfully" refactor these two together.

## Recurring design patterns

Three patterns repeat across nearly every file here, and they are deliberate:

**1. Pure core, audited shell.** Each module factors its decision logic into a pure, unit-tested function (`dunningStage`, `healthScore`, `throttleDecision`, `controlCan`, `resolveEnforcement`, `monthlyEquivalent`, `computeBackoffSeconds`, `validateDeviceAction`, `usageAgainst`) with the I/O and `controlAudit` around it. That is why `__tests__/` has a file per module and no database.

**2. One cron, many jobs.** Vercel Hobby permits exactly one cron and DRAIS already spends it. So periodic work is a `platform_jobs` **row**, not a schedule: register a handler in `job-handlers.ts`, enqueue a job, and the existing daily cron (or any request tick) calls `runDueJobs()` to claim and execute due work with backoff. **Never add a cron.**

**3. Safe by default when touching live tenants.** Plan enforcement is off unless explicitly enabled, and any enforcement error allows rather than blocks. Hard delete requires four independent guardrails. Maintenance read-only mode never blocks the Control Center itself, so an operator can always switch it back off.

## Files

**Auth & operators**

| File | Purpose |
|---|---|
| `auth.ts` | The isolated auth domain: sessions, scrypt hashing, `controlAudit`. |
| `permissions.ts` | `SUPER_ADMIN` / `OPERATOR` / `VIEWER`. Replaced a binary super-admin-only gate so support work can be delegated. Reads are open to any authenticated session; only mutations are gated. |
| `login-guard.ts` | Exponential backoff + lockout on failed logins. This is the one credential that governs every tenant. |
| `totp.ts` | RFC 6238 TOTP on `node:crypto` (HMAC-SHA1), no dependency. Opt-in per operator. |
| `impersonation.ts` | Enter a school and use its whole app without its password. Mints a real but short-lived (2h) school session flagged `impersonated_by_control_user`, fully audited, with a visible banner. School login and existing sessions are untouched. |

**Money**

| File | Purpose |
|---|---|
| `subscriptions.ts` | The plan catalog — named tiers with learner/staff/device/SMS/storage limits. Schools reference a plan by code through the existing `schools.subscription_plan` column, so no tenant schema change was needed. |
| `billing.ts` | Invoices, payments, reconciliation. **Access is driven by payment**: recording a payment extends `subscription_end_date`, and the session gate auto-suspends a school past its paid-through date. No manually-picked dates. |
| `billing-webhook.ts` | Provider-agnostic gateway receiver. HMAC-verified, normalized, deduped on gateway transaction id → payment → reconciliation → auto-reactivation, with no human in the loop. |
| `dunning.ts` | Warns schools before expiry and tells them at expiry, in-app, to each school's admins. Previously suspension was silent. One notice per stage per school per day. |
| `plan-enforcement.ts` | Create-time limit gating. Off unless `ENFORCE_PLAN_LIMITS=true`, overridable per school via `school_settings.billing.enforce_limits`, and **allows on any error**. |
| `platform-bi.ts` | MRR/ARR, revenue collected, receivables, status and plan mix, simple churn. |
| `sms-economics.ts` | One platform Africa's Talking account means one provider balance. This adds per-school quota and usage (derived from `SMS_SENT` audit events — `logSMSActivity` is a console no-op) so one school can't quietly burn another's credits. |

**Tenants**

| File | Purpose |
|---|---|
| `provisioning.ts` | One-click onboarding in a single transaction: school + SuperAdmin role + first admin (forced password change on first login) + plan assignment. Deliberately mirrors the self-signup shape so provisioned and self-served schools are indistinguishable downstream. |
| `school-hard-delete.ts` | Irreversible cascade delete. Four guardrails: super-admin only, must already be soft-deleted, must retype the exact school name, and a data-heavy school is refused without `force: true`. Audited with per-table row counts. |
| `data-export.ts` | Per-school JSON export of every `school_id`-scoped table. TiDB Cloud backs up the cluster, but an operator can't hold that — this is the portable artefact, and the natural export-before-hard-delete safeguard. Per-table row caps bound memory. |
| `devices.ts` | Device ownership is a **platform** operation. Assign unclaimed devices (fixing NULL-school bleed), release, reassign, suspend, retire, and read the ownership timeline. Reuses the vetted `transfer-service` ceremony so audit and enrollment archival stay identical to the old school-side flow. |

**Operations**

| File | Purpose |
|---|---|
| `platform-health.ts` | Scans every school for expired licences, stalled attendance, all-offline devices, clock drift, failed SMS, sync failures. Each monitor is one `GROUP BY` query — no N+1. |
| `health-history.ts` | Daily per-school snapshots + an alert to the founder when a school newly turns critical. Problems find you rather than the reverse. |
| `job-runner.ts` / `job-handlers.ts` | The `platform_jobs` runner described above: claim, execute, retry with backoff. |
| `platform-settings.ts` | Platform KV + maintenance mode (`off` / `banner` / `read_only`). Read-only is enforced in the `withRoute` wrapper and blocks tenant writes only. Cached 30s so it costs nothing on the hot path. |
| `pagination.ts` | Bounded list slices — a client can never request an unbounded or negative page. |
| `export.ts` | `toCSV` (pure) + `downloadCSV` (browser-only). |

## Working in this folder

- **Never import school auth here, or control auth into school code.** The separation is the security property.
- **Never add a cron.** Register a job handler and enqueue a row.
- **Keep the pure core pure.** New decision logic goes in a testable function; the DB call wraps it. Add the test alongside — every module here has one.
- **Audit every mutation** via `controlAudit`. This console can suspend a school and delete its data; an unaudited action here is unacceptable.
- **New enforcement or gating? Default to allow.** A bug that blocks a paying school mid-term is worse than one that lets a limit slip for a day.
- **Routes go under `/api/control-center`.** Not `/api/control`.

## Tests

`npx tsx --test src/lib/control/__tests__/*.test.mjs` — 20 files, one per module, all pure-function coverage.

## Known constraints

- **SMS usage is derived from audit events**, because `logSMSActivity` writes to console only. If audit events are pruned, historical usage disappears with them.
- **Job execution depends on something ticking.** The daily cron plus request-driven ticks; a completely idle deployment runs no jobs.
- **Impersonation mints a real school session.** It is short-lived, flagged and audited, but for the two hours it exists it is genuine access — the audit trail is the control, not a technical restriction.
- **Hard delete is not reversible and not transactional across every table.** The guardrails exist because the operation cannot be undone.
- **Rate/health scans are full-platform queries.** They are `GROUP BY`, not N+1, but they still grow with the number of schools.

## Dependencies

`src/lib/db` · `bcryptjs` (provisioning only — school users) · `node:crypto` (scrypt, HMAC, TOTP) · `src/lib/devices/transfer-service`

## Related

[ADR-0008](../../../docs/adr/0008-two-auth-systems.md) — two auth systems · [ADR-0012](../../../docs/adr/0012-founder-independence.md) — why this console exists · [`docs/audits/`](../../../docs/audits/) — the Control Center audits (July 2026)
