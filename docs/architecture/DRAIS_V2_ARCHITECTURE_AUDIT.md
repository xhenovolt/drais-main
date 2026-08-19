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

### Phase 4 — School-scoped provisioning
- **Objective:** replace whole-database export/import with the school-scoped contract from §9, writing into SQLite via `@drais/repo-sqlite`.
- **Dependency:** Phase 3 (needs a working `repo-sqlite` to provision into).
- **Files:** new `@drais/provisioning` module reusing `src/lib/backup/discovery.ts`'s table-ownership walk; reads via `@drais/repo-mysql`, writes via `@drais/repo-sqlite`. `db:export:full`/`db:local:init` stay untouched, per §5.3/§23's decision to keep them as separate, gated dev tools rather than repurpose them.
- **Risk:** MEDIUM (first real end-to-end exercise of the new abstraction against live-shaped data).
- **Completion:** a fresh desktop install can be provisioned with exactly one school's data into a SQLite file, verified by row-count/table-scope audit against the source school only — and *only* that school.

### Phase 5 — `.drs` container
- **Objective:** §10, wrapping the SQLite file `@drais/provisioning` produces.
- **Files:** new `@drais/container` module (encryption, checksums, atomic write).
- **Risk:** MEDIUM (cryptographic correctness — use audited libraries, add round-trip property tests before anything else touches this format).
- **Completion:** a `.drs` file can be produced, its header read without the key, its payload decrypted+verified with the key, and a deliberately-corrupted file is rejected with a specific error, never a crash or silent partial read.

### Phase 6 — `.drs` restore automation
- **Objective:** close the "largest gap" from §13 — this is more valuable than any other single item in this roadmap, because right now zero backups (of any kind, anywhere in DRAIS) are provably restorable.
- **Risk:** MEDIUM-HIGH (must never overwrite a live local database in place — restore-to-new-file-then-swap only, which SQLite's single-file nature makes simpler than the local-MySQL design's restore-to-new-instance approach would have been).
- **Completion:** DR Scenario 2 (§14) passes end-to-end on a real machine: corrupt/delete the local SQLite file, restore from the latest verified `.drs`, resume operation.

### Phase 7 — `.drais` package format
- **Objective:** §11, wrapping Phase 5's `.drs` with branding/templates/device-config.
- **Dependency:** Phase 5, Phase 4 (provisioning contract defines what goes in the package).
- **Completion:** DR Scenario 1 (§14) passes: a `.drais` exported from one machine, imported on a fresh install on different hardware, is operational.

### Phase 8 — Offline academic + attendance operation hardening
- **Objective:** verify (not build — mostly already works per §7) every core workflow end-to-end offline against the new SQLite-backed local mode: attendance, results entry, report-card generation/print/export, student management, on a machine with networking physically disabled.
- **Risk:** LOW-MEDIUM — a verification phase, but the first one to exercise the SQLite path specifically (§2.5/§2.4's "already works locally" findings were observed against local MySQL; re-confirm against SQLite, don't assume it transfers).
- **Completion:** the brief's own 25-step validation checklist (steps 1-13) passes on real hardware.

### Phase 9 — Sync engine v1 (one-way, cloud → local)
- **Objective:** §12's pull-only direction — reference data + incremental updates, no local→cloud push yet.
- **Dependency:** Phase 4 (provisioning is sync's "full resync" fallback path).
- **Risk:** LOW-MEDIUM (read-only from the local side's perspective).
- **Completion:** a local install that's been offline can reconnect and pull changes without a full re-provision.

### Phase 10 — Sync engine v2 (bidirectional, conflict UX)
- **Objective:** §12 in full, including the `MANUAL_REVIEW` UI for results/students/enrollments.
- **Risk:** **HIGH** — explicitly the hardest phase, matching the May audit's own assessment of the equivalent phase. No true rollback once local data is touching this in production.
- **Completion:** DR Scenario 7 (§14) passes under chaos testing (§19); a simulated multi-device conflict is surfaced to an operator and resolved without data loss.

### Phase 11 — Sentinel local-mode coverage
- **Objective:** §17.
- **Dependency:** Phases 5/6 (backup-health observer needs `.drs` to exist), Phase 9 (sync-health observer needs sync to exist).
- **Risk:** LOW.
- **Completion:** `scripts/sentinel/verify-live.mjs`'s pattern runs successfully against a local SQLite-mode instance; new observers appear in `sweep.ts`'s list.

### Phase 12 — Chaos testing
- **Objective:** §19, built incrementally alongside Phases 5-10 rather than saved for the end — each phase should ship its own chaos tests, not defer them.
- **Completion:** the chaos-test matrix in §19 is green in CI.

### Phase 13 — Performance hardening
- **Objective:** §20's measurement matrix, filled in with real numbers, on the real minimal-hardware target chosen in §18.
- **Completion:** targets are met or explicitly renegotiated with evidence, never asserted without measurement.

### Phase 14 — V2 release preparation
- **Objective:** code signing, documentation, training material, the brief's full 25-step validation checklist end-to-end including reconnect/sync/conflict/restore-on-new-machine.
- **Completion:** the brief's own success condition (§ "SUCCESS CONDITION," steps 1-25) is demonstrable, on real hardware, by someone who did not build it.

---

## 26. V1 FINAL vs. V2 — definitions

**DRAIS V1 FINAL** = the current online architecture + Phase 1 (acquisition-backbone completion) + Phase 2 (USB import). Both are scoped, bounded, additive to the existing online product, and don't require any of the local-mode/`.drs`/sync machinery. This matches the brief's own framing: "USB attendance importer... should be evaluated as a final V1 capability." Per the sequencing decision (§27), **this is the work that starts first.**

**DRAIS V2** begins at Phase 3 and is not "done" — per the brief's own explicit instruction — merely because a repo-abstraction layer exists or because Electron boots (it already does). V2 is earned at the *end* of Phase 10, when: local operation is complete on SQLite (Phase 8), sync is real and bidirectional with conflict handling (Phase 10), `.drs`/`.drais` are protected and restorable (Phases 5-7), Sentinel covers local mode (Phase 11), and the chaos/performance suites (Phases 12-13) are green. Phases 11-14 are hardening on top of an already-true V2, not prerequisites for calling it V2.

---

## 27. Decisions recorded (2026-08-18)

Per the brief's own Phase 0 rules and this document's original §5, these four forks could not be resolved from repo evidence alone. They were put to the product owner directly and answered as follows — the roadmap above (§25) and every affected section (§5, §8, §10, §15, §18, §23) reflect these answers, not the document's original recommendations where the two differ.

| # | Decision | Answer | Where it's reflected |
|---|---|---|---|
| 1 | Storage engine for local mode | **SQLite** (overrides this document's local-MySQL recommendation and ADR-0010's existing "Accepted" decision — a new ADR must be written to record the reversal, §5.1) | §5, §8 (repo-abstraction layer), §10 (SQLite payload), §18 (lighter footprint), §25 Phase 3 |
| 2 | Key escrow at provisioning | **Opt-out (escrow by default)** — DRAIS Cloud holds an encrypted recovery key unless a school explicitly declines | §10.4, §15 |
| 3 | Whole-database `db:export:full`/`db:local:init` | **Keep as a gated developer/ops-only tool**, fenced off from any school-facing code path; narrows in role once SQLite provisioning (§25 Phase 4) exists | §5.3, §23 item 3 |
| 4 | Sequencing | **V1-final first** — Phases 1-2 (acquisition backbone, USB import) get real attention before Phase 3 (repo-abstraction layer) begins | §25's phase ordering (unchanged from the original proposal — it already matched this answer) |

I have **not** started implementation. This document, now updated with the above decisions, is the deliverable for Phases 0/20 of the brief; the roadmap in §25 is the agreed plan, ready to begin at Phase 1 — say the word and I'll start there.
