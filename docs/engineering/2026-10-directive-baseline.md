# Engineering directive (Oct 2026) — baseline reconnaissance

Status of the four issues **before any change**. Labels: **VERIFIED** (seen in code, DB or runtime output),
**SUPPORTED** (strong evidence, not yet reproduced), **HYPOTHESIS**, **UNKNOWN**.

Work order (mandatory): 1 media → 2 developer docs → 3 Control Panel scrolling → 4 Windows exe + SQLite/.drs.

---

## 0. Architecture facts used by every phase

| Fact | Status | Evidence |
|---|---|---|
| Next.js App Router app; 312 `page.tsx`, 13 `layout.tsx`, 784 API `route.ts`, 326 components, 29 custom hooks | VERIFIED | `find src/app …` counts |
| Three DB modes: `online` (TiDB), `local-mysql`, `local-sqlite`; chosen at runtime, hosted builds forced online unless `DRAIS_ALLOW_LOCAL=true` | VERIFIED | `src/lib/db/db-mode.ts` (`getDbMode`, `isLocalAllowed`) |
| New processes always start `online`; local mode is an explicit switch (`/api/db-mode`) carried in `process.env.DRAIS_RUNTIME_DB_MODE` | VERIFIED | `db-mode.ts` `envDefaultMode()` |
| Desktop = Electron 33 + electron-builder; Next standalone server `require()`d inside the Electron main process | VERIFIED | `package.json` scripts, `electron/main.cjs:100`, `electron-builder.yml` |
| SQLite driver = `better-sqlite3` 13.0.3 (optionalDependency, native), rebuilt for the Electron ABI in `scripts/postbuild-electron.mjs` | VERIFIED | postbuild lines 56–113 |
| Tests: `node:test` via `npx tsx --test` per lib folder; `npm run test` chains them | VERIFIED | `package.json` |
| This machine: Windows, XAMPP installed (`C:\xampp`) but MySQL **not running**; `~/.drais/local.sqlite` exists | VERIFIED | netstat, `ls` |

---

## Issue 1 — Offline image / media

**Verified**
- Every upload path writes **only to Cloudinary**, with no DB-mode check:
  `api/students/photo`, `api/students/upload-photo`, `api/learners/[id]/photo`, `api/staff/photo`, `api/upload`,
  `api/students/bulk-photo-upload`, `api/students/bulk-photo-map` → `uploadStudentPhoto()` in `src/lib/cloudinary.ts`.
  Offline (no internet) an upload simply fails.
- Person photos (learners and staff) live in **`people.photo_url`** (students/staff join via `person_id`).
  Logos: `schools.logo_url`, `school_info.school_logo`, `school_theme_settings.logo_url`. User images: `users.avatar_url`, `users.profile_photo`.
- Production census (TiDB, counts only): `people.photo_url` → 12,026 empty, **752 Cloudinary**, **204 legacy `/uploads/...`**;
  `schools.logo_url` → 20 empty, 5 `/uploads/...`, 4 Cloudinary.
- The 204 legacy `/uploads/...` references point at files that are **not in the deployed `public/`** (repo `public/uploads/students` holds 7 unrelated files) → those photos are broken today, online too.
- **Bug:** `api/staff/add/route.ts:116` stores `/uploads/staff/photo_<ts>.jpg` but never saves the uploaded bytes (`// TODO`) — the photo is silently lost.
- 52 `.tsx` files read `photo_url`/`photoUrl` and render it directly; there is **no shared resolver** and no media table.
- Existing partial solution worth keeping: `scripts/db/download-photos.mjs` (commit b27ee655) — CLI that downloads one school's Cloudinary photos into `public/offline-photos/<schoolId>/` and rewrites the **local SQLite** copy's `photo_url`. Not reachable from the UI, not for local-mysql, writes into `public/` (read-only inside a packaged exe).

**Hypothesis / unknown**
- How local-mysql gets its data (`db:local:init`, `to-mysql8`) and whether photo URLs are copied verbatim — expected verbatim (→ Cloudinary URLs offline). To verify in phase 1.
- Whether `public/` is writable in the packaged exe (expected read-only under Program Files) — affects where managed local media must live.

## Issue 2 — Developer documentation

**Verified**
- Control Panel docs at `/control/docs`: ~40 hand-written topic pages (≈10k lines), `registry.ts` (search keywords, sections), `ControlDoc.tsx`/`Lesson.tsx` renderers. Topics: Learn curriculum, modules, playbooks, architecture.
- Docs are organised by **topic/module**, not by route; there is no per-route or per-file page, no generated route tree, no staleness check. That is the gap the owner describes.

**Plan basis** — 312 pages × deep hand-written docs is not achievable honestly; approach: a generator that statically analyses the real tree (layout chain, imports, components, hooks, fetch/API endpoints, the API routes' methods and tables, tests), emits a JSON index, and renders per-route/per-file pages with sections marked *generated* vs *needs manual review*; plus hand-written depth (teaching example, custom-tab guide, anti-patterns, JS/PHP analogies) on verified routes.

## Issue 3 — Control Panel sidebar scrolling

**Verified (source)**
- School shell `src/components/layout/MainLayout.tsx`: `h-screen` outer, `overflow-hidden` row, `<main className="… overflow-y-auto">` — the document never scrolls, so the sidebar cannot leave.
- Control shell `src/app/control/layout.tsx:284`: page scrolls; `<aside className="… self-start … sticky top-14 min-h-screen overflow-y-auto">`. A commented-out earlier attempt with `h-[calc(100dvh-3.5rem)]` sits on line 285.
- `globals.css:147-153` applies a global `overflow-x: hidden` guard.

**Supported, to reproduce in a browser** — the sticky aside is defeated by (a) `min-h-screen` making it taller than the visible area below the 3.5rem header and/or (b) an ancestor with `overflow-x: hidden` becoming the scroll container for `position: sticky`.

## Issue 4 — Windows exe + SQLite / .drs

**Verified prior work (still present)**
- 1b3b6d80: `/setup/local-sqlite`, `POST /api/desktop/import-drs`, bundled `.drs` via `prepare-drs-bundle.mjs`, `src/lib/desktop/drs-bundle.ts`.
- d1fbef4c: `src/instrumentation.ts` zero-click first boot; `src/lib/desktop/install.ts`; drop folder `~/.drais/import/`.
- 531a3573: `better-sqlite3` was missing from `resources/standalone/node_modules` in every packaged build; now copied explicitly by `postbuild-electron.mjs` and rebuilt for Electron. Verified by its author only against an isolated standalone copy (`POST /api/db-mode` health ok) — **not** documented as tested in an installed `.exe`.
- `.drs` is an encrypted container (passphrase) with a header (`drs-format.ts`, `write-drs.ts`, `openDrsFile`) — not a raw SQLite file. Exact format to re-verify in phase 4.
- Stray artefacts from earlier experiments: root `UsersashicAppDataLocalTemp*.log`, `scratch-electron-test*/`, `scratch-trivial/` (one log shows `Cannot find module 'bindings'` from an older better-sqlite3 — current 13.0.3 depends only on `node-addon-api`).

**Unknown — must be reproduced on a real packaged build**
- Whether the current `dist:win` artefact opens a `.drs`, logs in and persists data on a machine without XAMPP; whether any startup/auth path still touches MySQL in SQLite mode; whether `next build` (webpack) completes on this machine (Turbopack build previously failed on Windows at the standalone copy step).

---

## Acceptance tests to run per phase
See the directive's gates (§12J, §24, §28, §38). Each test is recorded in the phase report as PASS / PARTIAL / FAIL / NOT VERIFIED / BLOCKED with evidence.
