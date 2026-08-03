# DRAIS — Digital Records & Attendance Intelligence System

DRAIS is a full-featured, multi-tenant school information platform built for real schools running real terms. It manages the complete academic lifecycle — enrollment, marks, report cards, attendance (manual and biometric), finance, Qur'an memorization (Tahfiz), and parent communication — with first-class bilingual support (English / العربية) throughout.

It is not a demo or a template: DRAIS runs in production at nursery, primary, and secondary schools in Uganda, powering their day-to-day operations and their end-of-term reporting.

## Platforms

One codebase ships to four surfaces:

| Platform | How it runs |
|---|---|
| **Web (cloud)** | Next.js 15 App Router deployed on Vercel, backed by TiDB Cloud (MySQL-compatible). Serverless PDF generation via headless Chromium. |
| **Desktop (Windows / Linux)** | Electron shell that boots the same Next.js standalone server locally (`electron/`, built with electron-builder). Works on school LANs with or without internet. |
| **Android (APK)** | Capacitor 8 + nodejs-mobile hybrid: a real Node.js runtime inside the APK runs the Next standalone server on `127.0.0.1:3210`; the WebView is the full app — SSR, API routes, and all. Built as `drais-<version>-<alpha|beta|lts>.apk`. |
| **PWA** | Installable progressive web app from the cloud deployment, with generated icon sets. |

## Feature Areas

- **Academics** — classes, streams, subjects (typed: primary/secondary/theology/elective), term results, promotion logic
- **Report cards** — snapshot-based reporting engine (DRCE): reports are generated into immutable snapshots and rendered deterministically; aggregates and divisions derive from a single canonical contributing-subject rule with integrity checks guarding every generation
- **Template editor** — visual DRCE document editor with per-school templates, per-student overrides, Arabic RTL rendering, QR verification links on printed reports
- **Attendance** — manual registers plus ZKTeco biometric device ingestion with live check-in popups and device-clock self-healing
- **Finance** — fee structures, invoicing, payments, financial reports; integrates with the Jeton payments platform
- **Tahfiz** — Qur'an memorization plans, portions, and progress reporting
- **Parent portal** — per-learner access to results, report PDFs, and verified report links
- **People** — students, staff, teacher allocations and initials, ID cards
- **Internationalization** — every screen ships English and Arabic; reports render LTR or RTL with Arabic numerals where configured

## Architecture at a Glance

- **Framework**: Next.js 15 (App Router, standalone output), React 19, TypeScript
- **Database**: TiDB Cloud in production (MySQL protocol via `mysql2`); local MySQL supported for development (`DATABASE_MODE`)
- **Reports pipeline**: DB marks → `report_snapshots` (JSON snapshots) → DRCE renderer → print/PDF. Divisions and aggregates are computed at render time from snapshotted marks through one shared helper (`getContributingAssessmentResults`) — ICT, IRE, and electives never count toward aggregates
- **PDF**: puppeteer against a naked print page; on serverless the Chromium binary comes from `@sparticuz/chromium`
- **Testing**: Node test runner suites per domain (`npm run test:drce`, `test:snapshots`, `test:attendance`, …) plus data-integrity verifiers that run against production (`npm run verify:divisions`)

## Repository Map

```
src/
  app/            Next.js App Router — ~230 UI pages + ~685 API routes
  lib/            the engines (see below); most real logic lives here
  components/     shared React components
  locales/        en.json / ar.json — every user-facing string
docs/             engineering documentation — start at docs/README.md
  adr/            Architecture Decision Records — why, not what
database/
  migrations/tidb/  managed, ledger-tracked migrations
  exports/          periodic schema/data snapshots
electron/         desktop shell
android/, mobile/ Capacitor + nodejs-mobile Android build
workers/          relay agents, background workers
scripts/          build, database, and maintenance tooling
```

Key `src/lib/` subsystems — several carry their own `README.md`:

| Folder | What it owns |
|---|---|
| [`attendance/`](src/lib/attendance/README.md) | Ingestion, rule evaluation, device clocks, time intelligence |
| `drce/` | Report card engine ([`RENDER_LAYERS.md`](src/lib/drce/RENDER_LAYERS.md) is its binding contract) |
| `snapshots/` | Immutable report snapshots, grading, ranking, integrity |
| `control/` | Control Center — separate auth, provisioning, billing |
| `finance/` | Fee rules engine, budgets, receipts |
| `biometric/` | Enrollment, template distribution, identity resolution |
| [`backup/`](src/lib/backup/README.md) | School-scoped SQL backups to Cloudinary |
| `portal/` | Parent portal — OTP auth and the isolation gate |
| `platform/` | External Platform API v1 (frozen contract) |
| `ingestion/` | [Unified import pipeline](src/lib/ingestion/README.md) |

## Documentation

| | |
|---|---|
| **[docs/README.md](docs/README.md)** | Engineering documentation index |
| **[docs/adr/](docs/adr/README.md)** | **Architecture Decision Records — read before changing a subsystem** |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, tests, migrations, commit conventions |
| [docs/database/TABLE_DICTIONARY.md](docs/database/TABLE_DICTIONARY.md) | All 292 tables, scope, soft-delete status |

Product documentation for schools lives on the DRAIS website under `/documentation`.

## Getting Started (development)

```bash
npm install
cp .env.example .env.local        # configure DB (TIDB_* or local MySQL) + secrets
npm run dev                        # http://localhost:3000
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for tests, database modes, and the commit/versioning workflow.

Production web build: `npm run build` / `npm start`.

### Desktop

```bash
npm run dist:win        # Windows installer
npm run dist:linux      # AppImage + deb
```

### Android

```bash
npm run mobile:sync     # next build → mirror standalone → cap sync → stage node runtime
npm run mobile:apk:debug
# → android/app/build/outputs/apk/debug/drais-<version>-beta.apk
```

Requires JDK 21, Android NDK 27.0.12077973, CMake 3.22.1. CI builds the APK automatically on `v*` tags (stability channel `lts`) and on demand.

Bundled runtime DB config for desktop/mobile comes from `build/.env.production` (gitignored; see `electron/config.cjs` and `scripts/build-mobile.mjs`).

## Author & Ownership

DRAIS is designed, built, and maintained by **Xhenvolt** — a Ugandan software engineering company focused on production systems for schools and institutions.

- **Product**: DRAIS (`drais.pro`)
- **Contact**: info@drais.pro
- **Copyright**: © Xhenvolt. All rights reserved.

## License

Proprietary — all rights reserved. No part of this system may be copied, redistributed, or deployed without written permission from the author.
