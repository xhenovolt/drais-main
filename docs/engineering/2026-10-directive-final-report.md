# Engineering directive (Oct 2026) — final report

Baseline: `2026-10-directive-baseline.md`. Detail per issue: `2026-10-issue1-media.md`, `-issue2-devdocs.md`, `-issue3-control-scroll.md`, `-issue4-desktop-sqlite.md`.
Statuses: PASS / PARTIAL / FAIL / NOT VERIFIED / BLOCKED.

| Issue | Status |
|---|---|
| 1 Offline media | **PARTIAL** — core verified (HTTP and local MySQL end to end); full-app offline browser render, folder-mapping UI click-through and a live Cloudinary upload not exercised |
| 2 Developer docs | **PASS**, except G13 (no Control Center session available to click through the running app) — NOT VERIFIED |
| 3 Control Panel scrolling | **PASS** on the real components in a browser; live signed-in session NOT VERIFIED |
| 4 Desktop exe + SQLite/.drs | **PASS** on the packaged artifact for 13 of 15 gate items; backup/restore PARTIAL; clean-machine install NOT VERIFIED |

---

## 1. Offline image / media
1. **Symptom:** offline, photos and logos did not load; uploads failed.
2. **Root cause (VERIFIED):** every upload route wrote only to Cloudinary, and pages rendered the stored URL directly. There was no resolver and no local store. 204 legacy `/uploads/…` references are broken online too (files never deployed).
3. **Evidence:** route audit; production census (752 Cloudinary, 204 legacy); local MySQL holds 4,176 Cloudinary URLs.
4. **Files:** `src/lib/media/*`, `src/app/api/media/*`, `src/app/settings/media/page.tsx`, `src/components/media/MediaImg.tsx`, seven upload routes.
5. **Existing work:** `scripts/db/download-photos.mjs` (CLI, SQLite only, wrote into `public/`).
6. **Changes:**
   - local media store under the user profile, with a policy of cloud, local-first or local-only;
   - `/api/media/*` endpoints;
   - `<MediaImg>` in 48 files;
   - `storeImage()` for all uploads;
   - Settings → Photos & Media: inventory, copy to computer, folder mapping by identifier only, ZIP export with manifest;
   - `staff/add` now saves the photo;
   - `school_id` guards on two upload routes.
7. **Decisions:** database references are never rewritten online; hosted builds stay cloud; local media lives outside the read-only install dir.
8–9. **Tests:** `test:media` 13/13; 13/13 HTTP E2E on a SQLite copy; local MySQL E2E (60 copied, 0 failures, served from disk under local-only); client resolver harness.
10. **Limitations:** copies are per machine; `media://` references are not synced to the cloud.
11. **Unverified:** see status line.

## 2. Route-specific developer documentation
1. **Symptom:** Control docs were topic-level only, so individual routes could not be understood from them.
2. **Root cause (VERIFIED):** hand-written topic docs, no route or file index, no generator, no staleness check.
3–5. **Existing work:** ~45 pages, `registry.ts` and `ControlDoc.tsx` (extended, not replaced).
6. **Changes:**
   - TypeScript-AST generator over 2,100+ files, regenerated in prebuild;
   - `/api/control-center/docs/*` behind `docs.view`;
   - route tree, file pages and search with a Problems category;
   - teaching example (`/attendance/settings`) with JS/PHP analogies;
   - layout guides, "Add a custom tab", "Conventions to avoid".
7. **Decisions:** facts are generated and judgement is hand-written; anything unreadable is marked "needs manual review"; the index stays on the server.
8–9. **Tests:** `test:devdocs` 16/16 (coverage of every served route, Source-link staleness, search); browser harness with real data (six junior tasks); guard returns 401.
10. **Defects found:**
    - Cross-tenant write in `/api/sync/manual-upload`: **fixed**, 7bd4311a.
    - Latent cross-tenant join in `/api/schools/select`: documented, untouched.
    - 19 dead endpoint calls.
    - `/finance/payments` total covers only the latest 50 rows.
11. **Unverified:** G13.

## 3. Control Panel sidebar scrolling
1. **Symptom:** in the Control Panel, the sidebar and header scrolled away on long pages.
2. **Root cause (VERIFIED):** `html, body { overflow-x: hidden }` made `body` a scroll container that never scrolls, so every `position: sticky` element was neutralised. The school shell was unaffected because its `<main>` scrolls. A secondary cause: the sidebar was `min-h-screen`.
3. **Evidence:** reproduced on the real `ControlLayout` at 1440/1280/1024/390 before the fix; fixed after.
6. **Changes:**
   - `overflow-x: clip` under `@supports`;
   - one `--ctl-header-h` variable drives the header, the sidebar `top`/height, the docs nav, the explorer tree, the storage bar and `scroll-padding`.
7. **Decision:** the layouts were not merged; the Control Panel keeps document scrolling (printing).
8–9. **Tests:** resize, drawer, keyboard and school-layout regression, all PASS.

## 4. Standalone Windows exe + SQLite/.drs
1. **Symptom:** the exe could not use its SQLite/.drs database, so XAMPP became a requirement.
2. **Root cause (VERIFIED on the packaged exe):** `better-sqlite3` 13.0.3 (Node ≥22, Node-API 10) **segfaults inside Electron 33** (Node 20, Node-API 9), killing the whole app when SQLite opens. Recompiling 13.x does not help, and the postbuild's rebuild was a silent no-op.
3. **Evidence:** exit 139 reproduction; Crashpad dump; 12.11.1 compiled for Electron opens the same database.
4. **Files:** `scripts/postbuild-electron.mjs`, `electron/main.cjs`, `src/lib/desktop/*`, `src/lib/repo/sqlite/singleton.ts`, `src/lib/repo/offline-auth/route-bridge.ts`, `src/app/api/db-mode`, `src/app/api/desktop/import-drs`, `src/middleware.ts`.
5. **Existing work audited:**
   - 531a3573 (copy better-sqlite3 into the standalone build);
   - instrumentation auto-activate;
   - import route and drop folder;
   - the "always start online" decision (kept).
6. **Changes:**
   - Electron-compatible SQLite build, verified at every build;
   - middleware actually enforced in desktop (and on Turbopack);
   - per-launch window token for install and mode switch;
   - no silent empty database, with clear 503s;
   - validated install with backup on replace;
   - installer no longer ships one school's learner list;
   - offline learner list no longer capped at 500.
8–9. **Tests:** see the gate table in the Issue 4 report.
10–11. **Limitations and unverified items:** clean-machine NSIS install; restore not exercised in the exe; online and local-MySQL sign-in not run (no credentials, and no production writes).

---

## Change summary
- **Commits on `dev`:** 82c55490 (1), 7bd4311a (security), 2588da52 (2), 234ea6d2 (3), plus the Issue 4 commit.
- **Schema or migrations:** none. No production rows changed; only read-only queries were run against production.
- **Dependencies:** added devDependency `better-sqlite3-electron` (npm:better-sqlite3@12.11.1, exact). It is needed because the existing 13.x cannot run in Electron 33.
- **Build:** `prebuild` / `prebuild:electron` generate the docs index. `build:electron` (webpack) and electron-builder succeeded on this machine. Vercel still uses `next build --turbopack` (unchanged).
- **Regression:** media 13, devdocs 16, desktop 9, container 14, provisioning 5, i18n 34, snapshots 6 — all pass. `test:repo` 242 pass / 45 fail, identical to before this work. API tests: 1 pre-existing failure.

## Outstanding risks and next actions
1. **Production TiDB credentials in every desktop installer** (`build/.env.production` → `resources/.env.production`). Owner decision. Next: a per-school limited database user or an API, and stop bundling root credentials.
2. **`/api/schools/select` and `/create`:** do not repair the `sessions.token` lookup without a membership check.
3. **Repo test suite:** 45 tests expect `DRAIS_DB_MODE` to set the mode, which 6b5861cc removed. Update the tests or the decision.
4. **Desktop image cache EPERM under Program Files;** an oversized `app.asar`.
5. **Rebuild the desktop app** so the learner-list paging fix and the clearer mode-switch error are in a packaged artifact (both are verified under Node only).
6. **Merge `dev` → `main`** is the owner's action, as before.
