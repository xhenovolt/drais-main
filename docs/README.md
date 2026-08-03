# DRAIS Documentation

The engineering knowledge base for DRAIS. If you are new here, read in this order:

1. [Root README](../README.md) — what DRAIS is, what it ships to, how to run it
2. [CONTRIBUTING.md](../CONTRIBUTING.md) — setup, tests, git workflow, migrations
3. [Architecture Decision Records](adr/README.md) — **why** the system is built this way
4. The [subsystem README](#subsystem-readmes--srclibsubsystemreadmemd) inside the `src/lib/` folder you're working in

> **School administrators and end users:** this folder is for engineers. Product
> documentation lives on the DRAIS website under `/documentation`.

## Start here

| I want to… | Go to |
|---|---|
| Understand why a system works the way it does | [`adr/`](adr/README.md) |
| Set up the project and run tests | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| Deploy to web / desktop / Android | [`guides/DEPLOYMENT_GUIDE.md`](guides/DEPLOYMENT_GUIDE.md), [`BUILD_PIPELINE.md`](BUILD_PIPELINE.md) |
| Add or run a database migration | [`MIGRATION_RUNBOOK.md`](MIGRATION_RUNBOOK.md), [`database/MIGRATIONS.md`](database/MIGRATIONS.md) |
| Look up a table | [`database/TABLE_DICTIONARY.md`](database/TABLE_DICTIONARY.md) |
| Understand the report card engine | [`../src/lib/drce/RENDER_LAYERS.md`](../src/lib/drce/RENDER_LAYERS.md) → [ADR-0005](adr/0005-report-snapshot-immutability.md) |
| Understand attendance | [`../src/lib/attendance/README.md`](../src/lib/attendance/README.md) → [ADR-0001](adr/0001-attendance-raw-events.md) |
| Integrate with the external API | [`PLATFORM_API.md`](PLATFORM_API.md), [`PLATFORM_CONTRACT_FREEZE.md`](PLATFORM_CONTRACT_FREEZE.md) |
| Understand permissions | [`RBAC_ARCHITECTURE.md`](RBAC_ARCHITECTURE.md) |

## Subsystem READMEs — `src/lib/<subsystem>/README.md`

**Closest to the code, and the most likely to be correct.** Each explains what the subsystem owns, the invariant that shapes its design, a file map, extension guidelines, and its known constraints.

| Subsystem | Covers |
|---|---|
| [`drce/`](../src/lib/drce/README.md) | Report composition engine — document model, expressions, rendering. See also [`RENDER_LAYERS.md`](../src/lib/drce/RENDER_LAYERS.md), the binding contract |
| [`snapshots/`](../src/lib/snapshots/README.md) | Immutable, deterministic report data; generation pipeline; verify tokens |
| [`cafe/`](../src/lib/cafe/README.md) | Competency-based assessment (components, frameworks, promotion) |
| [`reports/`](../src/lib/reports/README.md) | Contribution policy, grading, nursery handling, subject ordering |
| [`attendance/`](../src/lib/attendance/README.md) | Attendance evaluation and policy |
| [`ingestion/`](../src/lib/ingestion/README.md) | Device event intake, dedup, punch time |
| [`biometric/`](../src/lib/biometric/README.md) | Fingerprint ↔ person identity, matching, corrections, templates |
| [`devices/`](../src/lib/devices/README.md) | Device ownership transfer ceremony |
| [`passouts/`](../src/lib/passouts/README.md) | Pass-outs, gate decisions, visitation cards |
| [`rbac/`](../src/lib/rbac/README.md) | Permission catalog, authorization, role defaults |
| [`auth/`](../src/lib/auth/README.md) | API auth helpers and module gating |
| [`portal/`](../src/lib/portal/README.md) | Parent portal: sessions, OTP, linking, the isolation gate |
| [`parent/`](../src/lib/parent/README.md) | Cross-school parent API access resolution |
| [`control/`](../src/lib/control/README.md) | Xhenvolt Control Center — tenants, billing, health, impersonation |
| [`platform/`](../src/lib/platform/README.md) | External Platform API v1 — keys, scopes, idempotency, webhooks |
| [`finance/`](../src/lib/finance/README.md) | Fees, payments, money locations, budgets, pocket money |
| [`comm/`](../src/lib/comm/README.md) | Communication event engine (emit → rules → template → provider) |
| [`notifications/`](../src/lib/notifications/README.md) | Policy fanout, outbox, drainer |
| [`search/`](../src/lib/search/README.md) | Global search: projection index, ranking, permission filtering |
| [`trash/`](../src/lib/trash/README.md) | Universal soft-delete, restore, dependency preview, purge |
| [`backup/`](../src/lib/backup/README.md) | School-scoped SQL backups to Cloudinary |
| [`db/`](../src/lib/db/README.md) | Dual database mode, pools, runtime credential config |
| [`services/`](../src/lib/services/README.md) | Mixed legacy layer — ledger, Dahua devices, staff/class-teacher lifecycle |

> **Not yet covered:** `academics/`, `academic/`, `admissions/`, `tahfiz`-related helpers, `issuance/`, `export/`, `i18n/`, `datetime/`, `utils/`, and the smaller single-file folders. Write one when you next work in them.

## Architecture Decision Records — `adr/`

**The most important documentation in this repository.** ADRs capture *why* decisions were made, the alternatives rejected, and the trade-offs accepted. Implementation can be read from the code; intent cannot.

Read [`adr/README.md`](adr/README.md) for the full index.

## Reference — `docs/` root

Stable, current reference material.

| Document | Covers |
|---|---|
| [`PLATFORM_API.md`](PLATFORM_API.md) | External Platform API v1: scopes, IP allowlist, rate limiting |
| [`PLATFORM_CONTRACT_FREEZE.md`](PLATFORM_CONTRACT_FREEZE.md) | The frozen v1 contract and what may never change in it |
| [`PLATFORM_READINESS.md`](PLATFORM_READINESS.md) | Platform API production readiness and deferred follow-ups |
| [`RBAC_ARCHITECTURE.md`](RBAC_ARCHITECTURE.md) | Dynamic RBAC: permission catalog, DB sync, `module.resource.action` |
| [`PHASE_1_CRUD_TRASH_ARCHITECTURE.md`](PHASE_1_CRUD_TRASH_ARCHITECTURE.md) | Universal CRUD + reversible soft-delete (Trash) |
| [`OFFLINE_MIGRATION_ASSESSMENT.md`](OFFLINE_MIGRATION_ASSESSMENT.md) | Offline-first assessment across routes and tables |
| [`MIGRATION_RUNBOOK.md`](MIGRATION_RUNBOOK.md) | Running database migrations safely |
| [`BUILD_PIPELINE.md`](BUILD_PIPELINE.md) | CI/CD and the multi-target build pipeline |
| [`PRINT_FONTS.md`](PRINT_FONTS.md) | Arabic/Latin print font requirements and distribution |

## Architecture — `architecture/`

Longer-form design documents. Note these are point-in-time designs; where they conflict with an ADR or with in-code documentation, **the ADR and the code win**.

- [`DRCE_ARCHITECTURE.md`](architecture/DRCE_ARCHITECTURE.md) — report card engine design (see also `RENDER_LAYERS.md`, which is the binding contract)
- [`BIOMETRIC_IMPLEMENTATION_MAP.md`](architecture/BIOMETRIC_IMPLEMENTATION_MAP.md) — biometric schema and implementation map
- [`ARCHITECTURE_REFERENCE.md`](architecture/ARCHITECTURE_REFERENCE.md) — student lifecycle schema, API flows
- [`ARCHITECTURE_BILINGUAL_REPORTS.md`](architecture/ARCHITECTURE_BILINGUAL_REPORTS.md) — bilingual/RTL report pipeline
- [`SYSTEMS_IMPLEMENTATION_4_0.md`](architecture/SYSTEMS_IMPLEMENTATION_4_0.md) — core systems overview
- [`DRAIS_ARCHITECTURE_GAPS.md`](architecture/DRAIS_ARCHITECTURE_GAPS.md) — known gaps

## Guides — `guides/`

Things you can actually follow, step by step.

**Deployment & packaging:** [`DEPLOYMENT_GUIDE.md`](guides/DEPLOYMENT_GUIDE.md) · [`DESKTOP_PACKAGING.md`](guides/DESKTOP_PACKAGING.md) · [`DESKTOP_LOCAL_TRANSFER.md`](guides/DESKTOP_LOCAL_TRANSFER.md) · [`APT_REPO.md`](guides/APT_REPO.md) · [`DEPLOYMENT_CHECKLIST_BILINGUAL.md`](guides/DEPLOYMENT_CHECKLIST_BILINGUAL.md)

**Engineering standards:** [`API_ERROR_HANDLING_GUIDE.md`](guides/API_ERROR_HANDLING_GUIDE.md) — the "zero silent failures" standard, required reading before writing an API route

**Academics:** [`DRCE_TOTALS_AND_AVERAGES.md`](guides/DRCE_TOTALS_AND_AVERAGES.md) ([quickref](guides/DRCE_TOTALS_QUICKREF.md)) · [`SUBJECT_ALLOCATION_ENFORCEMENT.md`](guides/SUBJECT_ALLOCATION_ENFORCEMENT.md) ([quickref](guides/SUBJECT_ALLOCATION_ENFORCEMENT_QUICKREF.md)) · [`SUBJECT_SCOPE_MANAGEMENT.md`](guides/SUBJECT_SCOPE_MANAGEMENT.md) · [`TEMPLATE_MIGRATION_GUIDE.md`](guides/TEMPLATE_MIGRATION_GUIDE.md)

**Enrollment:** [`ENROLLMENT_REASSIGNMENT_SYSTEM.md`](guides/ENROLLMENT_REASSIGNMENT_SYSTEM.md) ([testing](guides/ENROLLMENT_REASSIGNMENT_TESTING.md))

**Attendance:** [`ATTENDANCE_POLICY_SCOPING.md`](guides/ATTENDANCE_POLICY_SCOPING.md)

## Audits — `audits/`

Investigation reports, most written before a body of work as a "what is actually true right now" pass. They are **findings, not specifications** — several conclude with recommendations that were never implemented, and some are explicitly marked plan-only or awaiting approval.

They are the richest source of ADR material in the repo. The most current (July 2026) include the biometric centralization audit, DRCE report-engine hardening, V1 LTS hardening, student-management hardening, the Control Center audits, and route hardening/security remediation.

**Before acting on any audit, check its date against `git log` on the files it discusses.**

## Domain references

- **`translation/`** — terminology glossaries (general, academic, DRCE, export) plus coverage and duplicate inventories. Genuinely reusable reference material for i18n work.
- **`localization/PHASE0_AUDIT.md`** — Arabic i18n audit. Key finding: dictionaries are ~98% complete; the real problem is components bypassing `t()`.
- **`tahfiz/`** — Qur'an reference data structure and religious-accuracy stance.
- **`database/`** — [table dictionary](database/TABLE_DICTIONARY.md) and [migration mechanisms](database/MIGRATIONS.md).

## Releases — `releases/`

Per-release notes from `v1.81.0` to `v1.133.0`.

> **Known gap:** release notes stop at `v1.133.0`. The current version is well beyond that. Per-release notes were not maintained through the later work; the git log is authoritative in the meantime. This is tracked as a deliberate deferral, not an oversight.

## Archive — `archive/`

Superseded and point-in-time documents, kept for their forensic and decision history. **Do not treat anything in `archive/` as current.** See [`archive/README.md`](archive/README.md) for what's there and the specific stale claims to watch for.

## Documentation conventions

- **ADRs explain why. Guides explain how. Audits record what was found at a point in time.** Keep them separate; when an audit's findings get implemented, the durable reasoning belongs in an ADR.
- **In-code documentation wins for behaviour.** A `README.md` inside `src/lib/<subsystem>/` is closer to the code and more likely to be correct than a document in `docs/`. Where they disagree, fix one of them.
- **Date and version-stamp point-in-time documents.** An undated audit is unusable a year later.
- **When you supersede a document, say so in its header** and link to the replacement rather than silently leaving it to rot.
