# DRAIS V2 — Resilience & Offline Architecture Audit

> **Status:** Analysis only. No implementation, no migrations, no code changes.
> **Date:** 2026-08-18
> **Scope:** Full-repository reconnaissance for the "survive a nuclear apocalypse"
> resilience brief — offline-first operation, disaster recovery, `.drs`/`.drais`
> formats, USB attendance fallback, and Sentinel/local-mode compatibility.
> **Relationship to prior work:** this document does **not** re-derive what
> [`OFFLINE_MIGRATION_ASSESSMENT.md`](../OFFLINE_MIGRATION_ASSESSMENT.md)
> (2026-05-06) already established about database coupling, DRCE portability,
> and file storage — it verifies that analysis against ~3.5 months of
> subsequent commits, corrects the parts that have since changed, and covers
> the ground the May audit didn't: what has actually been *built* since then
> (dual DB mode, RBAC catalog, Sentinel, Backup Center, acquisition backbone),
> and the net-new deliverables this brief asks for (`.drs`/`.drais`
> specifications, USB import, DR scenarios, chaos/performance strategy).

---

## Table of contents

1. [Executive verdict](#1-executive-verdict)
2. [Current architecture](#2-current-architecture)
3. [V1 strengths](#3-v1-strengths)
4. [V1 weaknesses](#4-v1-weaknesses)
5. [Decision record: SQLite for local mode](#5-decision-record-sqlite-for-local-mode)
6. [Online dependencies — classification](#6-online-dependencies--classification)
7. [Offline readiness matrix](#7-offline-readiness-matrix)
8. [Proposed dual-mode architecture](#8-proposed-dual-mode-architecture)
9. [Local data contract (initial provisioning)](#9-local-data-contract-initial-provisioning)
10. [The `.drs` specification](#10-the-drs-specification)
11. [The `.drais` specification](#11-the-drais-specification)
12. [Synchronization architecture](#12-synchronization-architecture)
13. [Backup architecture](#13-backup-architecture)
14. [Disaster-recovery scenarios](#14-disaster-recovery-scenarios)
15. [Security architecture](#15-security-architecture)
16. [USB ZKTeco attendance import (V1-final)](#16-usb-zkteco-attendance-import-v1-final)
17. [Sentinel integration architecture](#17-sentinel-integration-architecture)
18. [Minimal-hardware strategy](#18-minimal-hardware-strategy)
19. [Testing & chaos-testing strategy](#19-testing--chaos-testing-strategy)
20. [Performance baseline plan](#20-performance-baseline-plan)
21. [Versioning strategy](#21-versioning-strategy)
22. [What must NOT be changed](#22-what-must-not-be-changed)
23. [What should be refactored](#23-what-should-be-refactored)
24. [What should be postponed](#24-what-should-be-postponed)
25. [Phased roadmap](#25-phased-roadmap)
26. [V1 FINAL vs. V2 — definitions](#26-v1-final-vs-v2--definitions)
27. [Decisions recorded](#27-decisions-recorded-2026-08-18)

---

## 1. Executive verdict

**DRAIS is much further along the resilience path than the brief assumes — and has already made one of the five biggest architectural decisions the brief tells you to make, in the opposite direction the brief specifies.**

Three things changed the shape of this audit versus what a from-scratch read of the brief would produce:

1. **A prior 700-line audit already exists** ([`OFFLINE_MIGRATION_ASSESSMENT.md`](../OFFLINE_MIGRATION_ASSESSMENT.md), 2026-05-06) that did the database-coupling, Next.js-portability, DRCE-portability, file-storage, and performance analysis this brief also asks for (Phases 1/2/6 in the brief's own structure). It reached a specific, reasoned conclusion: adopt SQLite locally behind a repository-abstraction layer.
2. **The team did not follow that recommendation.** Since 2026-06-23, DRAIS has shipped a *different* architecture — [ADR-0010](../adr/0010-dual-database-mode.md): **local MySQL**, not SQLite, running the *same* schema and *same* raw SQL as the cloud, with an explicit online/local mode switch (`src/lib/db/db-mode.ts`, `src/lib/db/pools.ts`). This is live, working code, not a proposal — Electron and Android already boot a full local Next.js server (`electron/main.cjs:60-83`) that can point at a local MySQL instance (`electron/config.cjs:86-91`) with zero query rewriting, because TiDB and MySQL speak the same wire protocol and dialect. ADR-0010 explicitly considered and **rejected** SQLite, for a documented reason: 255 tables would need dual-dialect maintenance forever, for zero isolation benefit, since `mysql2` already serves both TiDB and local MySQL through one driver.
3. **This brief's `.drs` design (Phase 6) presumes SQLite.** It isn't wrong to presume that — SQLite is the obvious choice in a vacuum, and it's what the May audit also recommended — but the codebase has since made a deliberate, documented, opposite choice for reasons that are still valid today. This is the single highest-leverage fork in the entire roadmap: **§27** asks you to resolve it explicitly before any `.drs`/`.drais` implementation starts, because every phase from Phase 6 onward inherits whichever answer you give.

**Decision recorded (2026-08-18):** presented with this fork, the product owner chose **SQLite**, overriding both this document's recommendation and ADR-0010's reasoning. That is a legitimate call — SQLite gives a true single-file database, matches the original brief, and is a smaller mental model for "one school, one file" than a local MySQL install ever will be — but it is not free: it reopens the May audit's abandoned Option D (a real repository-abstraction layer, `@drais/repo-contract` + `@drais/repo-mysql` + `@drais/repo-sqlite`, reviewing MySQL-only syntax across ~855 call sites). §5, §8, §10, and §25 below are written against this decision, not against local MySQL. **This also means ADR-0010 needs a formal successor ADR recording the reversal** (§5.3) — this repository has unusually good ADR discipline and silently contradicting an "Accepted" decision would break that.

**Verdict on the rest of the brief, given that fork:** achievable, and closer than the brief assumes, because DRAIS already has three of the "hard problems" substantially solved or scaffolded:

- **The database-portability problem (the May audit's "biggest hidden danger") is already solved** — not by an abstraction layer, but by using the same database engine everywhere. This is a *smaller*, more boring answer than the brief or the May audit expected, and it is already in production.
- **The device/LAN-connectivity problem (Phase 10's prerequisite) is already solved** — a local relay agent (`workers/zk-relay-agent.js`) already bridges school-LAN ZKTeco devices to the cloud over plain HTTP long-polling (`src/app/api/relay-status/route.ts`), with a real settings UI (`src/app/settings/relay/page.tsx`). USB import is the one adapter this pattern doesn't yet have.
- **The attendance acquisition pipeline (Phase 10's actual target) is already redesigned for exactly this** — `src/lib/attendance/acquisition/*` (staging → validation → operator confirmation → commit) exists today because of a *different* incident (TCP pull timezone corruption, [`docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md`](../audits/TCP_PULL_FORENSIC_AND_REDESIGN.md), 2026-07-22, status "AWAITING APPROVAL"). That document's own Phase 5 already names USB/CSV import as "extensibility adapters reusing the same staging." **USB import is not a new subsystem to design; it is the next adapter on an already-approved-in-spirit backlog.**

What genuinely does **not** exist yet, and is real, unstarted work: any `.drs`/`.drais` container format, any bidirectional sync engine, any restore automation for backups, any local-provisioning ("clone just this one school, not all of them") tooling, and any Sentinel coverage of local-mode installs. These are Phase 5 (§12), Phase 8 (§14) restore automation, §9's provisioning redesign, and §17.

**Overall difficulty, re-scored against the actual codebase:** 6/10, down from the May audit's 8.5/10 — specifically *because* the database-portability problem, which the May audit correctly called the dominant cost driver, has already been resolved by a different, cheaper method than the one it recommended.

---

## 2. Current architecture

### 2.1 Application layers

DRAIS is a single Next.js 15 App Router codebase (`next.config.js`, `output: 'standalone'`) shipped to **four surfaces from one build**:

| Surface | Entry point | What it actually runs |
|---|---|---|
| Web (hosted) | Vercel | The Next.js server, hard-forced to `online` DB mode |
| Electron desktop | `electron/main.cjs:60-83` | The **same** `.next/standalone/server.js`, in-process inside Electron's main process, bound to `0.0.0.0:3210` so LAN devices can reach it (`electron/main.cjs:6-7,15`) |
| Android APK | `mobile/nodejs-project/main.js:1-153` | The **same** standalone server, inside a real embedded Node runtime (nodejs-mobile, Node 18.20.4 via `scripts/stage-node-android.mjs`), with the WebView pointed at `127.0.0.1:3210` |
| PWA | `next-pwa` config | Service-worker shell only — cache-first for static assets, not a data layer |

This is a materially more portable starting point than a typical Next.js app: there is **no separate desktop codebase**. Desktop and mobile are the exact same application server, running locally instead of on Vercel. Confirmed zero Edge-runtime usage (May audit) means every route is Node-compatible everywhere it runs.

### 2.2 Database layer

No ORM. `mysql2/promise` raw queries throughout, mediated by `src/lib/db.ts`, which as of 2026-06-23 delegates to:

- `src/lib/db/db-mode.ts` — resolves `DbMode = 'online' | 'local'`. `isLocalAllowed()` gates local mode on `DRAIS_ALLOW_LOCAL==='true'`; hosted/Vercel never sets it, so `getDbMode()` is hard-forced to `'online'` there (`db-mode.ts:37-39`). On the desktop/mobile builds it's opt-in, server-side runtime state (a module variable — correct for a single-process build, explicitly documented as *wrong in general* but *safe here*, [ADR-0010](../adr/0010-dual-database-mode.md) line 50).
- `src/lib/db/pools.ts` — two cached `mysql2` pools keyed by mode. `onlineConfig()` → TiDB Cloud (`TIDB_*` env). `localConfig()` → local MySQL (`LOCAL_MYSQL_*` env, default `127.0.0.1:3306`). Both go through the *same* retry/verify/keep-alive logic (`pools.ts:84-124`).

Current scale (grep, this session): **855 `getPool`/`getConnection` occurrences across 294 files**, **79 files** using `ON DUPLICATE KEY UPDATE`, **3,662 occurrences of `school_id`**. (The May audit's "766 call sites" and the code's own internal comment claiming "~435" are both now stale — three different numbers exist for the same thing in three different places; treat none of them as current without re-measuring.)

Migration/schema-versioning is genuinely fragmented — **four parallel mechanisms**, only one of which is ledger-tracked:

| Mechanism | Location | Ledger? | Status |
|---|---|---|---|
| Managed runner | `database/migrations/tidb/` (44 files), applied by `scripts/db/migrate.mjs` | **Yes** — `schema_migrations` table, SHA-256 checksums, per-database ledger | Current, use for new work |
| Legacy loose SQL | `database/migrations/*.sql` | No | Frozen, "do not add to" |
| Root `migrations/` | `migrations/*.sql` (35 files) | No — only `scripts/verify_migrations.sql`, a hand-rolled PRESENT/MISSING checker | Actively used per [`MIGRATION_RUNBOOK.md`](../MIGRATION_RUNBOOK.md), but **not documented** in [`docs/database/MIGRATIONS.md`](../database/MIGRATIONS.md)'s "three mechanisms" framing — a real gap in the gap-tracking doc itself |
| Runtime `ensureXSchema()` | `src/lib/{sentinel,backup,attendance,biometric,devices,notifications}/*/schema.ts` | No | Defensive fallback only, "does not replace a managed migration" |

This is the sharpest concrete evidence for [`DRAIS_ARCHITECTURE_GAPS.md`](../architecture/DRAIS_ARCHITECTURE_GAPS.md)'s O2 finding: schema has drifted from code in production before (`schools.external_id`, parent-portal tables, `comm_settings.sms_enabled` were live in code before they existed in the DB).

### 2.3 Authentication, authorization, tenancy

- **Session**: `drais_session` cookie → DB lookup (`sessions JOIN users`) on every request (`src/lib/auth/apiAuth.ts:87,101-115`), deriving `school_id` (`apiAuth.ts:144`). Password hashing via `bcryptjs`.
- **RBAC**: as of commit `feat(rbac): granular permission catalog...` (2026-05-23, 17 days after the May audit called this a "target architecture" only) this is **implemented, not proposed**. `src/lib/rbac/catalog.ts` (~172 declarative `module.resource.action` permissions), `src/lib/rbac/authorize.ts` (single `authorize()` entrypoint, super-admin bypass, wildcard expansion), `src/lib/rbac/sync.ts` (reconciles catalog → `permissions` table, never touches `role_permissions`). **Route-level adoption is still partial** — [`RBAC_ARCHITECTURE.md`](../RBAC_ARCHITECTURE.md) §9 self-reports `/api/finance/*` 32/32 routes ungated, `/api/students/*` 52/53 ungated, as of its own last-updated snapshot.
- **Tenancy**: `WHERE school_id = ?` on essentially every query (3,662 occurrences). No row-level security, no separate schema per tenant — filtering is entirely application-level, and commit `2b51ca2` ("codebase-wide deleted_at filter sweep... finds real tenant-isolation and crash bugs") in this session's own recent git history shows this remains an area of active hardening, not a solved problem.

### 2.4 Device integration / attendance engine

This is the most mature offline-relevant subsystem in the codebase, and it's genuinely well-factored:

- **`src/lib/attendance/`** — `engine.ts` (`recordRawEvent` → append-only `attendance_raw_events`; `evaluatePunch`/`evaluateDay` → `attendance_records`), `rule-evaluator.ts` (pure, no DB), `device-clock.ts` (five time-policy strategies), and `acquisition/` (the redesigned staging pipeline: `service.ts` → `beginAcquisition`/`stageRecords`/`finishAcquisition`, `wall-time.ts`, `validate.ts`, `commit.ts`). `acquisition/service.ts:19` already types `AcquisitionMethod` to include `'usb_import' | 'csv_import'` — unimplemented, but the seam exists.
- **`src/lib/biometric/`** — `identity/resolve.ts` (`resolveIdentity()`, canonical `biometric_enrollments` table first, legacy three-table fallback chain, staff-before-student precedence, auto-promotion), `enrollment-service.ts` (the **single** write path every identity mutation is supposed to go through), `name-fuzzy.ts`/`name-match-policy.ts` (deterministic auto-link vs. `pending_device_users` human-review queue).
- **Ingestion protocols**: ADMS push (`src/app/api/zk-handler/route.ts`, the most mature path — uses the shared engine correctly), TCP pull (`src/app/api/attendance/zk-tcp/route.ts`, now routed through the acquisition staging per the July redesign), and **two duplicated, non-conforming paths** that bypass the shared engine entirely — `src/app/api/sync/trigger-local/route.ts` (writes `people`/`students`/`zk_user_mapping` directly, reinvents name-matching, discards pulled attendance after only counting it) and `src/app/api/sync/manual-upload/route.ts` (writes `zk_user_mapping` directly). These are named explicitly in §22/§23 below.
- **Local presence for LAN devices**: `workers/zk-relay-agent.js` — a locally-installed agent (school-premises machine) that holds the TCP connection to the ZKTeco device and reaches DRAIS Cloud via HTTP long-polling against `src/app/api/relay-status/route.ts` (chosen specifically because it "works with Next.js serverless — no WebSocket needed," per that route's own header comment). Has a real onboarding UI at `src/app/settings/relay/page.tsx` with per-OS install instructions. **This already solves the "cloud can't reach a school's private LAN" problem** that a naive reading of the brief might assume still needs solving.
- A separate, unrelated **Dahua camera** device model exists in parallel (`device_configs` table, `DeviceConnectionManager.ts` → `DahuaDeviceService`) — worth knowing so it isn't confused with the ZKTeco/`devices` model.

### 2.5 Report engine (DRCE) and snapshots

Confirmed still true, and the strongest asset in the codebase for this brief's goals: `src/lib/snapshots/generator.ts` produces UUID-keyed, SHA-256-hashed, **immutable once `status='ready'`** `report_snapshots` rows ([ADR-0005](../adr/0005-report-snapshot-immutability.md)) via pure functions with no `Date.now()`/`Math.random()` inside the hashed payload. `src/lib/drce/*` (templates, overrides, render layers) is JSON-based and DB-dependency-free once a snapshot is loaded. This subsystem was *already* offline-first before anyone called it that — it is the correct beachhead for any local-mode rollout (§25, Phase "Offline academic/report operation").

### 2.6 Observability — Sentinel

`src/lib/sentinel/` is a **diagnostic-and-alert system, not a self-healing one**, despite having a schema field (`autoRemediationSafe`) that suggests otherwise. Every one of its 8 observers (`background-jobs`, `notifications`, `security`, `fleet`, `academics`, `api-health`, `import-health`, `tenant-isolation`) sets that field to `false`; nothing reads it to trigger an action. It runs via the pre-existing in-DB job runner (`platform_jobs`, no new cron), records incidents (`incidents.ts`), and pages an operator by SMS (`alert.ts`, bypassing the notification outbox and going straight to Africa's Talking). A `/control/sentinel` dashboard and an on-demand "Full System Diagnosis" (`POST /api/control-center/sentinel/diagnose`) exist. **Critically: Sentinel's own DB-mode-agnostic code has never actually been run against `local` mode** — every verification script (`scripts/sentinel/verify-live.mjs:22-25`, `run-diagnosis-now.mjs`, etc.) hardcodes `setDbMode('online')`, with a comment explaining local mode isn't reachable in that dev environment. Sentinel-for-local-mode is unproven, not broken (§17).

### 2.7 Backup

`src/lib/backup/` ("Database Backup Center") is real, but narrower than it sounds: **school-scoped only, manually triggered per school, no scheduling, and — the largest stated gap — no restore automation** (`src/lib/backup/README.md:70`: *"Restore is not implemented... this is the largest gap"*). It generates `SHOW CREATE TABLE` DDL + batched INSERT dumps, checksums them, uploads to Cloudinary, and offers download. `vercel.json` has exactly one cron (`/api/result-deadlines`) — nothing drives Backup Center automatically.

Separately, `npm run db:export:full` produces a **whole-database** dump (all schools, ~48 MB, [`docs/guides/DESKTOP_LOCAL_TRANSFER.md`](../guides/DESKTOP_LOCAL_TRANSFER.md)) used to seed a desktop's local MySQL — this is today's de facto ".drs precursor," and it is the file this brief's §10 needs to formalize. See §5 and §15 for why its current "every school in one file" shape is a real security problem, not just a rough edge.

---

## 3. V1 strengths

1. **One codebase, four surfaces, already proven** — desktop and Android run the identical server as the web app, not a port. This eliminates an entire category of risk the brief worries about ("two divergent codebases").
2. **The database-portability problem is already solved**, and solved more cheaply than either the brief or the May audit expected — same engine, same SQL, same schema, both sides (§5).
3. **The attendance/biometric domain logic is already the cleanest part of the codebase** — append-only raw events, a pure rule evaluator, a single identity-resolution entrypoint, an acquisition-staging pipeline built from a real production incident. This is exactly the shape offline-first attendance needs, and it already exists.
4. **DRCE/snapshots are deterministic, immutable, and portable today** — the "moat" the May audit identified is real and hasn't eroded.
5. **A working LAN-to-cloud device relay already exists and is documented/onboardable** (`zk-relay-agent.js` + `/api/relay-status` + `/settings/relay`), removing what would otherwise be a hard networking problem from the USB-import and local-mode roadmaps.
6. **A real (if incomplete) migration ledger exists** (`database/migrations/tidb/`, `schema_migrations` table, checksummed) — a foundation to build `.drs`/`.drais` schema-version compatibility checks on, rather than inventing one from nothing.
7. **13 ADRs already document hard-won decisions** (dual DB mode, snapshot immutability, TiDB/local coexistence reasoning, founder-independence as an explicit goal) — this repo has an unusually good habit of writing decisions down, which this brief should extend, not bypass.

---

## 4. V1 weaknesses

1. **No `.drs`/`.drais` container exists.** Today's closest analog — `npm run db:export:full` — is a plaintext, unencrypted, unchecksummed, whole-multi-tenant-database SQL file, gitignored but otherwise unprotected (§5, §15).
2. **No bidirectional sync.** ADR-0010 names this explicitly as deliberately deferred, "a substantial design problem, not an implementation gap." A local install today is a one-time clone that becomes "an island" — correct as a first cut, but exactly the gap Phase 5 of this brief must close.
3. **No restore automation anywhere in the codebase.** Backup Center backs up; nothing restores. This is the single biggest gap between what exists and "disaster recovery," full stop.
4. **Local provisioning today ships every school's data to every desktop install** (§5) — a real tenant-isolation regression relative to the security posture the online product otherwise maintains.
5. **Two attendance ingestion paths (`sync/trigger-local`, `sync/manual-upload`) bypass the canonical engine/identity layer.** These are landmines for any USB-import work that copies their pattern instead of the ADMS/acquisition-backbone pattern.
6. **Migration/schema-version tracking is fragmented across four mechanisms**, one of which isn't even documented in the doc that's supposed to enumerate them. `.drs`/`.drais` version compatibility checks need one source of truth for "what schema version is this," and today there isn't one.
7. **RBAC route-gating is ~50% complete** by the RBAC doc's own accounting — relevant because local-mode security (§15) inherits whatever authorization posture the online app has when the code is shared.
8. **Sentinel has never been run against local mode** — its local-mode/offline-diagnostic value is currently theoretical, not demonstrated.
9. **Electron/Android builds are unsigned**, with no auto-update mechanism (`electron-builder.yml:160-162`, `publish: null`) — meaningful for §15 (tamper-evidence) and §14 (machine-replacement DR).
10. **Local MySQL requires a real MySQL/XAMPP install on the school's machine** — real deployment friction (ADR-0010 §Trade-offs) that the "modest school computer" target (§18) must reckon with honestly.

---

## 5. Decision record: SQLite for local mode

This was the fork every downstream phase depends on. It has been decided — **SQLite** — by explicit product-owner sign-off (2026-08-18), against this document's recommendation to keep ADR-0010's local MySQL. This section keeps the full reasoning on both sides (so the trade-off being accepted is visible, not buried) and then states what the decision actually commits this roadmap to.

**The brief said:** "MODE B — LOCAL/OFFLINE. Database: SQLite internally... one school per local installation."

**The codebase currently says (ADR-0010, Accepted, 2026-06-23):** local MySQL, explicitly considered and rejected SQLite for schema/dialect-parity reasons across 255 tables. **This decision reverses that.**

Two independent questions were tangled together here; only the first is what got decided:

### 5.1 Storage engine: SQLite vs. local MySQL

| | SQLite (brief's assumption) | Local MySQL (ADR-0010, shipped) |
|---|---|---|
| Query/dialect parity with cloud | None — `ON DUPLICATE KEY UPDATE`, `JSON_*`, `GROUP_CONCAT`, `FOR UPDATE`, generated columns all need review across ~855 call sites (May audit §1) | **Total** — identical SQL runs unmodified in both modes; `db.ts`'s ~435-site `query()`/transaction API is untouched by the mode split |
| Schema maintenance | Two schemas (or a lossy translation layer) for 255 tables, forever | One schema, one migration ledger, forever |
| Install footprint | Zero — a single file, no server process | Real — needs MySQL/MariaDB installed and running (XAMPP today) |
| "One file to protect" story (§10) | Natural — the `.db` file *is* the container payload | Needs a dump/restore step to get in/out of file form (`mysqldump`-equivalent, already how `db:export:full`/`local-init` work today) |
| Concurrent local writers | Single-writer, WAL mode | Full MySQL concurrency (matters less on a single-user desktop, matters more if a school runs DRAIS on more than one LAN machine simultaneously) |
| Engineering cost from here | Large — the abandoned May-audit plan (repo-abstraction layer, dual repo implementations, 8-10 week phase) | Small — already built, already has export/import/verify tooling |
| Battle-tested in this codebase | No | Yes — Electron and Android already boot against it |

**What was recommended here:** keep local MySQL, on the grounds that ADR-0010's reasoning holds up, the cost of reversing it is exactly the 8-10 week "Phase 3: `@drais/repo-sqlite`" the May audit scoped and the team evidently decided wasn't worth paying for, and the "one file to protect" property SQLite would have given for free is achievable for MySQL too via a formalized, encrypted, checksummed dump/restore (§10).

**What was decided instead: SQLite.** Concretely, this commits the roadmap to:

- Standing up the repository-abstraction layer the May audit designed as **Option D** (`@drais/repo-contract` interfaces + `@drais/repo-mysql` + `@drais/repo-sqlite` implementations) — not a full 391-route big-bang migration on day one, but a real, load-bearing new layer that every local-mode write path must go through, because raw `mysql2` calls (855 of them) cannot target SQLite without it.
- Reviewing the ~30% of queries the May audit flagged as MySQL-specific (`ON DUPLICATE KEY UPDATE`, `JSON_*`, `GROUP_CONCAT`, `FOR UPDATE`, generated/virtual columns) for SQLite equivalents, table by table, as each table is brought into local-mode scope — not all 255 tables at once, only the ones local mode actually needs (§9's provisioning contract already scopes this down).
- **Writing a new ADR** (proposed number: ADR-0015) that formally supersedes ADR-0010's SQLite rejection, states the reasoning for the reversal (single-file portability, simpler mental model, brief compliance), and updates ADR-0010's own "Alternatives considered" section to point at it — this repo's ADR index should never show two live, contradictory "Accepted" decisions on the same question.
- **Two databases now exist in this codebase, not one, at the query-authoring layer** — online (TiDB via `mysql2`) and local (SQLite via a different driver, e.g. `better-sqlite3`). This is precisely the "two configurations to keep working" cost ADR-0010 named as a trade-off of even the *MySQL/MySQL* split; a MySQL/SQLite split carries that cost plus genuine dialect risk. Budget code review time accordingly — this is not a mechanical port.
- The existing dual-mode plumbing (`db-mode.ts`'s `online`/`local` resolver, the hard-force-online-on-Vercel safety rule) is still the right shape and is **kept** — only what `local` mode connects to changes, from local MySQL to SQLite-via-repo-abstraction.

### 5.2 What does NOT change because of this decision

`db.ts`'s online-mode code path, the 391 API routes' signatures, and the online/local mode-resolution safety rules in `db-mode.ts` are unaffected — SQLite is a **local mode implementation detail** behind the repo-abstraction layer, not a rewrite of how routes talk to data in online mode. A route written against `@drais/repo-contract` works identically whether the mode resolver hands it the MySQL or the SQLite implementation.

### 5.3 Tenant isolation: "one school per install" — a separate problem, resolved: keep the whole-DB export as a gated ops tool

Independent of the engine question: `npm run db:export:full` dumps **every school** into one file, and `db:local:init` imports all of it — the brief's "local DB must never contain multiple schools" claim is aspirational today, not actual. **Decision (2026-08-18): keep the whole-database export/import as a gated developer/ops-only tool** (per your own transfer workflow in `DESKTOP_LOCAL_TRANSFER.md`), while the school-scoped provisioning contract (§9, Phase 3) becomes the only path any school-facing feature is allowed to call. The two must be kept clearly fenced apart in code — a school-facing "set up a new local install" flow must never be able to reach the whole-DB export function, even accidentally.

---

## 6. Online dependencies — classification

| Dependency | Classification | Why | Offline story |
|---|---|---|---|
| TiDB Cloud (online mode) | CRITICAL (online), NOT REQUIRED (local mode) | Sole source of truth for hosted/multi-school operation | `db-mode.ts` already provides the local escape hatch |
| Vercel | CRITICAL (online), NOT REQUIRED (local mode) | Hosting for the web/API surface | Desktop/Android bundle their own server; no Vercel dependency once installed |
| Cloudinary (photos, backups) | IMPORTANT | 7+ upload call sites (May audit); Backup Center also uploads dumps here | Needs a local-filesystem backend behind a common interface (May audit §5, still valid, still unbuilt) |
| Africa's Talking (SMS) | IMPORTANT | Parent notifications, Sentinel alerting (`alert.ts` calls it directly) | Must queue-and-retry when reconnected; **duplicate-SMS risk on sync is real and unaddressed today** |
| `puppeteer` (server PDF) | IMPORTANT | `src/app/api/students/full/route.ts:410` and other export paths | Electron/Android should use `webContents.printToPDF()` instead — not yet done; still bundles full Chromium in local builds today |
| ZKTeco ADMS/TCP | CRITICAL (for attendance), already LAN-local | `zk-handler`, `zk-tcp` | Runs fine locally — Electron binds `0.0.0.0` specifically for this |
| `zk-relay-agent.js` → cloud relay | OPTIONAL | Only needed when DRAIS itself isn't on the device's LAN | Not needed in local-install mode — the desktop server *is* on the LAN |
| Vercel cron (`/api/result-deadlines`) | OPTIONAL | Single scheduled job | Needs a local scheduler equivalent (`node-cron`/OS task scheduler) in desktop mode — not currently provided |
| Sentinel SMS alerting | OPTIONAL | Operator paging | No offline equivalent needed; local install has no "operator on call" model yet |
| next-auth | NOT REQUIRED | Used in exactly one file (`tahfiz/init`, per May audit); real auth is the custom session system | Irrelevant to offline planning |

---

## 7. Offline readiness matrix

Per-subsystem readiness, reusing and updating the May audit's module-risk table (§4 there) with what's since been verified:

| Module | Can run offline today? | Depends on | Conflict risk if synced later | Sync policy (recommended) |
|---|---|---|---|---|
| Attendance ingestion (ADMS/TCP, local device) | **Yes** — Electron binds `0.0.0.0`, `node-zklib` runs in-process | Local MySQL, local network to device | LOW — append-only `attendance_raw_events` | `APPEND_ONLY` |
| Attendance USB import | **No — doesn't exist yet** | New adapter (§16) | LOW once built (same append-only target) | `APPEND_ONLY` |
| DRCE / report rendering | **Yes**, already proven deterministic | Local snapshot data only | NONE — immutable once ready | `IMMUTABLE` |
| Report card PDF export | **Partially** — `puppeteer` still bundled; not yet swapped for `printToPDF()` | Chromium locally | N/A | N/A |
| Student management | **Yes** (same schema, same routes) | Local MySQL | **HIGH** — same admission_no edited on two devices | `MANUAL_REVIEW` for conflicting identity fields; `LAST_WRITE_WINS` for non-identity fields |
| Academic results entry | **Yes** | Local MySQL | **HIGH** — same student×subject edited on two devices before either syncs | `MANUAL_REVIEW` (never auto-merge grades) |
| School configuration | **Yes** | Local MySQL | LOW — admin-only, rare | `SERVER_WINS` once online is authoritative again (school identity is provisioned from the platform, not invented locally) |
| Finance/fees | **Yes**, mechanically | Local MySQL | **HIGH** — money | `SERVER_WINS` for anything already reconciled online; local finance entry should be treated as provisional until synced, never silently merged |
| Local audit logs | **Yes** | Local MySQL | NONE — append-only | `APPEND_ONLY`, hash-chained (§15) |
| Local backups (`.drs`) | **Yes**, once built | Local filesystem | N/A | N/A |
| Device integration | **Yes**, already the strongest area | Local network | LOW — devices are physically single-tenant | `LOCAL_ONLY` (device registration/config never syncs back as "truth" — it's re-derived per install) |
| Sentinel diagnostics | **Untested** — code is mode-agnostic but never run locally | Local MySQL | N/A (diagnostic only) | N/A |
| Backup/restore | **Backup: yes (school-scoped). Restore: no code exists.** | Local filesystem | N/A | N/A |
| Reference data (terms, classes, subjects, exams) | **Yes**, once provisioned | Pulled once at provisioning | LOW if cloud-authoritative | `SERVER_WINS`, pull-only |
| Notifications (SMS/email) | **Queueing: no. Sending: needs internet, always.** | Africa's Talking, always online | Duplicate-send risk on sync | `APPEND_ONLY` queue with idempotency keys — not built |

---

## 8. Proposed dual-mode architecture

Given the SQLite decision (§5), this **does** need the May audit's Option D shape — not the whole thing on day one, but the real repository-abstraction layer, scoped to only the tables local mode actually touches (driven by §9's provisioning contract, not all 255 tables at once):

```
ONLINE MODE (unchanged)                    LOCAL MODE (SQLite, behind a new abstraction)
─────────────────────                      ─────────────────────────────────────────────
Vercel                                      Electron / Android, same server
  └─ src/app/api/**  (391 routes)             └─ src/app/api/**  (SAME routes — but the
       └─ src/lib/db.ts → query()                  local-scoped subset now calls
            └─ pools.ts → onlineConfig()             @drais/repo-contract, not db.ts, for
                 └─ TiDB Cloud                        tables in the provisioning contract)
                                                          ├─ @drais/repo-mysql   (online impl,
                                                          │    thin wrapper over existing db.ts)
                                                          └─ @drais/repo-sqlite  (local impl,
                                                               better-sqlite3, NEW)
                                             NEW (this roadmap):
                                               ├─ @drais/repo-contract — typed interfaces per
                                               │    sync-eligible table (§9's contract IS the
                                               │    scope list — not "port everything")
                                               ├─ @drais/provisioning  — school-scoped
                                               │    initial data contract (§9)
                                               ├─ @drais/container     — .drs read/write,
                                               │    encryption, integrity, now wrapping a
                                               │    SQLite file directly (§10)
                                               ├─ @drais/package       — .drais assembly (§11)
                                               ├─ @drais/sync          — queue, conflict
                                               │    policy, resumable transfer (§12)
                                               └─ @drais/local-backup  — scheduled .drs
                                                    snapshots + verified restore (§13)
```

**Critical scoping decision, to keep this from becoming the May audit's full 8-10 week Phase 1:** only tables that need to work fully offline (§9's `SYNCABLE`/`LOCAL_ONLY` categories — students, staff, attendance, results, snapshots, overrides, device config) go through `@drais/repo-contract`. Tables that are `READ_ONLY_REFERENCE` or `CONFIGURATION` (§9) can be provisioned as a **read-only SQLite snapshot populated at provisioning/sync time**, queried directly, without a full bidirectional repo interface — cutting the real migration surface from "255 tables" to roughly the ~30 tables the May audit's own module-risk table (§7) already identified as sync-eligible.

Boundaries, adapted from the May audit's Option D:

| Layer | May depend on | May NOT depend on |
|---|---|---|
| `src/app/api/**`, `src/lib/**` (existing, non-local-scoped) | `src/lib/db.ts` only | Nothing new — unchanged, still TiDB-only |
| `@drais/repo-contract` | Domain types only | Any DB driver |
| `@drais/repo-mysql` | `mysql2`, wraps existing `db.ts` query helpers | `better-sqlite3`, browser APIs |
| `@drais/repo-sqlite` | `better-sqlite3` (or equivalent), `repo-contract` | `mysql2`, network |
| `@drais/provisioning` | Both repo implementations (reads online, writes local at import) | UI |
| `@drais/container` (`.drs`) | Node `fs`/`crypto`, a chosen encryption library | Any DB driver directly — wraps the SQLite file as its payload (§10) |
| `@drais/package` (`.drais`) | `@drais/container`, filesystem | Network |
| `@drais/sync` | Both repo implementations, network, `@drais/container` for staging | UI (exposes an API the UI calls) |
| `@drais/local-backup` | `@drais/container`, `@drais/repo-sqlite` | Cloud storage (backups stay local by default; upload is a separate opt-in step, matching Backup Center's existing Cloudinary-upload-as-option pattern) |

These boundaries should be enforced the same way the May audit proposed — `tsconfig` path restrictions + an ESLint rule that fails CI on a violation — since this is exactly the kind of boundary that erodes silently otherwise.

### 8.1 API isolation — this is the non-negotiable rule for the whole SQLite build-out

Given the SQLite decision, `@drais/repo-sqlite` introduces a **second database driver and a second query surface** into a codebase that has 855 raw `mysql2` call sites depending on `src/lib/db.ts`'s exact current behavior (retry/backoff, `timezone:'Z'`, the TiDB `LIMIT ?`-under-prepared-statements workaround documented in ADR-0010, bigint string handling). The risk isn't SQLite itself — it's the possibility of that work touching, wrapping, or subtly changing `db.ts` in the process of building something new next to it. Concretely, non-negotiable:

- **`@drais/repo-contract` / `@drais/repo-mysql` / `@drais/repo-sqlite` are new files in new directories, never edits to `src/lib/db.ts`, `src/lib/db/pools.ts`, or `src/lib/db/db-mode.ts`.** Those three files are the online product's proven, load-bearing DB layer (855 call sites depend on their exact current behavior) and stay byte-for-byte as they are through this entire roadmap. If `@drais/repo-mysql` needs MySQL access, it calls `db.ts`'s existing exported functions as a black box — it does not reimplement or "improve" pooling/retry logic while it's in there.
- **Deliberately different naming, not parallel-looking names that invite confusion.** `db.ts`'s `query()`/`getConnection()`/`getPool()` stay exactly as-is and exactly where they are. The new layer's functions should read unmistakably as a different thing — e.g. `repo.students.findById()`, not another `query()` — so a future contributor can never mistake which one they're calling or accidentally import the wrong one into an unrelated route.
- **Zero existing route is touched to adopt this.** A route stays on raw `db.ts` calls until someone *deliberately* migrates it as part of §9's scoped table list — migration is opt-in, per-route, per-table, exactly like the May audit's original per-route rollback story. No blanket search-and-replace, no "while I'm in here" edits to unrelated queries in a file being touched for another reason.
- **`@drais/repo-mysql`'s existence changes nothing about online behavior.** It is only ever instantiated when `getDbMode()` resolves to `'local'` (§2.2) — on Vercel/hosted, that branch is provably unreachable (`db-mode.ts:37-39`'s hard-force), so the new code doesn't even load into the request path there in practice, let alone execute.
- **Land it inert first.** The repo-abstraction layer (Phase 3 below) should be buildable, unit-testable, and mergeable with zero routes wired to it yet — prove the SQLite implementation passes the same test suite as the MySQL implementation in isolation, *before* a single production route depends on it. This gives a genuine rollback point: if SQLite turns out to be the wrong call after all, deleting the new packages costs nothing, because nothing shipped depends on them yet.
- **Code isolation is not dependency isolation — learned the hard way, 2026-08-19.** The first `dev`-branch Vercel deployment after Phase 3 landed **failed the build entirely**: `better-sqlite3` is a native module, Vercel's Linux build image ships Python 3.12 (which removed the `distutils` module the pinned `node-gyp` needs), no prebuilt binary matched that platform/Node-ABI combination, so the source compile failed and `npm install` exited non-zero — before `next build` even started. This happened *despite* zero routes importing the SQLite layer, because `npm install` doesn't know or care about the import graph — it installs every listed `dependencies` entry unconditionally, on every environment, including the hosted one that will never use it. **Fix:** moved `better-sqlite3` to `optionalDependencies` (npm's standard mechanism — a failed optional install logs a warning and the overall install continues, rather than failing). The rule this generalizes to: **any dependency added for local/desktop-only code must be `optionalDependencies` from the moment it's added, not added-then-fixed-after-the-first-broken-deploy.** Check this before adding the *next* native/desktop-only package (SQLCipher's build, once that swap happens, carries the identical risk).

---

## 9. Local data contract (initial provisioning)

Today's provisioning story (`db:export:full` → `db:local:init`) is a full-database clone. It needs to become school-scoped. Proposed classification, using the brief's own categories:

| Data category | Classification | Examples | Authority once local |
|---|---|---|---|
| School identity | CONFIGURATION | `schools` row (this school only), branding, contact | `SERVER_AUTHORITY` — re-pulled on reconnect, local edits queue for review |
| Academic structure | READ_ONLY_REFERENCE | Classes, streams, subjects, terms, curriculum, grading rules | `SERVER_AUTHORITY`, pull-only |
| Staff & students | SYNCABLE | `staff`, `students`, `people`, `enrollments` scoped to this school | Bidirectional, per §12's conflict table |
| Admission numbers | SYNCABLE (identity-critical) | `students.admission_no` | `MANUAL_REVIEW` on collision |
| Roles & permissions | CONFIGURATION | RBAC catalog + this school's `role_permissions` | `SERVER_AUTHORITY` — the catalog is code-defined; local installs should never invent permissions |
| Attendance/biometric config | CONFIGURATION | `devices`, `biometric_enrollments` for this school's hardware | `LOCAL_ONLY` once provisioned — a device is physically tied to the install that talks to it |
| Grading/report-card config | CONFIGURATION | `dvcf_documents`, DRCE templates | `SERVER_AUTHORITY`, low-frequency edits |
| Fee configuration | CONFIGURATION (read) / SYNCABLE (transactions) | Fee structure = reference; payments recorded = syncable, `SERVER_WINS`-biased |
| Notification templates | CONFIGURATION | Low-frequency | `SERVER_AUTHORITY` |
| Branding/templates/assets | CONFIGURATION | Logos, letterheads | `SERVER_AUTHORITY`, content-addressed for cheap re-sync (May audit §5's sha256-manifest idea still applies) |
| Synchronization metadata | LOCAL_ONLY | Install identity, last-sync timestamp, pending-queue state | Never leaves the device except as sync protocol traffic |
| System/schema version | DERIVED | Current `schema_migrations` head, DRAIS app version | Computed at export/import time, embedded in `.drs` metadata (§10) |
| Audit logs (pre-provisioning) | NOT SYNCED | Whatever happened online before this install existed | Stays online; local audit starts its own hash-chained log at provisioning (§15) |

**What must change to make this real:** a new export mode, `db:export:school --school-id=N`, that walks the same `information_schema`-driven table-ownership discovery `src/lib/backup/discovery.ts` already does for Backup Center (it already does BFS table-ownership classification — this is not new code from scratch, it's extending an existing capability to also drive provisioning, not just backup).

---

## 10. The `.drs` specification

Per the SQLite decision (§5), the payload is a **SQLite database file** — which actually simplifies this section relative to the local-MySQL version of this design: there is no logical-dump/restore step, no `mysqldump`-equivalent generation. The `.drs` container wraps the on-disk SQLite file (or, for the encrypted-at-rest case, a SQLCipher-encrypted SQLite file, making the container's own encryption layer arguably redundant with SQLCipher's — see 10.3's note on this) directly.

### 10.1 What `.drs` is not

Not a renamed database file. A `.drs` file is a **container**: a small header, a manifest, and one or more payload segments, at least one of which is encrypted.

### 10.2 Proposed structure

```
<file>.drs
├── MAGIC            8 bytes   "DRAISDRS"
├── FORMAT_VERSION    2 bytes   uint16 (this spec = 1)
├── HEADER_LEN        4 bytes   uint32
├── HEADER            JSON, HEADER_LEN bytes, NOT encrypted (must be readable
│                      without the key, to decide "can I even attempt this?")
│   {
│     "schoolId": "...", "schoolExternalId": "...", "installationId": "...",
│     "drsFormatVersion": 1,
│     "drAisAppVersionMin": "1.173.0",      // refuse if opening app is older
│     "schemaMigrationHead": "044_backup_center",
│     "engine": "sqlite",                    // per §5 decision, 2026-08-18
│     "createdAt": "2026-08-18T10:30:00Z",
│     "createdBy": { "installationId": "...", "userId": "..." },
│     "kdf": { "algorithm": "argon2id", "params": {...}, "salt": "base64..." },
│     "cipher": "aes-256-gcm",
│     "payloadChecksum": "sha256:...",       // of the DECRYPTED payload
│     "containerChecksum": "sha256:...",     // of everything before this field
│     "compression": "zstd" | "none"
│   }
├── IV / NONCE        12 bytes  (AES-GCM)
├── ENCRYPTED PAYLOAD  variable  AES-256-GCM( compress( logical DB dump ) )
└── AUTH TAG           16 bytes  (AES-GCM, over payload + header as AAD)
```

### 10.3 Primitives (mature, not invented)

- **KDF**: Argon2id (via a maintained Node binding) deriving the file key from a school/install passphrase — never invent a KDF.
- **Cipher**: AES-256-GCM — authenticated encryption, so tamper detection and confidentiality come from one primitive, not two.
- **Integrity**: SHA-256 over both the decrypted payload (detect silent corruption after successful decryption) and the container bytes before the auth tag (detect a truncated/appended file before even trying to decrypt).
- **Atomic write**: write to `<file>.drs.tmp`, `fsync`, rename over the destination — standard crash-safe-write pattern, prevents a half-written `.drs` from ever being mistaken for a complete one.
- **SQLCipher note**: if `@drais/repo-sqlite` (§8) is built on SQLCipher rather than plain `better-sqlite3`, the live local database file is *already* encrypted at rest, independent of `.drs`. That's still correct to keep — SQLCipher protects the **live, running** database; the `.drs` container's own AES-256-GCM layer protects the **exported/backed-up/transferred** file, which travels outside the app's control (USB stick, cloud upload, another machine) and needs its own integrity/tamper story regardless of what protects the live file. Don't skip the container encryption on the assumption SQLCipher already covers it — they protect different things.

### 10.4 Key ownership and recovery — the part that must not create a data-loss trap

The brief is explicit that this must be answered, so, plainly:

- **Key derivation source**: a per-installation passphrase, set at provisioning, stored via the OS credential store (Windows Credential Vault / macOS Keychain / Electron `safeStorage`) — never written to disk in plaintext, matching the May audit's §7 recommendation.
- **What happens if the key is lost**: the `.drs` file becomes **unrecoverable by design** — that is what encryption-at-rest means, and pretending otherwise would be a lie to the school. **Decision (2026-08-18): key escrow is opt-out, i.e. enabled by default.** At initial provisioning (§9), DRAIS Cloud stores a copy of the install's recovery passphrase, encrypted to the school account's own recovery mechanism, exactly like a password manager's account-recovery key. A school must explicitly decline escrow to lose this safety net. This is a real support/liability trade-off you accepted deliberately: DRAIS Cloud becomes a party that can, in principle, unlock a school's local data — this must be disclosed clearly at provisioning time (plain language, not buried in terms), and the escrowed key must itself be encrypted at rest on the cloud side, access-logged, and never retrievable without an explicit, audited support action. A school that does decline accepts that a lost local key means a lost local file, recoverable only via the last successfully-synced-to-cloud state.
- **Machine replacement**: not a key problem at all if sync (§12) has run recently — the new machine re-provisions from the cloud. It's a key problem only for data that was created locally and never synced, which is exactly why §12's "sync early, sync often" framing matters more than any cryptographic feature.
- **Backup restoration**: restoring a `.drs` requires the same key that wrote it (or the escrowed copy). This must be tested as a first-class scenario (§14, Scenario 2), not assumed to work.

### 10.5 What goes in the payload

The SQLite file itself, populated by `@drais/provisioning` (§9) from the school-scoped subset of tables defined in the local data contract — never a whole-database dump (§5.3). Because SQLite files are already self-contained and portable across machines/OS by construction, there's no MySQL-version-compatibility translation step to worry about here (unlike the local-MySQL design's `to-mysql8.mjs`-style dialect stripping) — one genuine simplification the SQLite decision buys back against its repo-abstraction-layer cost.

---

## 11. The `.drais` specification

`.drais` is the portable-package format, one layer up from `.drs`.

### 11.1 Structure

A `.drais` file is a zip-like archive (standard `zip`, or `tar.zst` — pick one, don't invent an archive format) containing:

```
package.json           # DRAIS Package Format version, compatibility range,
                        # manifest of contents, package-level checksum
state.drs               # the .drs container (§10) — the actual database
branding/               # logos, letterheads, template assets (content-addressed,
                        # sha256-named, per May audit §5's file-storage design)
templates/              # DRCE document JSON (already portable, per §2.5)
device-config/          # this install's device registrations (LOCAL_ONLY, §9)
sync-state.json         # last-known sync cursor, pending-queue summary
                        # (metadata only — does not replace the real queue,
                        # which lives inside state.drs)
audit-manifest.json     # hash-chain head + entry count, for tamper-evidence
                        # verification without opening state.drs
```

`package.json`:

```json
{
  "draisPackageFormat": 2,
  "compatibleAppVersionRange": ">=1.173.0 <2.0.0",
  "schemaMigrationHead": "044_backup_center",
  "schoolId": "...",
  "createdAt": "...",
  "kind": "full-backup" | "provisioning-export" | "migration-transfer",
  "manifest": [ { "path": "state.drs", "sha256": "...", "bytes": 51234567 }, ... ]
}
```

### 11.2 Version compatibility — refuse, don't corrupt

On open, DRAIS checks `compatibleAppVersionRange` and `schemaMigrationHead` against the running app before touching `state.drs`. On mismatch, the exact message the brief asks for:

> "This DRAIS package requires DRAIS version 1.173.0 or later. This installation is running 1.150.2. Update DRAIS before importing this package."

No partial import, no "best effort" — a version mismatch is a hard stop, because a schema-behind import risks writing data the older code can't represent correctly (exactly the class of bug the July TCP-pull incident was about, just at the schema level instead of the timestamp level).

### 11.3 Use cases mapped to existing capability

| Use case | Reuses | Net-new |
|---|---|---|
| EXPORT (school → package) | `src/lib/backup/discovery.ts` table-ownership walk | Package assembly, `.drs` encryption |
| IMPORT (package → new install) | `@drais/repo-sqlite`'s schema-creation logic (a new SQLite-target equivalent of `db:local:init`'s apply step) | Compatibility check, decrypt, school-scope validation ("does this package's schoolId match what I'm provisioning?") |
| BACKUP (scheduled local `.drs`) | `src/lib/backup/generator.ts`'s dump logic | Local scheduler, rotation (§13) |
| RESTORE | **Nothing — genuinely net-new** (§4.3) | The whole restore path |
| MIGRATE (schema upgrade) | `scripts/db/migrate.mjs`'s checksum/ledger logic | Applying the ledger to an imported `.drs` before first boot |
| ARCHIVE | Same as BACKUP | Retention policy (§13) |
| TRANSFER (machine → machine) | `DESKTOP_LOCAL_TRANSFER.md`'s existing manual flow | Making it a single `.drais` file instead of a 9-step manual runbook |

---

## 12. Synchronization architecture

ADR-0010 deferred this on purpose; this section is the design it deferred, sized to what DRAIS actually needs rather than a generic CRDT framework.

### 12.1 Why "just use timestamps" fails here, concretely

Two of this codebase's own real incidents already prove it: the July TCP-pull timestamp corruption (`docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md`, RC-1 through RC-6) shows that even *within one machine's clock*, wall-time vs. UTC representation is a proven source of silent corruption — trusting a `last_modified_at` timestamp *across two machines with independent, possibly-wrong clocks* is strictly worse. Sync must use logical ordering (a monotonic per-row version + an explicit device/install identity), not wall-clock comparison, as the tiebreaker of last resort only.

### 12.2 Required schema additions (sync-eligible tables only, not all 255)

- `sync_uuid CHAR(36)` — stable identity, generated at first sync-eligible write. Auto-increment PKs stay as internal-only, never used as sync identity (May audit's "biggest architectural weakness" finding still stands — this is the fix).
- `sync_version BIGINT` — incremented on every local write to the row.
- `sync_origin_install_id` — which install last wrote it.
- `sync_last_synced_version` — the version this row had the last time it successfully round-tripped to the cloud (lets the client detect "did the server change this since I last saw it" without a full diff).

### 12.3 Conflict policy per entity (extends §7's table)

| Entity | Policy | Rationale |
|---|---|---|
| `attendance_raw_events` | `APPEND_ONLY` | Already dedup-keyed on `(device_sn, pin, wall_time)`; sync is a merge of two append-only sets, trivial |
| `students`/`people` core identity fields (admission_no, name) | `MANUAL_REVIEW` | Same admission number entered on two devices is a real, observed risk class (May audit) |
| `students` non-identity fields (contact info, photo) | `LAST_WRITE_WINS` by `sync_version`, tiebreak by install-priority (online > local, arbitrary local > local by timestamp) | Low stakes if wrong, correctable |
| `results`/`class_results` | `MANUAL_REVIEW`, always | Two teachers editing the same student×subject offline is the May audit's named "war zone" — no auto-merge, ever, once a result has been entered on two sides |
| `report_snapshots` | `IMMUTABLE` | Already true by design (ADR-0005) — sync is pure copy, never merge |
| `report_card_overrides` | `MERGE` if disjoint fields touched, else `MANUAL_REVIEW` | Snapshot-scoped, narrow blast radius |
| `enrollments` | `MANUAL_REVIEW` | Student moved between classes on two devices is a real conflict class |
| `finance`/`payroll` | `SERVER_WINS` once reconciled; local entries are provisional (flagged, not merged) until synced | Money must never silently merge |
| Reference data (terms, classes, subjects, curriculum) | `SERVER_WINS`, pull-only | No local write path at all — removes 95% of conflict surface, per the May audit's own recommendation |
| `audit_logs` | `APPEND_ONLY`, hash-chain verified on merge | Tamper-evidence must survive sync (§15) |
| `devices`/`biometric_enrollments` | `LOCAL_ONLY` | Physical hardware belongs to one install; never sync as authoritative elsewhere |
| Notifications | `APPEND_ONLY` queue, idempotency key = `(school_id, event_type, target, dedup_key)` | Prevents the "duplicate SMS to parents" risk the May audit flagged |

### 12.4 Failure-mode requirements (the brief's list, mapped to a mechanism)

| Failure | Mechanism |
|---|---|
| Internet disappears mid-sync | Sync proceeds table-by-table in a fixed order with a resumable cursor persisted after each committed batch; a half-finished sync resumes from the last committed cursor, never re-sends already-acked rows |
| App/machine dies mid-sync | Same cursor persistence — it's disk-backed, not in-memory |
| Duplicate pushes/retries | Every push carries `(install_id, client_op_id)`; server endpoint dedupes on that pair (idempotent by construction, same pattern the May audit recommended and the existing `zk_device_commands` queue/poll/report design in `relay-status/route.ts` already demonstrates works with Next.js serverless) |
| Clock differences | `sync_version` is a per-row monotonic counter, not a timestamp — clock skew can't corrupt ordering |
| Schema version changes mid-flight | `.drais`/`.drs` version header (§11.2) refuses the sync outright rather than attempting a mismatched-schema merge |
| Records edited on both sides | Conflict table above; surfaced via a review UI, never silently resolved for `MANUAL_REVIEW` entities |
| Network returns after weeks | No different in kind from returning after minutes — the cursor/version model doesn't care about elapsed time, only about what changed; the *practical* risk at long offline durations is queue size, not correctness (§20 performance targets should include a "30 days offline, then sync" load test) |
| Thousands of queued changes | Batch the push (e.g. 500 rows/batch), same resumable-cursor mechanism |

---

## 13. Backup architecture

Two levels, matching the brief and reusing what exists:

**Level 1 — `.drs`** (this school's protected state). Extends `src/lib/backup/generator.ts`'s existing dump logic (already does `SHOW CREATE TABLE` + batched INSERTs) with the container format from §10. Naming: `<SCHOOL_CODE>_<YYYY-MM-DD>_<HHmm>.drs`, e.g. `JIPRA_2026-08-18_1030.drs`.

**Level 2 — `.drais`** (complete environment). Wraps a `.drs` plus branding/templates/device-config per §11. Naming: `<SCHOOL_CODE>_FULL_<YYYY-MM-DD>_<HHmm>.drais`.

Required, currently missing, in priority order:

1. **Restore automation** — the single largest gap (§4.3). Must be built as a first-class, tested path before any of the rest of this matters: decrypt `.drs` → verify checksums → verify schema-version compatibility → write to a *fresh* SQLite file, never overwrite the live one in place (atomic rename over the old file only after the new one verifies clean) → run a `@drais/repo-sqlite`-based core-table/row-count check (the SQLite-target equivalent of `db:local:verify`) → only then point the app at it.
2. **Scheduling** — today, both Backup Center and the whole-DB export are 100% manually triggered. Local mode needs a scheduler (OS task scheduler on desktop, or an in-app timer since the desktop app is a long-running process anyway) driving daily `.drs` snapshots.
3. **Rotation/retention** — keep N daily + M weekly, prune older, never prune the most recent verified-restorable one.
4. **Verification-not-just-checksums** — a checksum proves the file wasn't corrupted in transit; it doesn't prove the file *restores*. Periodic (weekly, low-traffic-hour) automated restore-to-scratch-database-and-verify-row-counts is the only test that actually proves a backup is usable — this is explicitly what `src/lib/backup/verify.ts` does NOT currently do (it verifies the dump was generated correctly, not that it restores).
5. **Failed-backup alerting** — feed into Sentinel (§17), not a separate notification path.

---

## 14. Disaster-recovery scenarios

| # | Scenario | Can DRAIS handle it today? | What's needed |
|---|---|---|---|
| 1 | Computer dies, install on another | **No** | `.drais` restore (§11, §13.1) |
| 2 | Local DB corrupted | **Partially** — `db:local:verify` detects missing core tables, but nothing auto-recovers from a verified-latest `.drs` | Corruption detection + auto-offer-restore flow |
| 3 | Internet down 30 days | **Yes**, for everything in §7 marked "Yes" | Nothing new for core ops; sync queue depth becomes the only new concern (§12.4) |
| 4 | Vercel unavailable | **Yes** for local installs (by construction — they don't depend on Vercel once installed); **hosted schools have no fallback** — this is a real, currently-unaddressed gap for schools that only ever run the web app, not Electron/Android |
| 5 | TiDB unavailable | Same as #4 — local installs unaffected; hosted-only schools have zero fallback today |
| 6 | Power loss mid-write | **Mostly yes, mechanically** — MySQL's InnoDB engine is crash-safe by design (redo log); what's *not* yet handled is a mid-write `.drs`/`.drais` file (§10.3's atomic-write pattern covers this once built) |
| 7 | Sync interrupted | **N/A — sync doesn't exist yet.** Design in §12.4 |
| 8 | Malformed `.drais` import | **N/A — doesn't exist yet.** §11.2's hard-refuse-on-version-mismatch, plus reject on any checksum failure before touching the DB |
| 9 | `.drs` copied to another machine — is it authorized? | **N/A — doesn't exist yet.** The key (§10.4) *is* the authorization — a `.drs` without its key is inert. This is arguably a feature, not a gap: DRAIS should not try to build machine-fingerprint binding on top of this (added complexity, and it's the kind of DRM-like mechanism that turns into its own disaster-recovery trap the day a school needs to move to new hardware) |
| 10 | Migrate local back to online | **No — this is exactly the sync engine (§12), one direction of it.** Until Phase 5 (§25) ships, this is a manual, Backup-Center-adjacent operation: export local `.drs`, reconcile by hand against online (small schools only — this does not scale to "thousands of queued changes" without the real sync engine) |

---

## 15. Security architecture

Reusing the May audit's §7 findings (still accurate) and updating with what's since shipped:

| Concern | Status today | What's needed |
|---|---|---|
| Session/auth | Unchanged — DB-backed session, bcrypt | Fine as-is for local mode too (single-user-per-session model doesn't need to change) |
| RBAC | **Materially improved since May** — catalog + `authorize()` exist; route coverage still partial (§2.3) | Finish R4 route-gating (already scoped in `RBAC_ARCHITECTURE.md`, not new work this brief needs to invent) |
| School isolation online | `WHERE school_id=?` everywhere, actively hardened (commit `2b51ca2`) | Continue the existing sweep |
| School isolation, local install | **Currently broken** — whole-DB export/import ships every school (§5.2) | Must fix via §9's school-scoped provisioning before any `.drs` work ships |
| Data at rest, local | **Currently N/A** — local mode doesn't exist yet on SQLite; the live local MySQL prototype today has no at-rest encryption | Build `@drais/repo-sqlite` on **SQLCipher**, not plain SQLite, from day one (per the May audit's original §7 recommendation) — this protects the live, running database, and is independent of `.drs`'s own container encryption, which protects exported/transferred files (§10.3) |
| Device theft | Not addressed today | OS credential store for the sync/backup key (§10.4) means a stolen laptop without its OS login doesn't yield a decryptable `.drs`; the *live* local MySQL data is only as protected as the OS login + optional disk encryption |
| Tamper-evident audit log | Online `audit_logs` exists; no hash-chaining anywhere | Add hash-chaining for local-mode audit logs specifically (§12.3), since local audit logs are the ones a "sufficiently determined adversary" (the brief's own phrase) has physical access to |
| Code signing | **Not done** — both Electron and Android builds are unsigned (`electron-builder.yml:78-83,129-130`) | Required before any production DR story is credible — an unsigned installer is itself a tamper vector; get Windows Authenticode + macOS notarization before `.drs` restore automation ships, not after |
| Auto-update | **Not implemented** (`publish: null`) | Needed eventually for patching local installs against future CVEs, but explicitly **not** a prerequisite for the offline-resilience goals in this brief — sequence it after, not before |
| USB/removable-media risk | N/A today (no USB import exists) | §16 covers file-format validation; treat any USB-sourced file as untrusted input, same as the `.drais` import path |

**Explicit statement per the brief's requirement:** the `.drs`/`.drais` extensions are not themselves security. Security comes from Argon2id + AES-256-GCM + the OS credential store holding the key, exactly as §10.4 states — the file extension is a UX affordance for "DRAIS knows how to open this," nothing more.

---

## 16. USB ZKTeco attendance import (V1-final)

This is smaller than it looks, because the hard parts already exist.

### 16.1 What already exists (do not rebuild)

- Staging pipeline: `beginAcquisition` → `stageRecords` → `finishAcquisition` (`src/lib/attendance/acquisition/service.ts`), with `AcquisitionMethod` already reserving `'usb_import' | 'csv_import'` as literal values.
- Wall-time handling: `wall-time.ts`'s `DeviceWallTime` type — built specifically to prevent the class of bug (RC-1 through RC-6) a naive USB-file parser would otherwise reintroduce.
- Identity resolution: `resolveIdentity()` (`src/lib/biometric/identity/resolve.ts`) and the `pending_device_users` human-review queue for ambiguous PINs — this already implements the brief's exact requirement ("DRAIS must ask the operator to resolve ambiguity").
- Validation service (drift, duplicates, unmatched identities) — scoped but not yet built per `docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md` §7 (the "Validation service" box), which is the direct design ancestor of this feature.
- A four-section operator console pattern already designed for TCP pull (`/attendance/device-control`, per the same doc §8) that a USB-import tab should extend, not duplicate.

### 16.2 What's net-new

1. **A parser** for whatever the target ZKTeco firmware actually exports to USB — this needs one real device's real export file to build against (binary `.dat` attendance-log format, or CSV, depending on firmware; verify against actual hardware before committing to a format, since firmware variance is already a documented risk in the TCP-pull doc's Risk table).
2. **An upload/parse route** — `POST /api/attendance/usb-import` — that turns the parsed file into the same `RawPunch { deviceSn, pin, wallTime, verify, io, seq }` shape the TCP/ADMS adapters already produce, then calls `beginAcquisition({ method: 'usb_import', ... })` and the existing `stageRecords`/validation/commit chain. **No new attendance engine — this is an adapter, full stop**, exactly as the brief itself insists.
3. **A device-identity binding step** — the USB file needs to declare (or the operator needs to confirm) which registered `devices` row it came from, since a USB export doesn't carry the network context TCP/ADMS pulls have; reuse the tenancy-verification lesson from RC-6 (verify against the device's own serial number, never infer from context alone).

### 16.3 Sequencing relative to the TCP-pull redesign

`docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md` is itself "AWAITING APPROVAL" and sequences USB/CSV as its own **Phase 5**, after the acquisition backbone (done), pull-by-date UI (not done), operator workflow UI (not done), and committer (not done). **Recommendation: do not build USB import ahead of that document's Phases 2-4.** Building it first means either duplicating the not-yet-built validation/operator-confirmation UI just for USB, or shipping USB import without the preview/confirm safety net the brief explicitly requires ("DRAIS must NEVER silently guess dangerous mappings") — both are worse than sequencing it correctly. This is a real scope dependency, not a nice-to-have ordering preference.

---

## 17. Sentinel integration architecture

Sentinel's architecture already generalizes cleanly to local mode — it's DB-mode-agnostic code that's simply never been exercised locally. What's needed:

1. **Prove it first** — run the existing `scripts/sentinel/verify-live.mjs` pattern against a real local-mode instance (today it hardcodes online; needs a local-mode variant), before adding a single new observer. This is a verification task, not a design task.
2. **New observers this roadmap needs** (small, additive, following the existing `observers/*.ts` pattern):
   - `sync-health.ts` — queue depth, staleness of last successful sync, failed-sync count
   - `local-backup-health.ts` — last `.drs` snapshot age, last verified-restore date, disk space remaining
   - `local-db-integrity.ts` — wraps `db:local:verify`'s existing core-table check as an observer instead of a standalone script
3. **Do not add auto-remediation.** The `autoRemediationSafe` field already exists in the schema and is unused everywhere by design — extend that pattern (diagnose + alert), not invent a "self-healing" action layer this codebase has explicitly avoided so far. If a specific, narrow auto-remediation is wanted later (e.g., "if local disk is >95% full, prune old `.drs` beyond retention policy automatically"), scope it as its own decision, not a default.
4. **Local alerting can't use SMS the same way** — `alert.ts` calls Africa's Talking directly, which needs internet. Local-mode Sentinel alerts should surface in-app (a persistent banner/notification-center entry) as the primary channel, with SMS as an opportunistic secondary once connectivity returns — mirroring the notification-outbox pattern already used elsewhere, not `alert.ts`'s direct-dispatch shortcut.
5. **Sentinel already avoids becoming a second application** by design (job-runner reuse, no new cron, shared `db.ts`) — this property must be preserved; new local-mode observers should be additional entries in `sweep.ts`'s existing list, not a parallel local-only Sentinel.

---

## 18. Minimal-hardware strategy

The SQLite decision (§5) actually helps here: an embedded database with no server process is a materially lighter footprint than the local-MySQL design this section originally weighed against it — no `mysqld` process, no service to keep running, no XAMPP install step. What's left to measure is genuine, not a tension to resolve first:

Required measurements (feed directly into §20's performance baseline):
- Cold-boot time: Electron main process → SQLite file open/verify → first page render
- Idle memory: Electron/Node process + SQLite in-process overhead, steady state
- Database size on disk at 500/1,000/5,000/10,000 students — the May audit's original estimate ("~50-100MB SQLite file") applies directly now, since the engine matches what it measured against
- Background process count — today's local install runs the Electron main process, the bundled Next.js server, and *optionally* the ZK relay agent if the device isn't reachable directly. Audit whether the relay agent is even needed in local-install mode (§2.4's finding: it isn't, since the local server itself binds `0.0.0.0` and is already LAN-visible to devices) and make sure it's not started redundantly.
- Query performance under the `@drais/repo-sqlite` abstraction layer specifically — the abstraction itself (not just SQLite) is new code and needs its own overhead measured, not assumed to be free.

**Recommendation:** benchmark before optimizing, same principle as before, but the starting position is now better than the local-MySQL design's — the real minimal-hardware risk is more likely Electron/Chromium's baseline memory footprint and the new repo-abstraction layer's overhead than the database engine itself.

---

## 19. Testing & chaos-testing strategy

Existing test infrastructure to build on (already real, not proposed): `src/lib/{attendance,biometric,drce,snapshots,sentinel,notifications,ingestion,academics,passouts}/__tests__/*.test.mjs`, run via `npx tsx --test`, one `npm run test:X` script per subsystem. This pattern should be extended, not replaced, for every new subsystem in this roadmap (`test:provisioning`, `test:container` for `.drs`, `test:sync`).

Chaos scenarios, mapped to what's genuinely testable without physical hardware:

| Chaos test | How |
|---|---|
| Kill app mid-sync | Integration test: start a sync, `kill -9` the process at a randomized point after N batches, restart, assert resume-from-cursor with no duplication (uses the idempotency key from §12.4) |
| Corrupt a `.drs`/`.drais` | Property test: flip random bytes in a valid file, assert every corruption is caught by checksum/auth-tag verification before any DB write is attempted, never a silent partial-import |
| Invalid package (malformed, wrong version) | Fixture-based: a small library of deliberately-broken `.drais` files (bad magic, wrong version range, tampered checksum), assert each produces the exact refuse-message from §11.2, never a crash |
| Duplicate attendance send | Feed the same `RawPunch` batch through the acquisition pipeline twice, assert row count doesn't double (existing `attendance_raw_events` dedup key already gives this for free — write the test to prove it, since it appears untested today per `src/lib/attendance/README.md:68`'s note that routes lack automated coverage) |
| Wrong/impossible timestamps | Reuse the property-test pattern `TCP_PULL_FORENSIC_AND_REDESIGN.md` §10 already specifies ("wall-string round-trip property tests across host TZs — `TZ=UTC` and `TZ=Africa/Kampala` in CI") — this should already be built as part of that redesign, independent of this brief |
| Clock changed mid-operation | Since sync uses `sync_version` counters, not wall clocks (§12.2), this should be a non-event — write the test specifically to prove that property holds, since it's easy to accidentally reintroduce a timestamp comparison somewhere |
| Restart during backup | Kill mid-`.drs`-write, assert the atomic-write pattern (§10.3) leaves either the old file intact or nothing — never a half-written `.drs` masquerading as complete |
| Minimal available memory | Run the local build under an artificially constrained container (cgroup memory limit on Linux CI) and assert graceful degradation (clear error, not a silent hang) rather than measuring a real number on real hardware — real-hardware numbers belong in §20, not chaos testing |

---

## 20. Performance baseline plan

No numbers exist yet for the local-MySQL configuration at DRAIS's real data volumes — measure before claiming. Required matrix (per the brief's explicit table):

| Scale | Attendance ingest | Student search | Student list | Academic entry | Report-card gen | Export | Backup (`.drs`) | Restore | Sync (initial) |
|---|---|---|---|---|---|---|---|---|---|
| 500 | measure | measure | measure | measure | measure | measure | measure | measure | measure |
| 1,000 | … | … | … | … | … | … | … | … | … |
| 2,000 | … | … | … | … | … | … | … | … | … |
| 5,000 | … | … | … | … | … | … | … | … | … |
| 10,000 | … | … | … | … | … | … | … | … | … |

For each cell, record CPU, RAM, disk, DB size, and wall-clock duration, on the *actual minimal-hardware target* identified in §18 — not a developer laptop. This table is intentionally left as a plan, not filled with invented numbers: filling it requires running code that doesn't exist yet (`.drs` backup/restore, sync) and hardware that hasn't been chosen as the reference machine. Treat "no numbers yet" as an honest status, not a gap to paper over.

---

## 21. Versioning strategy

Every persistent format gets an explicit version field, and DRAIS must be able to answer "what created this, what understands it, can I migrate it, can I restore it" for each:

| Artifact | Version field | Compatibility rule |
|---|---|---|
| DRAIS application | `package.json` `version` (semver, already exists — currently 1.173.70) | — |
| Database schema | `schema_migrations.migration_name` (already exists, ledger-tracked per §2.2) | Monotonic, checksummed, never rewritten in place |
| `.drs` format | `HEADER.drsFormatVersion` (§10.2) | Reader must support the version or refuse — no best-effort partial reads |
| `.drais` format | `package.json.draisPackageFormat` (§11.1) | Same — hard refuse with the exact message from §11.2 |
| Sync protocol | Not yet designed — needs its own version field once §12 is built, independent of the app version, since sync protocol and app release cadence will drift apart over time | Server and client negotiate the highest mutually-supported version at connect time; refuse to sync on no overlap, don't attempt a downgraded sync silently |
| Migration scripts | Already versioned via the ledger (§2.2) — the gap is the *undocumented* root `migrations/` folder, not versioning itself | Fold the root `migrations/` folder into the managed ledger, or explicitly document it as a second first-class mechanism — the current silent gap in `MIGRATIONS.md` is the actual risk, not a missing version scheme |

---

## 22. What must NOT be changed

Per Rule 1/2 of the brief, stated explicitly against this specific codebase:

- **`src/lib/db.ts`'s existing `query()`/transaction API and its ~435-855 call sites.** Nothing in this roadmap requires touching them — that's the entire point of §5's recommendation.
- **The online (`DbMode='online'`) code path and its hard-forced behavior on Vercel** (`db-mode.ts:37-39`). Every new local-mode capability must be additive and must not introduce a branch that could ever execute on the hosted deployment.
- **`report_snapshots` immutability** (ADR-0005) — this property is load-bearing for both the existing report system and every offline/sync design in this document. Do not weaken it to make sync "easier."
- **The RBAC catalog/`authorize()` engine** (§2.3) — extend its route coverage, don't build a parallel local-mode authorization system.
- **The existing device-relay pattern** (`zk-relay-agent.js`/`relay-status`) for schools that keep DRAIS Cloud off their LAN — local-mode work does not replace this; it's an orthogonal deployment choice a school makes independently of online vs. local DB mode.
- **The 391 existing API routes** — no big-bang rewrite. Local mode already works with them unmodified via the `db-mode` switch; this roadmap adds provisioning/backup/sync/container capabilities *around* them, not through them.
- **`src/lib/db.ts`, `src/lib/db/pools.ts`, `src/lib/db/db-mode.ts` — no edits of any kind for the SQLite build-out** (§8.1). This is the sharpest version of Rule 1/2 for this specific roadmap: the entire justification for calling this decision safe is that the proven online path is never touched by the new work sitting next to it. `@drais/repo-sqlite`/`@drais/repo-mysql` are new packages with a deliberately distinct API surface (§8.1) — not a refactor of the existing one, and not permitted to become one along the way.

---

## 23. What should be refactored

Small, targeted, high-value — not a rewrite:

1. **`src/app/api/sync/trigger-local/route.ts` and `sync/manual-upload/route.ts`** — rewrite to go through `enrollment-service.ts`/`resolveIdentity()`/the acquisition pipeline like `zk-handler` already does, instead of their current direct-table-write duplication (§2.4). This is a correctness fix independent of this roadmap, but it directly matters here: any USB-import work (§16) must not copy these two routes' pattern by accident.
2. **`src/lib/backup/discovery.ts`'s table-ownership walk** — generalize from "backup this school" to also drive "provision this school" (§9) and "package this school" (§11). One walk, three consumers, instead of three separate implementations.
3. **`db:export:full`/`db:local:init`** — **decision (2026-08-18): keep as-is, as a gated developer/ops-only tool** (§5.3), clearly fenced off in code so no school-facing feature can reach it. It also stops being the local-mode provisioning path once SQLite (§5) lands — its role narrows to "seed my own local-MySQL dev/test environment," not "provision a school's local install," which becomes `@drais/provisioning` → SQLite (§9, §25 Phase 3) exclusively.
4. **`docs/database/MIGRATIONS.md`** — add the fourth mechanism (root `migrations/`) it currently omits, or fold that folder into the managed ledger. Small doc fix, real risk-reduction, unblocks confident reasoning about "what schema version is this install on" for `.drs`/`.drais` headers.

---

## 24. What should be postponed

- **Bidirectional sync's hardest cases** (results/finance `MANUAL_REVIEW` UI) — real, but should follow a working one-way (cloud→local) sync first, exactly as the May audit's phase sequencing argued and ADR-0010's "future considerations" implies.
- **Auto-update for Electron/Android** — needed eventually, not a prerequisite for offline resilience.
- **Code-signing** — sequence before *shipping* restore automation to real schools (§15), not before building/testing it.
- **Cloudinary → local-filesystem photo backend swap** (May audit §5) — real work, orthogonal to this brief's core ask; sequence after `.drs`/`.drais` land, since photos are a SYNCABLE-but-not-critical-path data category.
- **`puppeteer` → `printToPDF()` swap** — real, scoped, low-risk, but not blocking any of the DR/offline scenarios in §14 (report generation works locally with `puppeteer` bundled today, per the May audit; it's just heavier than necessary).
- **RBAC R4 route-gating completion** — already a scoped, in-progress workstream independent of this brief; don't fold it into the V2 roadmap's critical path, just don't regress it.

---

## 25. Phased roadmap

Each phase specifies objective, files/modules, risk, and completion criteria. Sequenced so the online product never breaks and each phase is independently demoable, per the brief's own requirement, and reflecting the four decisions recorded in §27: **SQLite** for local mode, **opt-out key escrow**, whole-DB export **kept as a gated ops tool**, and **V1-final work sequenced before local-mode work**.

### Phase 0 — Decisions recorded ✅ (this document, §27)
Done as of 2026-08-18. No further sign-off needed to begin Phase 1.

### Phase 1 — V1 finalization: acquisition-backbone completion ✅ done (2026-08-19)
**Correction to this document's original assessment:** the staging/validation/committer library code (`src/lib/attendance/acquisition/{service,validate,commit,wall-time}.ts`) and the operator-workflow UI on `/attendance/device-control` (Raw Inspection, first-3/last-3 anchors, time-check gate, commit/discard) turned out to already be fully built by prior work in this repo before this roadmap started — this document underestimated how far Phases 1-4 of `TCP_PULL_FORENSIC_AND_REDESIGN.md` had actually progressed. The one real gap found on inspection: the legacy direct-write `pull_attendance` action was still live and still reachable from a second UI surface (`/attendance/devices`'s own "Pull Attendance Logs" quick-dialog), bypassing the safe wizard entirely — exactly the RC-1/RC-3/RC-5 danger class the redesign exists to eliminate. Closed in this session: `stage_pull` extended to full parity with the legacy action (today/full/range modes), the devices-page dialog migrated to stage-then-review instead of direct-write, `device-control` gained the ability to open directly on an already-staged batch via `?acquisitionId=`, and `pull_attendance` now returns a 410 pointing callers at the safe flow instead of silently writing to attendance data. Original objective text preserved below for the record.
- **Objective:** land Phases 2-4 of `docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md` (pull-by-date + Raw Inspection UI, operator workflow, committer) — this is pre-existing, approved-in-spirit, scoped work, not new to this roadmap.
- **Files:** `src/app/api/attendance/zk-tcp/route.ts`, `src/app/attendance/device-control/*`, `src/lib/attendance/acquisition/*`.
- **Risk:** MEDIUM (production attendance data touched). **Tests:** property tests across `TZ=` values, per that doc's own §10.
- **Rollback:** per-phase, staged behind the existing route (old direct-write path stays until Phase 4 gates it off).
- **Completion:** TCP pull has preview/confirm, no direct writes without operator sign-off.

### Phase 2 — USB attendance import ✅ done (2026-08-19)
Built as designed in §16: `src/lib/attendance/acquisition/usb-parser.ts` (pure parser, strict on date-order ambiguity per the RC-1..RC-6 lesson, never silently drops a bad line), `POST /api/attendance/usb-import` (device-identity binding verified against `devices` for this school, then the exact same `beginAcquisition → stageRecords → validateAcquisition` pipeline TCP pull uses), and a file-picker on `/attendance/device-control` landing on the identical inspect/time-check/confirm steps. Found and fixed a real provenance bug while wiring this in: `commit.ts` hardcoded `source='tcp_pull'` on every committed row regardless of acquisition method — harmless while only TCP pull existed, silently mislabeling as `tcp_pull` was ready to happen the moment a second method existed. Fixed to use the batch's own `method` column. No real ZKTeco USB export file was available to test the parser against — firmware variance (documented risk in the TCP-pull audit) means this needs validating against at least one real device export before being trusted in production.
- **Objective (original):** the adapter described in §16.
- **Dependency:** Phase 1 (needs the operator-confirmation UI and validation service to exist first — §16.3).
- **Risk:** MEDIUM (new parser against unverified firmware variance).
- **Completion:** an operator can import a USB-exported attendance file, see the same Raw Inspection/confirm flow as TCP pull, and committed rows are indistinguishable in `attendance_raw_events` from any other acquisition method.

### Phase 3 — Repository abstraction layer (`@drais/repo-contract`, `repo-mysql`, `repo-sqlite`) — 🟡 started, first vertical slice landed (2026-08-19)
Built as `src/lib/repo/{contract,mysql,sqlite}/` (plain modules in the existing single package, deliberately not a pnpm-workspace/turborepo split — that tooling would be its own yak-shave and this brief explicitly warns against overengineering; the `@drais/*` names are a naming convention for the boundary, not literal separate packages, at least for now). Covers 2 of the ~30 in-scope tables as a genuine proof of the pattern rather than shallow coverage of many: `schools` (simple, CONFIGURATION) and `students` (complex, SYNCABLE, identity-critical — the harder case, chosen deliberately). Verified, not just asserted:
  - 11/11 tests green (`npm run test:repo`) against `repo-sqlite` on an in-memory DB — CRUD round-trip, school-scoped tenant isolation, soft-delete semantics, duplicate-admission_no handling as a typed `RepoError`, schema idempotency across a real second file connection.
  - `repo-mysql` compiles and constructs cleanly (import-smoke-tested) but is **not** exercised by an automated test — no isolated MySQL/TiDB test database exists in this environment, and this work deliberately does not "test" against the real production TiDB Cloud database. Stated gap, not a silent one — see `src/lib/repo/__tests__/contract-assertions.mjs`'s header.
  - §8.1 isolation rule verified, not assumed: `git diff` on `src/lib/db.ts`/`db/pools.ts`/`db/db-mode.ts` is empty, and no file under `src/app/**` imports from `@/lib/repo` — confirmed by grep, not by inspection alone.
  - SQLite schema (`src/lib/repo/sqlite/schema.ts`) translated from `database/consolidated_schema.sql`'s `schools`/`students` DDL, which the codebase's own docs flag as "archaeological, not authoritative" — reconcile against a live `information_schema` export before this table set grows.
  - **Honest gap vs. §15's own recommendation:** this uses plain `better-sqlite3`, not SQLCipher. §15 says build on SQLCipher from day one for at-rest encryption; this slice used the plainer library to get a real, tested vertical slice landed quickly and prove the pattern first. Swapping to a SQLCipher-compiled build is a connection-layer change only (`sqlite/connection.ts`) — the schema and repo code above it don't change — but it must happen before any real school data ever touches this layer, not after.
- **Objective:** stand up the layer the SQLite decision requires (§5, §8), scoped to the ~30 sync-eligible tables from §9's contract, not all 255. **Ships with zero routes wired to it** — this phase proves the abstraction works in isolation before anything production depends on it.
- **Files:** new packages only — `@drais/repo-contract` (typed interfaces), `@drais/repo-mysql` (thin wrapper that calls `src/lib/db.ts`'s existing exported functions, does not reimplement them), `@drais/repo-sqlite` (new, `better-sqlite3`/SQLCipher-backed). **Zero edits** to `src/lib/db.ts`, `src/lib/db/pools.ts`, `src/lib/db/db-mode.ts` (§8.1, §22).
- **Risk:** LOW, specifically *because* nothing depends on it yet — the risk this phase exists to eliminate is doing this work later, under pressure, wired directly into live routes.
- **Tests:** the same contract test suite runs against both `repo-mysql` and `repo-sqlite`; green on both is the phase's core deliverable, not a nice-to-have.
- **Rollback:** delete the packages. Nothing else in the app references them yet, so this is a true no-cost rollback — worth preserving by not skipping ahead to Phase 4 before this is solid.
- **Completion:** for every table in §9's local data contract, both repo implementations pass an identical test suite; a scratch script can round-trip real data through `repo-sqlite` end-to-end with no involvement from `db.ts` whatsoever.

### Phase 4 — School-scoped provisioning — ✅ done, first vertical slice (2026-08-19)
Built as `src/lib/provisioning/{provision-school,verify}.ts` — `provisionSchool()` reads via an injectable `Repos` source (defaults to real `@drais/repo-mysql`), seeds `@drais/repo-sqlite` via a new upsert-by-id path (`sqlite/seed.ts`, deliberately separate from the normal `create()`/`update()` contract — provisioning preserves the source's exact id/timestamps, which is a different operation from an ordinary app write; see that file's header on why matching ids is a safe, deliberately scoped-to-this-phase choice, not the long-term sync identity model). `verifyProvisionedSchool()` is the piece that actually proves the property this phase exists to establish: an **unscoped** query across the whole local file for any `school_id` other than the target one — proven to actually catch a leak, not just assumed to, via a test that plants a second school's rows directly in the file and confirms the verifier flags it. `db:export:full`/`db:local:init` are untouched, exactly as decided.

**Three real bugs found, not just features shipped** — worth recording because of how they were found, and because two of them share one root lesson:
1. **Caught by the test suite itself:** the schema's own `FOREIGN KEY` constraint (`students.school_id → schools.id`) refused a naive first version of the leak-simulation test, because a student row can't reference a school row that doesn't exist locally. Genuinely good news about the schema — but it meant the test had to be corrected to simulate the *realistic* leak (a future buggy adapter copying both rows, not just one) to actually exercise `verifyProvisionedSchool`'s own check, which the FK constraint can't cover.
2. **Caught only by testing against real production data, not by any fixture in this repo:** `mysql2` returns `DATETIME`/`TIMESTAMP`/`DATE` columns as JS `Date` objects, not strings. `better-sqlite3` throws immediately on a bound `Date`. Fixed at the boundary (`src/lib/repo/mysql/util.ts`'s `toIso`/`toIsoDate`).
3. **Also only caught against real production data, and more serious:** the shared pool config sets `bigNumberStrings: true` (`src/lib/db/pools.ts`, deliberate, untouched — correct handling of BIGINT precision), so every BIGINT column — every `id`, `school_id`, `person_id`, `village_id` in this schema — comes back from `mysql2` as a **string**, not a number. This silently broke `provisionSchool`'s own tenant-isolation guard: `"8002" !== 8002` under strict equality even though both print identically, meaning **provisioning any real, BIGINT-backed school failed outright** — not an edge case, the normal case. Fixed the same way (`toNum`/`toNumOrNull` in the same util module), with a regression test asserting the exact `!==` comparison that broke.

Both (2) and (3) share one root lesson, worth stating plainly rather than letting it be read as two unrelated one-off fixes: **every test in Phases 3-4 used a SQLite-backed fake "source" for the online side** (documented, deliberate, since no isolated MySQL test DB exists) — which meant every timestamp and every id in every test was already in its correct final JS shape, string-or-number-wise. That made both of these bugs **structurally invisible to the whole test suite**, caught only when a real read against production TiDB was actually run. **A fake source built from the same engine as the thing being tested can hide an entire class of bug that only exists at a real engine-to-engine boundary.** Any future phase that keeps using this fake-source testing strategy should read this as a standing caveat on what it does and doesn't prove, not a one-time fix to forget about — and it argues for periodically running the real CLI (`scripts/provisioning/provision-school.mts`) against real (read-only) production data as a cheap, high-value check that the automated suite structurally cannot perform on its own.
- **Objective:** replace whole-database export/import with the school-scoped contract from §9, writing into SQLite via `@drais/repo-sqlite`.
- **Dependency:** Phase 3 (needs a working `repo-sqlite` to provision into).
- **Files:** new `@drais/provisioning` module reusing `src/lib/backup/discovery.ts`'s table-ownership walk; reads via `@drais/repo-mysql`, writes via `@drais/repo-sqlite`. `db:export:full`/`db:local:init` stay untouched, per §5.3/§23's decision to keep them as separate, gated dev tools rather than repurpose them.
- **Risk:** MEDIUM (first real end-to-end exercise of the new abstraction against live-shaped data).
- **Completion:** a fresh desktop install can be provisioned with exactly one school's data into a SQLite file, verified by row-count/table-scope audit against the source school only — and *only* that school.

### Phase 5 — `.drs` container — ✅ done (2026-08-19)
Built as `src/lib/container/{kdf,aes-gcm,drs-format,write-drs,read-drs}.ts`. Primitives: AES-256-GCM and SHA-256 from Node's own `crypto` module (zero new dependency); Argon2id via `hash-wasm` — chosen **specifically** because it's pure WASM with zero install-time compile step, a deliberate reaction to this session's own `better-sqlite3` incident (a native module that built fine locally and broke the Vercel build entirely). Confirmed at install time: `hash-wasm` has no install script at all, unlike every native-ish dependency already in this repo.

One real refinement made during implementation, worth recording since it changes the container format from the original sketch in §10.2: that sketch put a `containerChecksum` field *inside* the header JSON, described as "sha256 of everything before this field" — which is self-referential and not actually computable as written (the header's own serialized bytes, which contain that field's value, can't hash themselves). Implemented instead as a single trailing whole-file `FILE_CHECKSUM` (32 bytes, SHA-256 of every byte before it) — same goal, no circularity. `drs-format.ts`'s own header comment carries the full explanation.

9/9 tests green (`npm run test:container`), each directly proving a stated completion criterion: round-trip byte-identical, header readable with zero passphrase, wrong passphrase fails cleanly (`DrsDecryptError`) rather than returning garbage, a single flipped byte anywhere in the encrypted region is caught by the whole-file checksum *before* decryption is even attempted (`DrsIntegrityError`) — proven by using the *correct* passphrase in that test, isolating that it's the checksum catching it, not GCM, a format-version-too-new file is refused with a specific error (`DrsVersionError`) rather than guessed at, and a normal write leaves no `.tmp-*` file behind (the atomic-write pattern actually completing, not just present in the code).

**Honest cost, not swept under the rug:** each Argon2id call measured ~1-2.5 seconds on this development machine (64 MiB memory, 3 iterations — OWASP's own recommended desktop-class Argon2id profile). That is the real price of choosing WASM over a native binding for build safety — a school administrator unlocking a local install will feel that delay every time. Not fixed in this phase; flagged here so it's a deliberate, visible tradeoff for whoever tunes it later, not a forgotten characteristic discovered in production the way the last three bugs were.
- **Objective:** §10, wrapping the SQLite file `@drais/provisioning` produces.
- **Files:** new `@drais/container` module (encryption, checksums, atomic write).
- **Risk:** MEDIUM (cryptographic correctness — use audited libraries, add round-trip property tests before anything else touches this format).
- **Completion:** a `.drs` file can be produced, its header read without the key, its payload decrypted+verified with the key, and a deliberately-corrupted file is rejected with a specific error, never a crash or silent partial read.

### Phase 6 — `.drs` restore automation — ✅ done (2026-08-19)
Built as `src/lib/container/restore.ts`. Closes the gap this phase exists for: **no backup mechanism anywhere else in this codebase (Backup Center, `db:export:full`) can put a file back** — this is the first one that can. Order matches §13 item 1 exactly: decrypt/verify the `.drs` (reusing Phase 5's `openDrsFile`, which already refuses before touching anything if the file is bad) → write to a *fresh* file, never the live target → verify the fresh file structurally (SQLite's own `PRAGMA integrity_check`, plus the same unscoped-query tenant-isolation proof Phase 4 established) → only then atomically swap it into place, preserving the old file as a `.pre-restore-<timestamp>` sidecar rather than deleting it.

Deliberately self-contained, unlike Phase 4's `verifyProvisionedSchool`: restore verification needs no live source and no network access at all, since DR Scenario 2 (corrupted local DB) and Scenario 3 (30 days offline) can both be true at once — a school in that situation has no online connection to compare counts against, and restore must still work.

Caught and fixed one real bug in my own code before it ever reached tests: the original draft conflated "no existing target file" with "the preserve-move actually failed" in one try/catch — a real permission error during the old-file-preserve step would have been silently swallowed as "nothing to preserve," risking a swap that never actually backed up the live file it was about to replace. Split into a separate existence check so a genuine failure now propagates instead of being absorbed.

14/14 tests green (`npm run test:container`, both Phase 5 and 6 together), including the two properties that matter most: a tenant-isolation leak in the *backup itself* is rejected, and — proven, not assumed — a pre-existing live target is confirmed byte-for-byte untouched when that rejection happens. Same FK-constraint lesson from Phase 4 recurred a third time, this time in the leak test's own setup (a leaked student row needs its own `schools` row to even insert) — a small thing, but the third recurrence is itself worth noting: this constraint is proving to be a reliable, repeat teacher of "simulate the realistic failure, not the shortcut."

**Known gap, stated plainly:** "verify schema-version compatibility" from §13 item 1 is only partially implemented — `openDrsFile` checks `drsFormatVersion` against what this build supports, but there is no real schema-migration-head comparison yet, because the local SQLite side has no migration ledger of its own to check against (that's future work, not invented here to look more complete than it is).
- **Objective:** close the "largest gap" from §13 — this is more valuable than any other single item in this roadmap, because right now zero backups (of any kind, anywhere in DRAIS) are provably restorable.
- **Risk:** MEDIUM-HIGH (must never overwrite a live local database in place — restore-to-new-file-then-swap only, which SQLite's single-file nature makes simpler than the local-MySQL design's restore-to-new-instance approach would have been).
- **Completion:** DR Scenario 2 (§14) passes end-to-end on a real machine: corrupt/delete the local SQLite file, restore from the latest verified `.drs`, resume operation.

### Phase 7 — Repository layer expansion: cover the tables offline operation actually needs
**Added 2026-08-19, in response to a direct question: "after all these phases, will we actually reach true offline capability?"** Checking that question honestly surfaced a real hole in this roadmap, not a hypothetical one — the original Phase 8 below said "verify (not build — mostly already works)", written on the strength of §2.4/§2.5's finding that attendance/DRCE are engine-agnostic. That finding was true of the *pre-existing local-MySQL* architecture (ADR-0010), which already had every table locally by construction. It does **not** carry over to the new SQLite repo layer, which — as of Phase 4 — covers exactly **2 of the ~258 live school-scoped tables** (`schools`, `students`). Nothing before this phase built the rest, and no phase in the original list owned doing so. Without this phase, Phase 8 quietly can't be true: there is no local attendance table, no local results table, no local report-card/snapshot table for it to verify anything against.
- **Objective:** bring `@drais/repo-contract`/`repo-mysql`/`repo-sqlite` up to the ~30-table scope §9's local data contract actually specifies, prioritized by what the brief's own SUCCESS CONDITION names first — attendance and academic results and report cards, *then* staff/HR, *then* fees (§9 already flags fee transactions as its own careful SYNCABLE case, not a fast-follow). Each table domain should be its own sub-effort with its own tests, not one undifferentiated push — Phase 4 already proved that each new table surfaces its own mysql2-serialization surprises (Date objects, BigInt-as-string, unexpected NULLs on columns the idealized schema assumed were always populated). Budget for that pattern recurring, not as a one-time cost already paid.
- **Dependency:** Phase 3/4's pattern (contract → mysql impl → sqlite impl → tests, verified against real production data before trusting it).
- **Risk:** **This is realistically the single largest remaining body of work in this roadmap** — larger than any individually-numbered phase before or after it, even though it's one phase number. Say so plainly rather than let it hide inside a phase titled "hardening."
- **Completion:** every table `src/lib/attendance/*` and the DRCE/snapshot rendering path actually touch for a normal school day exists in `repo-sqlite` with the same test rigor as Phases 3-4 (real-data verification, not just synthetic fixtures) — at minimum: `attendance_raw_events`, `attendance_records`, `enrollments`, `people` (students currently has no name without it), `report_snapshots`, plus whatever DRCE's render path reads. Also owns the `db-mode.ts` three-way-mode wiring decision 5 (§27) requires — table coverage without a way to actually select "local SQLite" at runtime doesn't reach an app anyone can run.

**🟡 Sub-effort 1 of several — `people` + the core attendance pair — done (2026-08-20).** `people` (students have no name without it), `attendance_raw_events` (append-only, source ENUM widened to match the live-ALTERed set, not the original migration file's narrower one), `attendance_records` (upsert on the real `uk_person_day` key, not create/update). `attendance_raw_events.create()` is idempotent by design — resolves a duplicate rather than throwing, matching `recordRawEvent()`'s real `INSERT IGNORE` semantics, a deliberately different contract from `StudentRepo`'s throw-on-duplicate-`admission_no`.

Deliberately **not** added in this pass: a `students.person_id → people.id` foreign key, even though the real DDL has one — Phase 3/4's already-shipped, already-passing tests seed students with synthetic `personId` values and no real `people` row behind them; adding the FK now would break 40+ passing tests as a side effect of an unrelated table addition. Recorded as real, deferred debt (fix the Phase 3/4 fixtures first, then add the FK) rather than silently skipped.

**A fourth and fifth real bug, both from the identical root cause already named after Phase 4** — same lesson recurring exactly as §21's Phase 4 entry warned it would:
1. Own mistake, self-caught before it reached any test: wrote `` `students` `` (markdown-style backticks) inside a SQL comment that lives *inside* a JS template literal (`SCHEMA_SQL`) — a literal backtick there terminates the outer string early, corrupting every line of SQL after it. Not a subtle bug; `esbuild` refused to even parse the file. Caught immediately, fixed immediately — recorded because it's a real category of mistake ("don't use markdown syntax inside a template-literal SQL block") worth remembering for the next table added here.
2. Real production-data bug: `attendance_records.attendance_date` is a `DATE` column — `mysql2` returns it as a JS `Date` object, exactly like every other DATE/DATETIME/TIMESTAMP column already documented in `src/lib/repo/mysql/util.ts`'s header. `toRecord()` passed it through unconverted. A verification script using the wrong string-conversion of that same `Date` object masked the first symptom (looked like a query mismatch); tracing it back to the raw value (`instanceof Date: true`) found the real bug in the repo code itself, not just the script. Fixed with `toIsoDate()`, matching `admission_date`/`date_of_birth`'s existing pattern.

Verified against real production data (read-only): a real person (`kalungi hamuza`, id 392001), a real `zkteco_push` attendance event, and — after the DATE-object fix — a real `attendance_records` row (school 12004, status `weekend`) all round-trip correctly through the repo layer. 53/53 tests green across the whole V2 test suite (`test:repo`, `test:provisioning`, `test:container`) after this sub-effort.

**🟡 Sub-effort 2 of several — `classes` + `class_results` — done (2026-08-20).** Started as "academic results + report cards," and immediately revealed itself to be a much larger domain than attendance was: `src/lib/snapshots/queries.ts`'s real snapshot-generation query joins `class_results` against `classes`, `subjects`, `class_subjects`, `staff`, `departments`, `subject_groups`, and `terms` — not one or two tables, closer to eight. Scoped this increment down deliberately to the minimum that's both real and necessary: `classes` (as the tenant-isolation anchor — see next) and `class_results` (the actual marks-entry table, the brief's own named "enter academic results" workflow, and one of §7's explicitly flagged HIGH-conflict-risk tables — `MANUAL_REVIEW` is its recorded conflict policy, unimplemented here since conflict resolution is sync's job, not this layer's).

**Genuinely new finding, not a repeat of a prior lesson:** `class_results` has **no `school_id` column at all** — confirmed via a live `information_schema` query, not any of the several conflicting historical per-school SQL dump files this repo happens to have for it (none of which agree with each other or with production). Every real query in this codebase scopes it via `JOIN classes c ON c.id = cr.class_id WHERE c.school_id = ?` (`src/lib/nexus/tools.ts:195-198`) — so `classes` had to exist locally first, or `class_results` could not be safely tenant-scoped at all. This repo layer mirrors that join exactly, in both engines, and a test exercises it directly: a result belonging to a *different* school's class is proven unfindable under the wrong `schoolId`, not merely assumed safe from reading the SQL.

Also new: `classes` and `class_results` both carry a richer soft-delete/restore audit trail (`deleted_by`, `delete_reason`, `restored_at`, `restored_by`) than the plain `deleted_at` used everywhere else in this repo layer so far — DRAIS already has a real Trash/restore system online (`docs/PHASE_1_CRUD_TRASH_ARCHITECTURE.md`) these tables plug into; `softDelete()` now takes optional `{deletedBy, deleteReason}`, and a new `restore()` method exists on both repos, matching that system's shape rather than a simpler invented one.

Clean pass this time — no bugs found building it, and real-data verification (school 8002's `BABY CLASS`, a real `class_results` row scoring 98) succeeded on the first attempt, including confirming `score` (a `DECIMAL(5,2)` column) needed the same `bigNumberStrings`-driven string→number conversion already discovered for BIGINT columns in Phase 7 sub-effort 1 — applied proactively this time instead of found the hard way. 62/62 tests green across the whole V2 suite after this sub-effort.

**🟡 Sub-effort 3 of several — `staff` — done (2026-08-20).** Next in the stated priority order ("then staff/HR"), and needed for report-card teacher-name resolution regardless. Real schema confirmed live, 30 columns, two genuine surprises:

1. **Deliberate security-driven scope cut, not an oversight.** The real `staff` table also carries `salary DECIMAL(14,2)`, `bank_name`, `bank_account_no`, `nssf_no`, `tin_no` — real payroll/financial PII. §15 of this document already records that `@drais/repo-sqlite`'s local file is plain `better-sqlite3`, **not** SQLCipher-encrypted at rest — an open, documented gap, not yet closed. Syncing salary and bank-account data into that unencrypted local file today would be a real security regression, not a hypothetical one, so `StaffRecord`/`NewStaffInput` exclude those five columns entirely — they stay cloud-authoritative until repo-sqlite has at-rest encryption. This is the first table in this repo layer where a real column was deliberately left out on security grounds rather than included and merely documented as sensitive.
2. **No `created_at` column at all** — the first table in this repo layer without one (every prior table had both `created_at` and `updated_at`). `updatedAt` is therefore genuinely nullable in the contract, read with plain `toIso()` rather than `toIsoRequired()`'s fallback chain — fabricating a fake timestamp here would misrepresent a genuinely-unknown history as a known one, exactly the failure mode `toIsoRequired`'s own header already warns against.

`staff.first_name`/`last_name`/`first_name_ar`/`last_name_ar` exist on the real table too, redundant with `person_id → people.first_name/last_name` (`person_id` is `NOT NULL` on every real row) — left out of `StaffRecord` deliberately, keeping `people` the single canonical name source for this repo layer, matching how `students` already works. Both `school_id` and `person_id` are `NOT NULL` on `staff` (unlike `classes`/`people`), so `findById`/`create` scope with a plain `WHERE school_id = ?` — no nullable-school_id split like `classes.create()` needed. Added `findByPersonId(schoolId, personId)` alongside the usual shape — the real lookup a report card or a logged-in staff user's own record actually needs, and `person_id` has no DB-level UNIQUE constraint on the real table, so it returns the first non-deleted match rather than assuming exactly one exists. Same richer `deleted_by`/`delete_reason`/`restored_at`/`restored_by` audit trail as `classes`/`class_results`. Since `staff` is a brand-new table here with no pre-existing tests assuming a looser shape, its SQLite schema carries real `FOREIGN KEY`s to both `schools(id)` and `people(id)` — unlike `students.person_id`, which still deliberately doesn't (§ above).

Clean pass — no bugs found building it. Real-data verification (read-only, school 1's staff id 10, a Mathematics Teacher) confirmed: `experience_years` (a plain `INT`) round-trips as a real number without needing `toNum`'s BIGINT-string handling; `hire_date` NULL on this row resolves to `null`, not a stringified artifact; `updated_at` normalizes correctly with no `created_at` fallback in play; the record genuinely has no `salary`/`bankAccountNo`/`createdAt` keys at all, confirmed with `'key' in record` checks, not just by review; `findByPersonId` round-trips to the same row `findById` returns; `listBySchool` correctly returns only that school's staff. 69/69 tests green across the whole V2 suite (`test:repo` 50, `test:provisioning` 5, `test:container` 14) after this sub-effort.

**🟡 Sub-effort 4 of several — `subjects` + `terms` + `academic_years` — done (2026-08-20).** The three reference tables `class_results` already points at via `subjectId`/`termId`/`academicYearId` (sub-effort 2) but that didn't exist locally yet — without them those ids were floating integers with no record behind them. Real schemas confirmed live for all three (plus `departments`, `subject_groups`, `class_subjects`, `enrollments`, inspected in the same pass and scoped out — see below). `subjects.academic_type` reuses the existing `AcademicType` type from sub-effort 2 (`secular`/`theology`) — the same real-world distinction, not a coincidence.

**A third, genuinely new "missing timestamp" shape.** Sub-effort 3 found `staff` missing `created_at` only. `academic_years` goes further: **neither `created_at` nor `updated_at` exists on the real table at all** — the first table in this repo layer missing both. `AcademicYearRecord` has no timestamp fields whatsoever, not nullable ones; a test asserts `'createdAt' in record` and `'updatedAt' in record` are both `false`, not just that the values are absent.

`terms.is_active` is `TINYINT(1)` — normalized to a real `boolean | null` with the same `Boolean()` pattern already used for `attendance_raw_events.matched`, not left as a raw 0/1. `terms.id` is a plain `INT`, not `BIGINT` like almost every other id in this codebase — harmless (`toNum()` accepts either shape) but noted, since `bigNumberStrings:true` only affects `BIGINT`/`DECIMAL`, not `INT` — this column may already arrive from mysql2 as a real number rather than a string, unlike every sibling id column. Added `TermRepo.listByAcademicYear()` alongside the usual CRUD shape — a real, distinct lookup ("which terms make up this year") a term-picker/report-card UI needs.

**Deliberately scoped OUT of this sub-effort, real tables inspected but not built:** `departments` and `subject_groups` (org-structure tables `staff.department_id`/`subjects.department_id`/`subjects.subject_group_id` point at, but neither is required to make marks-entry/report-cards work — `class_results` doesn't reference either directly); `class_subjects` (the class↔subject↔teacher allocation table — real, needed for "which subjects does this class take," but structurally more complex: self-referencing `superseded_by`, `allocation_role`, `contribution_weight` — deserves its own reviewed sub-effort, not a bundled add-on); `enrollments` (references several tables that don't exist locally at all yet — `stream_id`, `study_mode_id`, plus `curriculum_id`/`program_id` which only exist as plain nullable ints on `classes` today, not first-class tables — a materially bigger sub-effort on its own). None of these four block `class_results`/report-card generation working end-to-end at the SQLite level; scoping them out here keeps this sub-effort reviewable, matching the discipline every prior sub-effort in Phase 7 has followed.

Clean pass — no bugs found building it. Real-data verification (read-only) confirmed all three: a real `theology`-type subject (`Hadith Studies`, school 1) round-trips correctly, including the reused `AcademicType`; a real `terms` row (school 6, `Term 1`, `is_active` genuinely `1` in the source) normalizes to `isActive: true` as an actual boolean; a real `academic_years` row (school 6, `"2025"`) confirmed to have neither `createdAt` nor `updatedAt` keys at all via direct property checks, not just review; and — a genuine cross-table integrity check, not just per-table round-tripping — that same term's `academicYearId` (`12001`) correctly resolves 3 real terms back out through `listByAcademicYear(schoolId, 12001)`. 81/81 tests green across the whole V2 suite (`test:repo` 62, `test:provisioning` 5, `test:container` 14) after this sub-effort.

**🟡 Sub-effort 5 of several — the `db-mode.ts` three-way-mode wiring — done (2026-08-21).** Not a new table this time — the other half of Phase 7's completion bar (§25, above): "table coverage without a way to actually select 'local SQLite' at runtime doesn't reach an app anyone can run." Before this, `DbMode` (`src/lib/db/db-mode.ts`) had exactly the two values it had before DRAIS V2 existed — `'online' | 'local'`, where `'local'` meant local MySQL (ADR-0010) — and nothing anywhere resolved a `Repos` based on it. `repo-sqlite/connection.ts`'s own header already named the gap precisely: "a future integration point (not built here) would have db-mode.ts hand a SQLite path to this module."

**What changed, and — deliberately — what didn't.** `DbMode` is now `'online' | 'local-mysql' | 'local-sqlite'` (a mechanical rename of `'local'`→`'local-mysql'` across `db-mode.ts`, `pools.ts`, `db.ts`, `runtime-config.ts`, `DbModeBadge.tsx`, and the `/api/db-mode` and `/api/admin/db-config/test` routes, preserving `'local'` as a backward-compatible env-var synonym so an existing desktop install's already-persisted `DRAIS_DB_MODE=local` config file keeps meaning exactly what it always meant on next boot — not a silent behavior change for anyone already on local-mysql). A new `src/lib/repo/resolve.ts` exports `getActiveRepos()`: `local-sqlite` → `createSqliteRepos()` against a new long-lived singleton connection (`repo/sqlite/singleton.ts`, mirroring `pools.ts`'s own one-pool-per-mode pattern, defaulting to `~/.drais/local.sqlite`, same `~/.drais/` convention `runtime-config.ts` already established); everything else → the existing `createMysqlRepos()`, untouched.

**What deliberately did NOT change: `src/lib/db.ts`'s `query()` — the ~435-call-site function every existing page still uses — gained no SQLite path, and the `/api/db-mode` switch UI/API still only accept `online`/`local-mysql`.** This was a real, considered decision, not an oversight: `query()` takes raw MySQL-flavored SQL strings (`UTC_TIMESTAMP()`, the `LIMIT ?` text-protocol workaround, etc.) that don't translate to SQLite, and none of the ~435 call sites have been migrated to the `Repos` abstraction — that migration is Phase 8+'s job, not something to retrofit as a side effect of wiring a mode selector. Exposing `local-sqlite` as switchable today, before that migration exists, would let a user flip the switch and then hit literally every existing page with a broken database connection — exactly the "destabilize the existing production system" outcome this whole roadmap exists to avoid. So `local-sqlite` is real and working (proven by an end-to-end test — create a school, find it, through the actual resolver → singleton → repo-sqlite pipeline, not a mock), but reachable only by code deliberately written against `Repos`/`getActiveRepos()`, which nothing existing does yet. That's the honest, current shape of "can DRAIS run fully offline with no MySQL server at all": the plumbing exists and is tested; no page is plugged into it.

**Safety-in-depth, not just a rename.** `pools.ts` gained `assertMysqlMode()` — if `'local-sqlite'` ever reached this mysql2-only module (only possible via hand-edited env/config, since nothing in the running app can select it), every entry point throws a specific, actionable error rather than silently falling through to the online TiDB config (the `mode === 'local-mysql' ? … : …` pattern every function here uses would otherwise do exactly that, since `'local-sqlite' !== 'local-mysql'` — a real bug shape, caught by review before it shipped, not found by a test after). `healthCheck()`'s own "never throws" doc-comment was nearly violated by the first draft of this guard (`configFor()` throwing before the `try` block) — caught and fixed in the same pass, `cfg` now captured inside the `try` so the function's existing contract holds for every `DbMode` value, not only the two it used to be called with.

Real-data verification here meant something different from every prior sub-effort — no new table, so the equivalent rigor was: exhaustively testing `getDbMode()`'s env-driven resolution (six cases, including the `local`→`local-mysql` backward-compat mapping and the hosted-forces-online override), and one true end-to-end test proving `getActiveRepos()` in `local-sqlite` mode is a genuinely working `Repos`, not just type-correct. Then the wider blast-radius check this kind of cross-cutting change actually demands: the full existing `test:sentinel` (26/26) and `test:attendance` (288/288) suites — pre-existing V1 tests wholly unrelated to this session's work — re-run and green, confirming nothing about online/local-mysql behavior regressed for the ~435 call sites deliberately left untouched. 93/93 tests green across the whole V2 suite (`test:repo` 68 — includes 6 new db-mode tests, `test:provisioning` 5, `test:container` 14) plus the two V1 suites above, after this sub-effort.

**🟡 Sub-effort 6 of several — `users`, `roles`, `user_roles`, `role_permissions`, `permissions` — the offline-authentication data layer — done (2026-08-21).** Not the next item on a pre-set priority list — a real finding, surfaced while scoping how offline routes would actually get built (§25 below, "additive per-route wiring"): `src/lib/auth.ts`'s `getSessionSchoolId()`, the function **every protected API route calls first**, reads `sessions`/`users`/`staff`/`schools`/`roles`/`user_roles` via raw `query()` with zero SQLite path. No offline route, however well built, is reachable until a user can authenticate without internet — login is the actual prerequisite gate, not whichever feature page comes first in priority order.

Real schemas confirmed live for `users` (43 columns), `roles`, `user_roles`, `role_permissions`, `permissions`, plus a read of the real `src/app/api/auth/login/route.ts` to understand exactly what a login attempt actually does today (bcrypt compare, brute-force lockout anchored on `users.failed_login_attempts`/`locked_until`, subscription/school-status checks, session-token creation, role/permission resolution via `user_roles` → `role_permissions` → `permissions`).

**Security scope cut, same reasoning as `staff`'s salary/bank exclusion:** `users` really has `password_reset_token`, `verification_token`, `email_verification_token` (ephemeral, email-flow-only — meaningless without network anyway), `passcode_hash` (not proven needed — the actual login flow read only ever checks `password_hash`), `two_factor_secret`, `biometric_key` (raw, NOT one-way-hashed secret/key material — genuinely sensitive, same category as `staff.bank_account_no`). All six excluded from `UserRecord`. `password_hash` itself **is** included — a one-way bcrypt hash (confirmed live: real hashes are 60 characters, the standard bcrypt length) is exactly the kind of secret safe to store even unencrypted at rest, and offline password verification is impossible without it.

**Two genuinely new shapes in this repo layer:** `permissions` and `role_permissions` are the first **global, non-tenant** tables here — confirmed live, no `school_id` column on either. And `role_permissions` has **no index or primary key at all** on the real table (confirmed via a live `information_schema.STATISTICS` query, not assumed) — the mysql repo's first `grant()` draft used `ON DUPLICATE KEY UPDATE`, which would have silently inserted a duplicate row every time (no key exists to violate), caught in review and replaced with an explicit `WHERE NOT EXISTS` guard for real idempotency. The local SQLite schema adds a real `UNIQUE(role_id, permission_id)` constraint anyway — safe to do on a fresh local copy even though the source lacks it.

**A noted, deliberate design difference, not an oversight:** the real online login route looks up a user by email **globally** (`WHERE u.email = ? AND u.deleted_at IS NULL`, no `school_id` at all) — it discovers which school the user belongs to *from* the result. `UserRepo.findByEmail(schoolId, email)` still takes `schoolId` first, consistent with every other method in this repo layer, because a local SQLite install holds exactly one school (§9) and always knows its own `school_id` upfront — it isn't discovering "which school," it already knows.

**This sub-effort deliberately does NOT touch `auth.ts`, the login route, or any live session-validation code.** It builds the data layer a real offline-login route would need; it does not build that route. Real, open policy questions the actual login route would need answered first — product decisions, not something to invent unilaterally here:
- Should offline login skip the subscription/school-status checks the online route enforces (`getSubscriptionInfo()`), given a local install can't reach the billing system to verify status — or should provisioning itself refuse to provision a school with a lapsed subscription, pushing the check earlier instead of removing it?
- Should the brute-force lockout state (`users.failed_login_attempts`/`locked_until`) apply offline the same way, given a stolen laptop with no lockout is a real local attack surface?
- Should a failed/successful offline login still call `logAudit()` (currently DB-backed, online-only) — silently skipped, queued for sync later, or written to a local-only audit table?
- Where do local sessions actually live — the `sessions` table copied via provisioning (data that's stale the moment it's copied, since sessions are ephemeral), or a **new, local-only session created at the moment of offline login** (the architecturally correct answer, not yet built)?

Real-data verification (read-only) confirmed all of the above against production: a real admin user's `password_hash` round-trips as a genuine 60-char bcrypt hash with none of the six excluded secret fields present (checked via `'key' in record`, not review); `findByEmail` round-trips to the same row `findById` returns; the global 190-row `permissions` catalog resolves correctly via both `listAll()` and `findByCode()`; and one real role row had a NULL `created_at`, correctly falling back to the existing sentinel timestamp — confirming `toIsoRequired`'s established fallback chain engages correctly on real data it wasn't specifically built for, not just the tables that motivated it. One data observation recorded here originally turned out to be wrong, not a real quirk — corrected below rather than left standing: this entry first claimed the seed admin user (id 1, school 1) had **zero** `user_roles` rows, attributed to "some other, older mechanism." **That was this repo layer's own bug, not a fact about the data.** `listByUser(schoolId, userId)` filtered `school_id = ?` exactly; sub-effort 9 (below) found the real online super-admin check treats a NULL `user_roles.school_id` as a platform-wide grant (`ur.school_id = s.school_id OR ur.school_id IS NULL`) — and a live query confirms user 1 has exactly two active `user_roles` rows, both with `school_id: NULL`. The exact-match filter was silently excluding them. Fixed in sub-effort 9, in both engines. 97/97 tests green across the whole V2 suite (`test:repo` 78, `test:provisioning` 5, `test:container` 14) after this sub-effort — unaffected by the later fix, since no test here exercised a NULL-`school_id` grant.

**Remaining for Phase 7, not started:** `enrollments`, `departments`/`subject_groups`/`class_subjects` (scoped out of sub-effort 4, real reasons recorded there), `report_snapshots` + DRCE's render-path reads, fee tables (last, per the stated priority order), the salary/bank-account fields deliberately deferred from `staff` (sub-effort 3) and the secret fields deferred from `users` (sub-effort 6, both revisit once repo-sqlite has SQLCipher-backed at-rest encryption), the `sessions` table's local-session-creation design (open question above), and — the actual offline login route/`getSessionSchoolId()` additive branch, once the open policy questions above are answered.

**🟡 Sub-effort 7 of several — carried subscription state + offline access evaluation — done (2026-08-21).** Directly answers a real gap sub-effort 6 surfaced but left open: the online login route enforces subscription/school-status access (`getSubscriptionInfo()`) with a live query — how should that work with no network? Put to the user directly; their answer, verbatim, is the confirmed design: **"the first time a school is given offline part of db the subscription is carried with them."** I.e., subscription state is copied into the local file at provisioning time, like every other piece of school data, and evaluated locally against that carried snapshot from then on — necessarily as fresh as the last provision/sync, same staleness tradeoff any offline system accepts.

Two other policy questions from the same round were also confirmed, recorded here for whoever builds the actual login route next: **brute-force lockout applies offline identically to online** (same `users.failed_login_attempts`/`locked_until` fields sub-effort 6 already carries — arguably more important offline, since a stolen device has no network-based defenses at all); **audit logging writes to a local table and syncs later**, rather than being silently skipped (not yet built — this sub-effort didn't reach it; recorded as remaining work below).

**Real, separate gap closed as a prerequisite:** `SchoolRecord` (Phase 3's very first table) never captured `subscription_status`/`subscription_plan`/`subscription_type`/`trial_start_date`/`trial_end_date`/`subscription_start_date`/`subscription_end_date` at all — Phase 3 predates any subscription-awareness in this effort. Also added the richer `deleted_by`/`delete_reason`/`restored_at`/`restored_by` audit trail `schools` genuinely has (confirmed live) but Phase 3 never captured either. Purely additive — new fields on an existing type, contract/mysql/sqlite/`seedSchool()` all extended together, nothing existing broken (84/84 `test:repo` still green immediately after).

**A real bug, caught by actually running the test, not assumed:** the first draft evaluated offline access by reusing `src/lib/subscription.ts`'s `classifyPlan()` — already pure, tempting to import rather than duplicate. Its own test caught that `classifyPlan()` **fails OPEN** for a school with every subscription field null (`expired: false` — no field to compare against `now`, so nothing trips the expiry check). That's correct for `classifyPlan()`'s real purpose (labeling an already-fetched, always-real row for a platform dashboard) but wrong for an access *gate*, where "we genuinely don't know this school's subscription state" must mean no access. Online's real access rule lives inline inside `getSubscriptionInfo()` (`hasAccess = status === 'active' || status === 'trial'`, plus auto-expiry-by-date), which isn't factored out as an importable pure function and is not itself pure (queries + writes). Rather than touch that live file to extract one — §25a's rule — `src/lib/repo/offline-auth/subscription.ts`'s `evaluateOfflineSubscriptionAccess()` mirrors that exact rule as new, independently-tested, deliberately-duplicated logic instead.

Real-data verification (read-only, 8 real schools) found a genuinely meaningful case, not just clean round-trips: school 7's carried snapshot has `subscriptionStatus: 'trial'` but a `trialEndDate` of 2026-04-20 — already passed relative to today (2026-08-21). The offline evaluator correctly caught this stale-status-vs-real-date mismatch (`effectiveStatus: 'expired'`, `hasAccess: false`), exactly matching what online's own auto-expiry logic would do to the same row. A real paying school (8002, `AL-BAYAN`) with an active subscription through 2027 correctly evaluated as having access. 90/90 tests green across the whole V2 suite (`test:repo` 84, `test:provisioning` 5, plus `test:container` unaffected/unre-run this sub-effort — no container-layer changes) after this sub-effort.

**Remaining, not built in this sub-effort:** the local audit table for offline login events (confirmed design: write locally, sync later); an offline mirror of the lockout-check logic (`login-lockout.ts`'s `getLockState`/`registerFailedAttempt`/`clearFailedAttempts`, confirmed to apply identically — the data already exists via `users.failed_login_attempts`/`locked_until`, sub-effort 6, but the evaluation functions themselves aren't written yet); and the actual additive branches in `getSessionSchoolId()` and the login route (§25a's `if (mode === 'local-sqlite') { ... }` pattern) that would call all of this. This sub-effort built the pieces those branches will call; it doesn't wire them in yet.

**🟡 Sub-effort 8 of several — the complete offline login flow — done (2026-08-21).** Closes out every "remaining, not built" item sub-efforts 6-7 left open: `src/lib/repo/offline-auth/login.ts`'s `attemptOfflineLogin()` is now a genuinely complete, working, independently-tested offline login flow — findByEmail, lockout, bcrypt password check, carried-subscription access, local session creation, local audit trail — mirroring `src/app/api/auth/login/route.ts`'s real ordering and disclosure discipline (a locked account and a wrong password return the exact same generic code; no user enumeration).

**A real gap in sub-effort 6's own design, caught while building this:** `UserRepo.update()`/`NewUserInput` never included `failedLoginAttempts`/`lockedUntil`/`lastFailedLoginAt`/`lastLoginAt` — deliberately, since a normal create/update caller should never set login-bookkeeping fields directly, but that meant there was no way to *write* them at all. Added three dedicated methods (`recordFailedLogin`, `clearLoginLockout`, `recordSuccessfulLogin`) mirroring `login-lockout.ts`'s own three `UPDATE` shapes exactly, in both engines.

**Reuse judged correctly this time, not assumed:** `throttleDecision()` (`src/lib/control/login-guard.ts`) — the backoff formula behind lockout — is genuinely pure (no DB, no implicit "always a real row" assumption, just arithmetic on the numbers it's given) and is imported directly into `offline-auth/lockout.ts`, unlike sub-effort 7's `classifyPlan()` mistake. Its own test (`registerOfflineFailedAttempt` crossing the real threshold, producing a real cooldown) exercises it end-to-end rather than trusting the "pure and unit-tested" doc comment on faith — the exact discipline the `classifyPlan` mistake was caught by, applied proactively here instead of after the fact.

**Two new pieces of genuinely local-only state, neither fitting the contract/mysql/sqlite `Repos` pattern** (that pattern is for the *same* logical entity backed by either engine; these have no online counterpart to mirror):
- `offline_audit_log` — a new SQLite-only table. Confirmed design: writes locally, syncs later. Shaped to match `src/lib/audit.ts`'s own `AuditEntry` field-for-field, so a future sync pass can map a row here onto a real `logAudit()` call with zero translation. Standalone schema-ensure + append/list/mark-synced functions, matching the precedent already set by `src/lib/sentinel/schema.ts`/`src/lib/backup/schema.ts` for local-only SQLite state outside this repo layer.
- `sessions` — also new, and deliberately **not** a copy of the real online `sessions` table (whose columns were already confirmed live in sub-effort 6's recon). A provisioned copy of session rows would be stale the instant it's copied — sessions are ephemeral per-login artifacts, not stable reference data. This table is populated only by an actual local login happening on the install; token generation and default 7-day expiry mirror the real login route's own `generateSessionToken()`/`SESSION_CONFIG` exactly, so a locally-created session has the same shape and lifetime properties as an online one.

The same esbuild-breaking backtick-in-SQL-comment mistake (markdown-style backticks inside a `-- comment` living inside the `SCHEMA_SQL` JS template literal) recurred a **third** time this session, on the new `sessions` table's own header comment — caught immediately by the same test-run failure as the first two times, fixed the same way, and this time followed by a proactive sweep of the whole template literal for any other stray backtick before moving on, rather than waiting for the next one to be found by accident.

Test coverage is deliberately adversarial, not just happy-path: the lockout suite proves a real cooldown fires exactly at the threshold, that an elapsed cooldown correctly reads as unlocked (not stuck forever), and that a failure outside the 15-minute window resets the count rather than accumulating it. The end-to-end login suite proves a locked account returns the *identical* generic failure code as a wrong password (never a distinct "locked" signal — the same non-enumeration discipline the online route documents), that a non-existent email is indistinguishable from a wrong password, and — the actual point of sub-effort 7 finally exercised end-to-end — that a school with a lapsed carried subscription snapshot refuses every login regardless of which account attempts it. 122/122 tests green across the whole V2 suite (`test:repo` 103, `test:provisioning` 5, `test:container` 14) after this sub-effort.

**Still deliberately not done:** `attemptOfflineLogin()` is not called from anywhere live. `src/lib/auth.ts`'s `getSessionSchoolId()` and the real login route have not been touched — no `if (mode === 'local-sqlite')` branch exists yet in either. Every piece a future branch would call now exists and is tested; wiring the branch itself is the next, separate, deliberately-not-yet-taken step (crossing from "new code nothing can reach" to "a live file gains its first mode check" is a meaningful threshold in its own right, per §25a).

**🟡 Sub-effort 9 of several — offline session validation — done (2026-08-22).** The counterpart to `src/lib/auth.ts`'s `getSessionSchoolId()` — the function every protected route calls, and the one that makes a session created by sub-effort 8's `attemptOfflineLogin()` actually usable on the *next* request, not just valid at the instant of login. `src/lib/repo/offline-auth/session-validate.ts`'s `validateOfflineSession()` resolves the same `SessionInfo` shape (userId, schoolId, email, name, `isSuperAdmin`, `staffId`, `mustChangePassword`) against local data, with the same enforcement online applies on *every* request, not only at login: a school that goes suspended, or a carried subscription snapshot that lapses, mid-session invalidates that session on its very next use — proven with a test that validates a session successfully, changes the school's state, then validates the same still-"active" session token again and confirms it now fails.

**A real gap caught before this file was built on top of it, not after:** `UserRoleRepo.listByUser()` (sub-effort 6) required an exact `school_id` match. The real online super-admin check (`src/lib/auth.ts:75-79`) treats a NULL `user_roles.school_id` as a platform-wide grant — `ur.school_id = s.school_id OR ur.school_id IS NULL` — and a plain `=` silently excludes it. Fixed in both engines before writing the super-admin resolution logic that depends on it, rather than replicating the gap into new code.

**This fix also corrects a wrong claim sub-effort 6 recorded as fact**, not a new bug. Sub-effort 6 reported the seed admin user (id 1) had "zero `user_roles` rows... some other, older mechanism" — an observation made using the buggy exact-match query. A live check after this fix shows user 1 actually has two active `user_roles` rows, both with `school_id: NULL` — real platform-wide grants the old query was silently dropping. Corrected in place above rather than left standing; a repo-layer bug that happened to look like a data quirk isn't the same thing as a real one, and the difference matters for anyone reading that entry later.

Real-data verification (read-only) confirmed the fix directly: user 1's two NULL-`school_id` grants are now found by `listByUser(schoolId, 1)` regardless of which school's context it's queried from (the whole point of a platform-wide grant). Test coverage separately locks in the online query's exact SQL NULL-comparison semantics — a role with `is_active` left `NULL` does **not** count as active (mirrors `r.is_active = TRUE` excluding `NULL` in SQL, not a JS-style "unset means default true" reading) — caught by a test fixture that initially omitted `isActive: true` and failed for exactly the right reason, not the wrong one. 113/113 tests green across the whole V2 suite (`test:repo` 113 — up from 103, includes 10 new session-validation tests — `test:provisioning` and `test:container` unaffected/not re-run this sub-effort, no changes in that surface) after this sub-effort.

**Still deliberately not done, same as sub-effort 8:** nothing live calls `validateOfflineSession()` either. `getSessionSchoolId()` itself is still completely untouched. Every piece its future `if (mode === 'local-sqlite')` branch would call — login (sub-effort 8) and session validation (this sub-effort) — now exists and is tested. Wiring that branch into the two live files (`auth.ts`, the login route) is the next, and last, step before offline login is reachable from anywhere real — and per the user's own framing, deserves walking through the exact planned change together before it lands, since it's the first time this effort adds anything at all to a file the live app depends on.

**🟢 Sub-effort 10 of several — offline login actually wired in — done (2026-08-22).** The first time this entire effort touched a file the live app depends on. Two files, one small additive block each — `src/lib/auth.ts`'s `getSessionSchoolId()` and `src/app/api/auth/login/route.ts`'s `POST()` — both gated behind `if (getDbMode() === 'local-sqlite') { ... }`, both falling through to the exact, byte-for-byte original code otherwise. The diff to each file is an import line plus roughly a dozen lines; nothing below either block was touched.

**The offline branch uses a *dynamic* `import()`, not a static one — a deliberate, load-bearing detail, not a style choice.** `auth.ts` is loaded by nearly every API route, including on hosted/serverless deployments where `better-sqlite3` may not even be installed (it's an `optionalDependency` for exactly this reason, since Phase 4). A static import of anything touching `repo-sqlite` would pull that native dependency into every request's module graph regardless of mode — risking the exact "a Vercel build breaks because of an unrelated optional dependency" failure this session already hit once before, this time for a feature online users never asked for. The dynamic import means that code path, and everything it transitively imports, is only ever loaded when a desktop install has actually switched into `local-sqlite` mode.

All new logic lives in one file, `src/lib/repo/offline-auth/route-bridge.ts` — the only thing either live file imports. Its job is narrow: adapt the already-tested, already-inert functions from sub-efforts 6-9 to `NextRequest`/`NextResponse`, and set the same three cookies (`drais_session`, `drais_school_id`, `drais_role`) the online login route and `middleware.ts` already agree on. That last part turned out to matter more than expected: `middleware.ts`'s own comment states plainly that it does no DB work at all — *"Full session validation happens in API routes... optimal for Vercel Edge Runtime which has DB limitations"* — meaning Edge Middleware structurally cannot run `better-sqlite3` even if it wanted to. Route protection for a locally-authenticated user therefore depends entirely on the offline login setting those three cookies correctly; `middleware.ts` itself needed and got zero changes.

**Two real gaps found while building the bridge, both fixed before being built on top of, not after:**
1. **How does the app know its own `school_id`?** Every prior sub-effort asserted "a local install always knows its own school upfront" without ever building the mechanism. Put to the user directly; confirmed answer: query the one row in the local `schools` table rather than maintain a second source of truth in a config file. `src/lib/repo/offline-auth/install.ts`'s `getLocalInstallSchoolId()` does exactly that — and errors loudly, not silently, on either a not-yet-provisioned install (zero schools) or a violated one-school invariant (more than one), rather than guessing.
2. **`drais_role`'s value requires resolved role names**, which neither `attemptOfflineLogin()` nor `SessionInfo` carried. Extracted the shared "walk this user's active role assignments" logic out of `session-validate.ts` into `resolveOfflineUserRoles()`, reused by both the session-info path and the login response — rather than duplicating the walk a second time in the bridge.

Test coverage for the bridge is end-to-end through real `NextRequest`/`NextResponse` objects — as close to what the live routes actually do as a test can get without a running server — not just unit tests of the pieces underneath: a full login round-trip confirms all three cookies are set with the correct values (including the resolved role name), a wrong password and a lapsed subscription return the exact status codes and error shapes the online route's own contract defines (401/`INVALID_CREDENTIALS`, 402/`SUBSCRIPTION_EXPIRED`), and a session token minted by that same login round-trip is confirmed to resolve correctly through `getOfflineSessionInfo()` afterward — proving the two halves (login, then session validation) genuinely connect, not just that each works in isolation.

**Verification for this sub-effort went beyond the usual bar, deliberately, given the stakes:** beyond the full V2 suite, this is the first sub-effort to also re-run large, wholly-unrelated **V1** suites after the change — `test:sentinel` (26/26) and `test:attendance` (288/288) — specifically to catch any regression the live-file edits might have introduced for the ~435 online call sites deliberately left untouched. All green. A direct smoke test also confirmed the online path is unaffected byte-for-byte: `getSessionSchoolId()` called with no cookie under the default (online) mode returns `null` via the original code path, never touching the new branch or loading `better-sqlite3` at all. 144 tests green across the whole V2 suite (`test:repo` 125, `test:provisioning` 5, `test:container` 14), plus 314 V1 tests green (`test:sentinel` 26, `test:attendance` 288) — 458 total — after this sub-effort.

**What this actually means:** for the first time, offline login is reachable — not just built, tested, and sitting inert. A desktop install with `DRAIS_ALLOW_LOCAL=true` and `DRAIS_DB_MODE=local-sqlite` set, and a school provisioned into its local file, can now genuinely log in and hold a session with zero network access, end to end, through the real routes a browser actually calls. What's still missing before that's a complete experience: the mode-switch UI (`DbModeBadge.tsx`/`/api/db-mode`) still refuses `local-sqlite` as a target (§25a note in sub-effort 5 — deliberately, until enough of the app works offline that switching isn't a trap), and only login itself has an offline branch — every other page a logged-in user would actually try to use next (attendance, results, students, report cards) still has none. That's genuinely the next phase of work, not a footnote.

### §25a — Course correction: additive per-route wiring, not migration (2026-08-21)

An explicit, binding correction to how any online route ever gets an offline counterpart, overriding this document's own earlier framing (the "Phase 8+ concern... migrating any real page/route... to the `Repos` abstraction" language that used to close out Phase 7's entry above).

**The rejected approach:** rewriting an existing route's raw `query()` calls to instead call `Repos` methods, on the theory that the repo methods are a drop-in replacement. They are not, provably — no repo method was built by reading and replicating every existing page's exact SQL (joins, computed columns, sort order, pagination); each was built fresh against the schema. Migrating 435 real call sites this way risks silently regressing real, live, online pages serving real schools right now — exactly the outcome every phase of this roadmap exists to avoid. Raised directly by the user, who correctly rejected it before any code was written this way.

**The adopted rule, permanent: do not destabilize a currently working system.** Concretely: every existing online route's code stays byte-for-byte unchanged, forever, unless there's an unrelated reason to touch it. Offline support is added as a new, separate, additive branch — `if (getDbMode() === 'local-sqlite') { return handleOffline(...) } // everything below: untouched` — using new, purpose-built handler code backed by `Repos`/`getActiveRepos()` (`src/lib/repo/resolve.ts`, sub-effort 5). The online branch is never "verified equivalent" to anything, because it's never touched. The new branch is unreachable in production today (nothing can set `local-sqlite` through the app's own UI yet — sub-effort 5's own deliberate gate), so it can be built and tested in complete isolation before it matters, the same "lands inert" discipline already proven across every repo-sqlite file.

Honest tradeoff, not a free lunch: this means real code duplication between the online and offline paths, and any actual business logic (not just a `SELECT`) has to be built twice and can drift out of sync over time. Accepted deliberately — SQLite and MySQL already can't share raw SQL, and protecting the live system outweighs the DRY cost.

Consequence for `createMysqlRepos()`'s actual purpose: it was never meant to replace online pages' `query()` calls (that idea is what just got rejected). Its real job — already how it's used today — is provisioning and future sync: reading TiDB data through a clean, typed interface to copy it elsewhere. That distinction was previously conflated in this document; it no longer is.

### Phase 8 — `.drais` package format
- **Objective:** §11, wrapping Phase 5's `.drs` with branding/templates/device-config.
- **Dependency:** Phase 5, Phase 4 (provisioning contract defines what goes in the package). Does not strictly depend on Phase 7 — packaging is format work, agnostic to how many tables the `.drs` inside it covers — but sequenced after it here because a `.drais` that can't yet hold a school's real data is a demo, not a deliverable.
- **Completion:** DR Scenario 1 (§14) passes: a `.drais` exported from one machine, imported on a fresh install on different hardware, is operational.

### Phase 9 — Offline academic + attendance operation, for real this time
- **Objective:** verify every core workflow end-to-end offline against the SQLite-backed local mode: attendance, results entry, report-card generation/print/export, student management, on a machine with networking physically disabled. This is now genuinely a verification phase, because Phase 7 is what makes there be something real to verify.
- **Risk:** LOW-MEDIUM, *contingent on Phase 7 actually landing first* — without it this phase has nothing to check.
- **Completion:** the brief's own 25-step validation checklist (steps 1-13) passes on real hardware.

### Phase 10 — Sync engine v1 (one-way, cloud → local)
- **Objective:** §12's pull-only direction — reference data + incremental updates, no local→cloud push yet.
- **Dependency:** Phase 4 (provisioning is sync's "full resync" fallback path), Phase 7 (nothing to sync for tables that don't exist locally yet).
- **Risk:** LOW-MEDIUM (read-only from the local side's perspective).
- **Completion:** a local install that's been offline can reconnect and pull changes without a full re-provision.

### Phase 11 — Sync engine v2 (bidirectional, conflict UX)
- **Objective:** §12 in full, including the `MANUAL_REVIEW` UI for results/students/enrollments.
- **Risk:** **HIGH** — explicitly the hardest phase, matching the May audit's own assessment of the equivalent phase. No true rollback once local data is touching this in production.
- **Completion:** DR Scenario 7 (§14) passes under chaos testing (§19); a simulated multi-device conflict is surfaced to an operator and resolved without data loss.

### Phase 12 — Sentinel local-mode coverage
- **Objective:** §17.
- **Dependency:** Phases 5/6 (backup-health observer needs `.drs` to exist), Phase 10 (sync-health observer needs sync to exist).
- **Risk:** LOW.
- **Completion:** `scripts/sentinel/verify-live.mjs`'s pattern runs successfully against a local SQLite-mode instance; new observers appear in `sweep.ts`'s list.

### Phase 13 — Chaos testing
- **Objective:** §19, built incrementally alongside Phases 5-11 rather than saved for the end — each phase should ship its own chaos tests, not defer them.
- **Completion:** the chaos-test matrix in §19 is green in CI.

### Phase 14 — Performance hardening
- **Objective:** §20's measurement matrix, filled in with real numbers, on the real minimal-hardware target chosen in §18.
- **Completion:** targets are met or explicitly renegotiated with evidence, never asserted without measurement.

### Phase 15 — V2 release preparation
- **Objective:** code signing, documentation, training material, the brief's full 25-step validation checklist end-to-end including reconnect/sync/conflict/restore-on-new-machine.
- **Completion:** the brief's own success condition (§ "SUCCESS CONDITION," steps 1-25) is demonstrable, on real hardware, by someone who did not build it.

---

## 26. V1 FINAL vs. V2 — definitions

**DRAIS V1 FINAL** = the current online architecture + Phase 1 (acquisition-backbone completion) + Phase 2 (USB import). Both are scoped, bounded, additive to the existing online product, and don't require any of the local-mode/`.drs`/sync machinery. This matches the brief's own framing: "USB attendance importer... should be evaluated as a final V1 capability." Per the sequencing decision (§27), **this is the work that starts first.**

**DRAIS V2** begins at Phase 3 and is not "done" — per the brief's own explicit instruction — merely because a repo-abstraction layer exists or because Electron boots (it already does), and (added 2026-08-19, after Phase 7 was inserted) **not** merely because `.drs` write/restore work either, if the tables underneath them still only cover 2 of ~258. V2 is earned at the *end* of Phase 11, when: the repo layer actually covers what a school needs day-to-day (Phase 7), local operation is complete and verified against that real coverage (Phase 9), sync is real and bidirectional with conflict handling (Phase 11), `.drs`/`.drais` are protected and restorable (Phases 5-6, 8), Sentinel covers local mode (Phase 12), and the chaos/performance suites (Phases 13-14) are green. Phases 12-15 are hardening on top of an already-true V2, not prerequisites for calling it V2.

**Direct answer to "after all these phases, will we reach true offline capability?" — yes, if Phase 7 is treated as the load-bearing phase it actually is, not skipped past on the way to sync/packaging work that looks more exciting.** Phases 5-6 (this session) prove the *container* works — encrypt, decrypt, restore, tamper-detect. They do not, on their own, prove a school could run its day on the data inside that container, because that data is currently 2 tables. That distinction is the honest answer to the question that prompted this edit.

---

## 27. Decisions recorded (2026-08-18)

Per the brief's own Phase 0 rules and this document's original §5, these four forks could not be resolved from repo evidence alone. They were put to the product owner directly and answered as follows — the roadmap above (§25) and every affected section (§5, §8, §10, §15, §18, §23) reflect these answers, not the document's original recommendations where the two differ.

| # | Decision | Answer | Where it's reflected |
|---|---|---|---|
| 1 | Storage engine for local mode | **SQLite** (overrides this document's local-MySQL recommendation and ADR-0010's existing "Accepted" decision — a new ADR must be written to record the reversal, §5.1) | §5, §8 (repo-abstraction layer), §10 (SQLite payload), §18 (lighter footprint), §25 Phase 3 |
| 2 | Key escrow at provisioning | **Opt-out (escrow by default)** — DRAIS Cloud holds an encrypted recovery key unless a school explicitly declines | §10.4, §15 |
| 3 | Whole-database `db:export:full`/`db:local:init` | **Keep as a gated developer/ops-only tool**, fenced off from any school-facing code path; narrows in role once SQLite provisioning (§25 Phase 4) exists | §5.3, §23 item 3 |
| 4 | Sequencing | **V1-final first** — Phases 1-2 (acquisition backbone, USB import) get real attention before Phase 3 (repo-abstraction layer) begins | §25's phase ordering (unchanged from the original proposal — it already matched this answer) |
| 5 | Fate of local-MySQL (ADR-0010) once SQLite covers what a school needs (2026-08-20) | **Keep both.** Local-MySQL stays available (for a school already relying on it, e.g. an existing XAMPP setup); SQLite becomes the *default* for new local installs once Phase 7 lands. Overrides this document's own recommendation (§27 discussion at the time favored retiring MySQL for the "smaller architecture forever" reason Phase 4's real bugs kept illustrating) — accepted trade-off: two local-storage backends to maintain and test indefinitely, in exchange for not breaking any school already on local-MySQL. | §8, §25 Phase 7 note below |

**Technical consequence of decision 5, not yet built:** `src/lib/db/db-mode.ts`'s `DbMode` type is currently `'online' | 'local'`, where `'local'` means *MySQL* (ADR-0010) — there is no SQLite mode wired in anywhere. Keeping both means this needs to become three real modes, not two — e.g. `'online' | 'local-mysql' | 'local-sqlite'` — with `'local-sqlite'` as the default an install picks when going local for the first time, and `'local-mysql'` preserved exactly as it works today for anyone already on it. `pools.ts`'s existing mode-keyed pool cache (`Map<DbMode, mysql.Pool>`) is MySQL-specific by construction (`mysql.Pool` type) and can't just grow a third key — a `'local-sqlite'` branch needs its own connection-resolution path into `@drais/repo-sqlite`, not a fourth entry in that same map. Real design/implementation work, not a config flag; scope it explicitly as part of Phase 7's wiring rather than assume it falls out for free.

I have **not** started implementation. This document, now updated with the above decisions, is the deliverable for Phases 0/20 of the brief; the roadmap in §25 is the agreed plan, ready to begin at Phase 1 — say the word and I'll start there.
