# DRAIS v1 LTS Hardening — Audit & Plan

**Type:** production hardening patch (not a feature release). Goal: boring,
predictable, maintainable, founder-independent.
**Rule honored:** prove before removing; preserve anything DRCE / report
snapshots / exports / audit depend on.

---

## PHASE 1 — Route & Component Sweep (audit-first)

**Key correction: the reporting surface is already MOSTLY consolidated.** The
"obvious legacy" candidates turned out to be load-bearing. Proof:

| Candidate | Verdict | Proof |
|---|---|---|
| `/settings/report-comments` (+ API) | **PRESERVE** | Referenced by `lib/snapshots/generator.ts`, `lib/drce/reportComments.server.ts`, `NorthgateReport.tsx`; in nav. It's the comment-bank DRCE + snapshots consume. |
| `academics/*-emergency-reports` (secular/theology/northgate) | **PRESERVE (for now)** | UI pages unlinked (0 nav refs) — but their `route.ts` grading logic is cited as the **canonical source** in `snapshots/grader.ts`, `adapter/toTemplateMap.ts`, `normalizers.ts`. Removing risks the snapshot pipeline. Needs a proof-of-independence pass before any cut. |
| `academics/reports/page.js` | **REMOVED ✅** | Stale **transpiled artifact** (`"use strict"; var __assign`, 85 KB, Jul 19) shadowing the live `page.tsx` (120 KB, actively edited). No `pageExtensions` override → `.tsx` wins; the `.js` was dead weight + a footgun. |

**Live reporting sources of truth (keep):** `academics/report-cards` (+ secular/
theology/`[type]/[snapshotId]`) = the snapshot report-card system; `reports/kitchen`
+ `reports/custom` = DRCE builder; `settings/report-comments` = comment bank;
per-domain reports (finance/tahfiz/passouts/attendance).

**Conclusion:** Phase 1 is not a big deletion job — it's mostly already one
source of truth. The one safe removal is done. The emergency-reports are a
tracked follow-up (prove snapshot independence, then archive the dead UI while
keeping the referenced grading logic or porting it into `lib/snapshots`).

---

## PHASE 2 — Audit Trail (backbone EXISTS; coverage is the gap)

**Found:** a real audit backbone — `src/lib/audit.ts` (`logAudit`, an
`AuditAction` catalog, `createAuditLogger`), writing to the `audit_logs` table
(enterprise_rbac_v1.sql), surfaced at `/admin/audit-logs`. Control Center has its
own `control_audit_logs`.

**Gap = COVERAGE, not infrastructure.** Confirmed: `attendance/export` writes NO
audit event (the user's exact complaint). Many high-value actions are unlogged.

**Plan (P2):**
- Extend `AuditAction` with the missing verbs (export, csv_download, attendance_view/edit/correct, biometric_enroll, device_*, settings_change, sms_send, login/logout/failed_login, permission_change).
- Wire `logAudit` into: attendance export + report gen, student create/modify/delete + biometric, device register/assign/reassign/config, settings/integration changes, auth events (login/logout/failed), permission changes.
- Standard event shape already supported: timestamp, actor, role, school, action, entity, IP, success — ensure every call passes them.
- **Every export (Phase 3) must emit an audit event** — the two phases interlock.

---

## PHASE 3 — Export Standardization

**Coverage today:** attendance ✅, students ✅, finance ✅ (dynamic-imported per
the bundle work). **Missing:** staff list ❌, user management ❌, audit logs ❌,
device logs ⚠️ (partial).

**Plan (P3):**
- A shared export helper (`lib/export/…` already exists) producing CSV/Excel with a standard metadata header: **school identity, generation date, generated-by user, filters/scope**.
- Wire it into the missing modules (staff, users, audit logs, device logs).
- Each export calls `logAudit(export, …)` (ties to P2).

---

## PHASE 4 — User Lifecycle States

**Current:** binary `users.is_active` (0/1) + `is_verified`, `must_change_password`,
`last_login`. No lifecycle. (32 active / 5 inactive today.)

**Plan (P4):** derive/introduce explicit states — **invited · pending · active ·
suspended · deactivated · archived** — separating:
- **Record** (row exists) vs **Account status** (can authenticate) vs **Session**
  (currently logged in — from `sessions`/`last_activity`) vs **Access** (RBAC).
- User-management UI: totals per state, last login, last activity. No security
  regression (RBAC unchanged).

---

## PHASE 5 — SMS Financial Control Center

**Current:** `lib/africastalking.ts` client + `api/sms/send`. **No** balance,
allocation, quota, or per-school usage economics.

**Plan (P5):**
- Provider overview in Control Center: live Africa's Talking **balance**, purchased/used/remaining, estimated capacity.
- `sms_allocations` (per-school quota) + `sms_usage_events` (school, recipient, type, segments, timestamp) tables.
- Enforce allocation (a school can't spend another's credits) at the send path.
- Per-school: allocated / used / remaining + consumption history.

---

## Sequencing (value ↓, risk ↓) — LTS patch, incremental

1. **P2 audit coverage** — accountability backbone; infra exists so it's wiring, not building. Start with the exact gap called out (attendance export → audited). *Low risk, high trust.*
2. **P3 exports** — interlocks with P2 (each export audits); fills staff/users/audit-logs/device-logs gaps. *Low risk.*
3. **P4 user states** — model + UI; RBAC untouched. *Medium.*
4. **P5 SMS economics** — new tables + provider integration + enforcement. *Medium; most net-new.*
5. **P1 emergency-reports** — only after proving snapshot independence. *Deferred; deletion-sensitive.*

Each ships as its own patch/minor with tests where logic is pure, and no local
prod builds (route-count aware — this patch consolidates, it doesn't proliferate).
