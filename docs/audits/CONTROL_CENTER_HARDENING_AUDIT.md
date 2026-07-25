# Control Center — Hardening Audit (2026-07)

**Scope:** the Xhenvolt cross-school control subsystem — `/control/*` pages,
`/api/control-center/*` routes, `src/lib/control/{auth,impersonation}.ts`, and the
`control_*` tables. **Audit only. No changes until approved.**

The Control Center is a genuinely high-privilege console: from one login an
operator can view every school, **impersonate any user in any school**, suspend
or activate a school, and change any school's subscription — all without the
school's own credentials. So the bar for it is not "does it work" (it does) but
"is it defensible if the single operator credential is targeted."

---

## What is already strong (do NOT disturb)

- **Isolated auth stack** — its own tables (`control_users`, `control_sessions`,
  `control_audit_logs`), its own cookie (`drais_control`), scrypt password
  hashing, and session tokens stored only as SHA-256 hashes. Login failure is
  constant-shape (verifies against a dummy hash when no user exists) to resist
  user-enumeration/timing.
- **Consistent authorization** — every `/api/control-center/*` route resolves
  `getControlSession`; every *mutating* route additionally requires
  `canManage(role)` (XHENVOLT_SUPER_ADMIN).
- **Every mutation is audited** with before/after state — module toggles, status
  changes, subscription edits, extensions, and impersonation start/end all write
  `control_audit_logs`, with operator id + client IP.
- **Careful input validation** — module-code whitelist (`isModuleCode`),
  status enum, `YYYY-MM-DD` date checks, day bounds (1–3650), `COALESCE`
  partial-update semantics.
- **Query hygiene** — the schools dashboard fetches aggregates once and joins in
  memory via a `Map` (no N+1).
- **Impersonation is bounded & traceable** — 2-hour token expiry, the target
  school session carries `impersonated_by_control_user`, and start/end are
  audited. `impersonationStatus()` lets the impersonated UI show a banner.
- **Pure auth functions are unit-tested** (`__tests__/auth.test.mjs`:
  scrypt round-trip, token hashing, role gate).

This is not a module in trouble. The findings below are about **blast-radius
control** on a console whose blast radius is "all tenants."

---

## Findings register

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| **CC-1** | **P0** | **No login rate-limiting or lockout.** One email+password gates every school + impersonation, and there is no failed-attempt tracking, backoff, `429`, or account lockout anywhere in `loginControl` / the auth route. The credential is brute-forceable at full speed. | `grep rate-limit/lockout/attempt` in `auth.ts` + auth route → **empty** |
| **CC-2** | **P1** | **No 2FA/MFA.** The highest-privilege surface in the product is protected by a password alone. No TOTP/WebAuthn enrolment exists. | `grep 2fa/totp/mfa` in control → **empty** |
| **CC-3** | **P1** | **Active impersonations cannot be seen or revoked centrally.** `impersonationStatus` only inspects the *current* session token; there is no operator view of "which schools are being impersonated right now" and no "end all active impersonations" kill-switch. A leaked/forgotten impersonation token lives its full 2h with no remote revoke. | `impersonation.ts` — no list/revoke-all; only per-token status/end |
| **CC-4** | **P2** | **Bootstrap race.** First-run setup (`createControlUser`) is open until the first control user exists; whoever reaches a fresh deployment first claims the founder account. No bootstrap secret / env gate. | `auth/route.ts:44` — `hasAnyControlUser()` is the only guard |
| **CC-5** | **P2** | **No control-session self-management.** An operator can't list their active `control_sessions` or "log out everywhere"; sessions are a flat 12h with no idle timeout. A stolen cookie is valid until natural expiry. | `SESSION_HOURS = 12`; no session-list/revoke route |
| **CC-6** | **P2** | **Test coverage stops at pure auth.** No tests for the mutation validators (`isModuleCode`, day bounds, date format), the impersonation lifecycle, or the audit-write path — the parts most likely to regress silently. | only `auth.test.mjs` exists |
| **CC-7** | **P3** | **Destructive actions are instant and silent to the tenant.** Suspending a school or changing its subscription takes effect immediately with no in-app notification to that school and no "scheduled/undo" window. Audited, but not reversible from the UI. | `schools/[id]/route.ts` set_status / set_subscription |
| **CC-8** | **P3** | **No security self-view.** The audit log is surfaced (`/control/audit`), but there is no at-a-glance security panel: recent failed logins, active control sessions, currently-active impersonations. The console can't watch itself. | no such aggregate route/page |

---

## Recommended execution order

Value-vs-effort, blast-radius first:

1. **CC-1 — login rate-limiting + lockout** (P0). Track failed attempts per
   email+IP in a small table (or reuse `control_audit_logs`), apply exponential
   backoff + temporary lockout, return `429`. Pure decision function
   (`shouldThrottle(attempts, windows)`) → unit-tested. *Patch/stabilisation.*
2. **CC-3 — impersonation control panel** (P1). `listActiveImpersonations()` +
   `endAllImpersonations()` / `endImpersonation(byId)`; a panel on
   `/control/schools/[id]` and the dashboard showing live impersonations with a
   one-click revoke. *Minor — a missing part.*
3. **CC-5 — control-session self-management** (P2). List active sessions +
   revoke one / all; optional idle timeout. *Minor.*
4. **CC-4 — bootstrap secret** (P2). Require `CONTROL_BOOTSTRAP_SECRET` (env) to
   create the first operator, closing the first-run race. *Patch.*
5. **CC-2 — 2FA (TOTP)** (P1 value, larger effort). Enrolment + verify at login;
   ship after the cheaper wins. *Minor/major depending on enforcement.*
6. **CC-6 — tests** alongside each of the above (validators, throttle, lifecycle).
7. **CC-7 / CC-8 — tenant notification on destructive actions + a security
   self-view panel** (P3 polish). *Minor.*

Each item is independently shippable and auto-versioned by change nature
(stabilisation → patch; missing part added → minor).

---

## Non-findings (checked, fine)

- Cross-tenant leakage from the *school-facing* app into control tables — none;
  the stacks are fully separate.
- Authorization bypass on mutations — none found; `canManage` is enforced
  server-side on every mutating route.
- N+1 / SELECT-\* in the dashboards — the primary paths use explicit columns and
  in-memory joins.
