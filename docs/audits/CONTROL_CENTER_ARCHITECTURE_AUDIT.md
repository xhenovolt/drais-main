# DRAIS Control Center — Architecture Audit & Founder-Independence Program (Phase 0)

**Status: AUDIT ONLY. No implementation performed.** Every claim below was
verified against the actual code; where the brief asserted a defect that the
code does **not** exhibit, that is stated plainly rather than confirmed.

The brief framed ten "critical architectural defects." Verification found: **3
confirmed critical**, **3 confirmed real-but-lower**, **2 partially accurate**,
and **2 that are premises the current code already partly satisfies** (so the
work is smaller than stated). The single most important finding is real and
severe — and it is a **tenant-isolation leak in the school app, not the Control
Center.**

---

## 0. Headline — the one that matters

**Device list is NOT tenant-isolated. Every school sees every school's devices.**
CONFIRMED, live, P0.

`GET /api/attendance/zk/devices` — the API the school-facing `/attendance/devices`
page loads via SWR — resolves the session but **never filters by it**:

```
src/app/api/attendance/zk/devices/route.ts:13   const session = await getSessionSchoolId(req);   // resolved
...
:56   FROM devices d
:58   WHERE d.deleted_at IS NULL          ← no  d.school_id = session.schoolId
:60   , []                                ← session.schoolId never bound
```

It even *selects* `d.school_id` as a column but never constrains on it, and the
empty-state fallback (`:74`) explicitly discovers devices "**(any school)**" from
`zk_attendance_logs`. So School A's device page lists School B's hardware. This
is the concrete truth behind the brief's Defect #1.

A second, separate leak: `GET /api/devices/list` and `/api/devices/summary` are
**unauthenticated AND unscoped** (`"No auth required"`, `SELECT ... FROM devices`
with no `WHERE school_id`). They currently have **no callers** (orphaned), so
they don't drive the UI leak — but they are an open cross-tenant data endpoint
and must be retired/scoped regardless.

Everything else in this audit is real work, but **this is the one that breaks the
"production-ready multi-tenant" claim** and should be fixed first, ahead of any
Control Center feature.

---

## 1. Platform Architecture Report

DRAIS today is **two stacks sharing one database**:

- **Tenant app** — school session cookie (`drais_session`), `getSessionSchoolId`,
  every tenant table carries `school_id`.
- **Platform app (Control Center)** — fully isolated auth (`control_users`,
  `control_sessions`, `control_audit_logs`, `drais_control` cookie, scrypt +
  hashed tokens). Verified strong in the prior security audit
  ([CONTROL_CENTER_HARDENING_AUDIT.md](CONTROL_CENTER_HARDENING_AUDIT.md)).

The separation of *auth* is clean. The gap is **reach**: the platform layer can
authenticate as itself, but its feature surface (devices, health, subscriptions,
lifecycle) is thin, so real administration still leans on impersonation or SQL.

## 2. Control Center Architecture Report

Present control surface (verified):

| Area | API | Page | State |
|---|---|---|---|
| Auth + bootstrap | `control-center/auth` | `/control` | solid; **no rate-limit (CC-1)** |
| Overview | `control-center/overview` | `/control/dashboard` | direct queries, not impersonation |
| Schools list | `control-center/schools` | `/control/schools` | direct, Map-joined (no N+1) |
| School detail + actions | `control-center/schools/[id]` | `/control/schools/[id]` | module toggle / suspend / subscription / extend — validated + audited |
| Operators | `control-center/users` | `/control/operators` | canManage-gated |
| Audit log | `control-center/audit` | `/control/audit` | read surface exists |
| Impersonation | `control-center/impersonate` | (enters tenant app) | 2h token, audited |
| System health | — | `/control/system-health` | page exists; depth unverified for multi-school |

**Missing entirely: any device, subscription-plan, or school-lifecycle API under
`control-center/`.** (Verified: no `control-center/**/device*` route exists.)

## 3. Multi-Tenant Isolation Audit

- **Device list — FAIL (P0).** `zk/devices` unscoped (§0).
- **Unauth device endpoints — FAIL.** `devices/list`, `devices/summary` (§0).
- **Attendance records/logs — PASS.** `attendance/devices/*`, `live-identity`,
  `live-scan`, `zk/live`(session variants) all bind `WHERE …school_id = ?`
  (spot-checked ~12 routes). The *records* are isolated; the *device roster* is not.
- **Unassigned devices bleed — DESIGN SMELL.** ZK-push registers a device with
  whatever `getSchoolIdForDevice` returns, which is **NULL for unknown devices**,
  and the comment is explicit: `"unknown — will show to all admins via OR
  school_id IS NULL"` (`zk-handler/route.ts:462`). Unclaimed hardware is visible
  platform-wide by design; there is no claim/assign ceremony surfaced to schools.

## 4. Device Ownership Audit

- A real ownership ceremony **exists as a service**: `src/lib/devices/transfer-service.ts`
  + `devices-ownership-schema.ts`, writing `DEVICE_RELEASED / DEVICE_ACQUIRED /
  DEVICE_DECOMMISSIONED / DEVICE_TRANSFER_ABORTED` audit rows.
- **But it is not surfaced in the Control Center**, and there is no
  acquire/release/transfer/replace/suspend/retire UI at the platform layer, nor a
  device ownership timeline. So the brief's Defect #3 is **accurate for the
  Control Center** even though the primitive exists. Founder still drives it.

## 5. Attendance Isolation Audit (popups)

Brief claims cross-school popups. **Verification: the live popup path is
tenant-safe.** The popup polls `live-identity` / `live-scan`, both
`WHERE al.school_id = session.schoolId` (`live-identity/route.ts:53,111`), with
`mount_scope` from per-school `attendance_live_ui_settings`. The bus does not
cross lambdas, so there is no shared broadcast channel to leak across tenants.

**Latent risk (not an active popup leak):** `GET /api/attendance/zk/live` reads
`school_id` **from a query param, defaulting to 1** (`zk/live/route.ts:18`). It
has **no callers**, but it is a param-injectable cross-tenant read and must be
retired or session-scoped. **Conclusion: Defect #2 as "popups leak" is NOT
reproduced; the underlying isolation risk is the `zk/live` orphan + the device
roster (§0).**

## 6. API Authorization Audit (impersonation dependence)

Brief claims platform ops "force impersonation." **Partially inaccurate.** The
control reads already query the DB directly with platform auth — `overview`,
`schools`, `schools/[id]`, `users`, `audit` do **not** impersonate. Impersonation
is used to *enter the tenant UI*, not to read platform data. So the architecture
the brief asks for (privileged platform APIs) is **already the pattern for reads
and school/subscription mutations** — it just needs **extending** to devices,
plans, lifecycle, billing, not inventing. Impersonation is correctly positioned
as a troubleshooting tool today.

Residual: several tenant-scoped capabilities (attendance analytics, health,
logs) have **no platform-level read** — to see them the operator must impersonate.
That is the real gap under Defect #4.

## 7. Theme & UX Audit

- **Forced dark — CONFIRMED.** `src/app/control/layout.tsx` hardcodes
  `bg-slate-950 text-slate-100` with no light/system/high-contrast path
  (deliberate "Xhenvolt internal" chrome, per its own comment). Diverges from the
  tenant app's token-based theming.
- **UX:** functional but minimal — no global search across schools/devices, no
  saved filters, flat navigation, no responsive/a11y pass. Consistent with the
  brief's Defect #5.

## 8. Subscription Engine Audit

- **No plan engine — CONFIRMED.** There is **no `subscription_plans` /
  `plan_limits` / `plan_features` table.** `set_subscription`
  (`schools/[id]/route.ts:86`) writes **free-text** `subscription_plan` /
  `subscription_status` strings + an end date. `extend_days` bumps the date.
- No configurable limits (learners/staff/devices/storage/SMS/modules), no
  enforcement, no plan catalog. Modules are toggled individually
  (`set_module` + `isModuleCode` whitelist) but not bundled into plans. This is
  the largest *missing* subsystem.

## 9. School Lifecycle Audit

- **Exists:** Create School (`schools/create`, session-guarded custom auth),
  suspend/activate (`set_status`), subscription edit.
- **Missing (all UI):** Clone, Archive, Restore, Delete (soft), Transfer
  Ownership, Reset Credentials, Initialize/Seed DB, Assign Devices, Generate
  License / Activation Keys, per-school Health drill-down. No first-class school
  lifecycle state machine at the platform layer.

## 10. Founder-Dependence Report

Still founder/dev-dependent (no Control Center path today):
- Assigning an unclaimed device to a school / transfer / retire (service exists,
  no UI) — **F-1**.
- Creating or changing subscription **plans** and their limits — **F-2**.
- Cloning / archiving / restoring / deleting a school; seeding default data;
  generating licenses — **F-3**.
- Reading a specific school's attendance/health/logs without impersonating — **F-4**.
- Fixing the device-roster leak or the NULL-school bleed — currently code/SQL — **F-5**.

Not founder-dependent (already self-service): school create, suspend/activate,
module toggles, subscription date/plan-string edits, operator management, audit
viewing, impersonation.

---

## 11. Security Risk Register

| ID | Sev | Risk | Evidence |
|----|-----|------|----------|
| SR-1 | **P0** | Cross-tenant device roster leak (school sees all devices) | `zk/devices/route.ts:56-60` |
| SR-2 | **P0** | Unauth + unscoped device endpoints | `devices/list`, `devices/summary` |
| SR-3 | P1 | Param-injectable cross-tenant read, defaults school 1 | `zk/live/route.ts:18` |
| SR-4 | P1 | Unclaimed devices visible platform-wide (`OR school_id IS NULL`) | `zk-handler:462` |
| SR-5 | P1 | Control login has no rate-limit/lockout (from CC audit, CC-1) | `lib/control/auth.ts` |
| SR-6 | P2 | No 2FA on the platform console (CC-2) | — |
| SR-7 | P2 | No central impersonation revoke / active-session view (CC-3/5) | — |

## 12. Missing-Features Register

Devices: platform device inventory, assign/transfer/retire UI, ownership
timeline. Subscriptions: plan catalog + limits + enforcement. Lifecycle:
clone/archive/restore/delete/license/seed. Health: cross-school proactive monitors
(offline, clock-drift, failed SMS, expired licence, sync/queue/backup failures).
Platform reads: attendance/health/logs/analytics per school without impersonation.
UX: global search, filters, theming (light/system/high-contrast), a11y, responsive.

## 13. Technical-Debt Register

- Orphaned endpoints to retire: `devices/list`, `devices/summary`, `zk/live`.
- `set_subscription` stores unvalidated free-text plan names (no catalog FK).
- Device→school assignment implicit/NULL-tolerant rather than an explicit claim.
- Control Center forced-dark theme forks the design system.
- No integration tests around tenant isolation (a scoping regression is invisible).

---

## 14. Recommended Execution Roadmap

Isolation first (it's a live leak), then platform reach, then the big subsystems.
Each phase: visible improvement, **minor** version bump, backward-compatible,
release notes + docs, regression tests, commit + push.

| Phase | Deliverable | Closes | Ver |
|------|-------------|--------|-----|
| **P1 — Tenant isolation hard-fix** | Scope `zk/devices` to `session.schoolId`; retire `devices/list`/`summary`/`zk/live` (410); add an **isolation regression test** proving School A can't see School B's devices | SR-1/2/3, Defect #1/#2 | patch→minor |
| **P2 — Device claim & ownership in Control Center** | Surface the existing transfer-service: platform device inventory + assign-to-school (fix NULL bleed) + transfer/suspend/retire + ownership timeline | Defect #3, F-1, SR-4 | minor |
| **P3 — Platform read APIs (kill impersonation-for-viewing)** | `control-center/schools/[id]/{attendance,devices,health,logs,analytics}` read endpoints; drill-downs on the school page | Defect #4, F-4 | minor |
| **P4 — Platform Health Center** | Cross-school monitors (offline / clock-drift / failed SMS / expired licence / sync·queue·backup failures) with proactive surfacing | Defect #9 | minor |
| **P5 — Subscription engine** | `subscription_plans` + limits + features catalog; assign plan → school; enforcement hooks; Starter…Government presets | Defect #7, F-2 | minor (enforcement may be major) |
| **P6 — School lifecycle** | Clone / Archive / Restore / Delete(soft) / Transfer / Reset credentials / Seed / License + Activation keys | Defect #8, F-3 | minor |
| **P7 — Control Center UX + theming** | Global search, filters, light/system/high-contrast theme aligned to DRAIS tokens, a11y + responsive pass | Defect #5/#6 | minor |
| **P8 — Console security hardening** | CC-1 rate-limit, CC-3 impersonation revoke/active view, CC-2 2FA | SR-5/6/7 | patch→minor |

**Recommended immediate action:** approve **P1** and let me ship the isolation
hard-fix + regression test as the first increment — it is small, it is a live
data-leak, and it unblocks the "production-ready multi-tenant" claim before any
new Control Center feature is built on top.

---

### Verification honesty note
Confirmed as stated: #1 (device roster), #5 (UX), #6 (theme), #7 (no plan engine),
#8 (lifecycle gaps), #9 (no proactive health), #3 (no CC device UI).
**Refuted / softened:** #2 (live popups are tenant-scoped; risk is the `zk/live`
orphan, not the popup), #4 (platform reads already bypass impersonation; the work
is *extending* them, not replacing an impersonation-only architecture).
