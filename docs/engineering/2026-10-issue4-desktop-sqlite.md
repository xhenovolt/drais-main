# Issue 4 — Standalone Windows exe, SQLite and .drs (result)

All tests below ran against the **real packaged app**: `electron-builder --dir` → `dist/win-unpacked/DRAIS.exe`, Electron 33.4.11.
- The driver is `.ops-work/packaged-e2e.mjs`. It gives the app an isolated `USERPROFILE` and `--user-data-dir`, so the owner's `~/.drais` and `%APPDATA%\DRAIS` are untouched.
- TiDB points at an unresolvable host, and nothing listens on 3306.
- The DRAIS window's own internet access is blocked with `--proxy-server=127.0.0.1:9`; only 127.0.0.1 is reachable.
- The window is driven over the DevTools protocol, so its requests carry exactly what a click would.

## Failure sequence (VERIFIED)
| Stage | Finding |
|---|---|
| Launch → config | `electron/config.cjs` merges the bundled `resources/.env.production` + `userData/drais.env` + process env. OK. |
| Server start | The Next standalone server is `require()`d in-process; the login screen took 22–25 s from launch (79 s on the very first launch). OK. |
| Mode | Every launch starts **online**, by the owner's decision of 2026-10-08 (6b5861cc). SQLite is chosen on the login screen each launch. Kept. |
| `.drs` import | `.drs` = `DRAISDRS` magic, plaintext JSON header, AES-256-GCM(gzip(SQLite file)), SHA-256 trailer. Import worked in the baseline, including a path with a space and non-ASCII characters; the database is written to `%USERPROFILE%\.drais\local.sqlite`, not the read-only install dir. |
| **SQLite driver open** | **Earliest failure — root cause.** `better-sqlite3` 13.0.3 (engines `node >=22`, built for Node-API 10) **segfaults** on `new Database()` inside Electron 33 (Node 20.18.3, Node-API 9). Reproduced with `ELECTRON_RUN_AS_NODE=1 DRAIS.exe probe.cjs` → exit 139, plus a Crashpad dump from the packaged app. The whole app died the moment SQLite was chosen, with nothing in `drais.log`. Recompiling 13.x against Electron's headers also segfaults: the source targets Node-API 10. The postbuild's "rebuild for Electron" had been a silent no-op, because `binding.gyp` skips the build when a prebuild exists. |
| Middleware | The webpack build used by Electron had an **empty middleware manifest**: root `middleware.ts` is not seen when the app lives in `src/`, so the desktop app ran with no session redirect, role guard or forced-reset gate (`/dashboard` without a session → 200). |
| Network exposure | The server listens on 0.0.0.0 for attendance devices. `POST /api/db-mode` and `POST /api/desktop/import-drs` checked only `isLocalAllowed()`, so another computer on the LAN reached both handlers (verified on the baseline exe). |
| Missing / corrupt DB | `getSqliteDb()` silently **created** an empty schema-only database when the file was missing; `/api/db-mode` then reported "database exists", so setup was no longer offered. |
| Replace (`force`) | Deleted the current database's `-wal`/`-shm` without a copy (on this machine the owner's real data is 800 KB of WAL over a 4 KB main file), and installed the payload with no integrity or school check. |

## Changes
1. **Desktop SQLite driver:** devDependency alias `better-sqlite3-electron` = `npm:better-sqlite3@12.11.1` (engines Node 20–26).
   - `scripts/postbuild-electron.mjs` copies it, with `bindings` and `file-uri-to-path`, into the standalone build and compiles it against Electron's headers.
   - It then **opens, writes and reads a database inside Electron** and fails the build otherwise.
   - Dev, tests and hosted builds keep 13.0.3 under Node 24. The JavaScript API is the same.
2. **`middleware.ts` → `src/middleware.ts`.** Verified enforced under webpack (manifest + `next dev`) and Turbopack (`next dev --turbopack`): `/dashboard` → 307 to `/login`, and an API call → 401.
3. **Desktop-only actions:** `electron/main.cjs` creates a random token per launch and adds `x-drais-desktop` to its own window's requests. `src/lib/desktop/desktop-guard.ts` checks it on `POST /api/db-mode` and `POST /api/desktop/import-drs`. Outside Electron, behaviour is unchanged.
4. **No silent empty database:** `getSqliteDb()` opens existing files only (`LocalDatabaseMissingError`). The offline login and `/me` routes return 503 `LOCAL_DB_MISSING` / `LOCAL_DB_UNREADABLE` with the path and the SQLite reason. The mode-switch error now includes the reason.
5. **Safe install:** the payload is validated before anything changes (SQLite `integrity_check`, required tables, exactly one school; 422 otherwise). A replace first copies the current db + `-wal` + `-shm` to `.drais/replaced/<name>-<time>/`, and the response reports the folder. The setup page wording is corrected.
6. **Installer contents:** `Promotion_Manifest_*.json` (one school's learner list, swept in by output tracing) is excluded.
7. **Found while testing:** the offline learner list and search stopped at the first 500 learners, so a 759-learner school's newest admissions were invisible. Keyset paging (`afterId`) was added to `students.listBySchool` (SQLite and MySQL), with a test.

## Acceptance gate (§38)
| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Packaged exe launches | PASS | login served in 22–25 s |
| 2 | Opens a valid existing .drs | PASS | import from `drs test\École 8002 — test ü.drs` |
| 3 | Initialises a new local SQLite DB where supported | N/A by design | a school database comes only from provisioning or a .drs; creating one silently is now refused |
| 4 | Authentication against SQLite | PASS | sign-in after selecting SQLite; `/api/auth/me` resolves the school |
| 5 | Protected routes load | PASS | `/students/offline`, `/dashboard` render; unauthenticated → login redirect |
| 6 | Reads and writes | PASS | list learners; create learner (201) |
| 7 | Data persists after close/reopen | PASS | sign-in after restart; the learner is in the file after restart (read directly). The packaged list did not show it because of the 500-row cap, fixed in change 7 and verified under Node on the same file (759/759, search hit) — not yet in a packaged build |
| 8 | No XAMPP | PASS | port 3306 closed for every SQLite phase; TiDB host unresolvable |
| 9 | Internet disconnected | PASS | window proxied to nowhere except 127.0.0.1; server cannot resolve TiDB |
| 10 | Existing data preserved on upgrade | PASS | database imported by the old build: byte-identical after the new build started; the new build signed in and read 759 learners |
| 11 | Failures diagnosable | PASS | missing file → switch refused with "not found at <path>", nothing created; random-bytes file → "file is not a database", file untouched; broken .drs → refused, nothing changed |
| 12 | Backup / restore | PARTIAL | replace makes a verified backup (unit test: the backup holds the WAL edit); restoring is copying that file back — not exercised in the exe |
| 13 | Local MySQL/XAMPP still works | PASS (partial depth) | packaged exe switched to local MySQL, health `SELECT 1` OK, data API still 401 without a session; sign-in not run (no known local password; data was not modified) |
| 14 | TiDB Cloud still works | PASS (read-only) | packaged exe health `SELECT 1` on TiDB OK; sign-in not run (no test account on production) |
| 15 | Tests on the packaged artifact | PASS | all of the above on `DRAIS.exe`; plus `test:desktop` 9/9 and the in-Electron probe at every build |

Clean-machine install (NSIS installer on a PC that never had Node, VS Build Tools or XAMPP): **NOT VERIFIED** — only the unpacked app on the build machine was run.

## Outstanding risks (owner decisions — not changed)
- **Production database credentials ship in every installer.** `build/.env.production` on the build machine (TiDB host, user, password) is packaged as `resources/.env.production`, readable by anyone with the installer.
- **Next image cache EPERM** when installed under Program Files (`.next/cache` is read-only): non-fatal, images are not cached. Next action: build the desktop variant with `images.unoptimized`, or point the cache at userData.
- **Installer size:** electron-builder also packs the project's full production `node_modules` into a 148 MB `app.asar` that the app never loads.
- **Pre-existing test failures:** `test:repo` has 45 failures, identical with and without this work, caused by 6b5861cc (always start online) while those tests expect `DRAIS_DB_MODE` to select the mode. One API test greps `middleware.ts` for `/api/platform`, which moved to `auth-scope.ts` earlier.
