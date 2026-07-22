# DRAIS Desktop Packaging — Forensic Findings & Fix (Completion Report)

## 1. Current packaging method
Electron (`electron@33`) + `electron-builder@25`, Next.js **`output: 'standalone'`**, online TiDB (mysql2). Capacitor present for Android (separate track). Entry point: `electron/main.cjs`. Standalone server runs **in-process** inside Electron's main process; window opens at `http://127.0.0.1:3210`.

## 2. Root cause of executable failure
**The packaged app never received database credentials.** `electron/main.cjs` set only `PORT`/`HOSTNAME`/`NODE_ENV` and loaded **no `.env`**. Next `standalone` ships without any `.env` (electron-builder bundled only `.next/standalone`), so at runtime `db.ts` saw `TIDB_USER=''`/`TIDB_PASSWORD=''` → TiDB auth failed → the page loaded but **every DB/API call 500'd**. `npm start` worked only because `.env.local` exists in the project root. (Ruled out: standalone output ✓, static/public copied by `postbuild-electron.mjs` ✓, no native modules in use — `bcryptjs`/`mysql2` are pure-JS; `bcrypt@6` is unused.)

## 3. Files changed
- `electron/config.cjs` **(new)** — safe config loader (precedence: system env → `userData/drais.env` → bundled `resources/.env.production`); writes resolved keys into `process.env` before the server starts; masks secrets in logs.
- `electron/main.cjs` — loads config first; captures the in-process server's console into the log; waits for `/api/health`; opens the app only if DB is healthy, else shows a **diagnostic screen**; adds an app menu with **Open Logs Folder / Retry connection / View Diagnostics**.
- `src/app/api/health/route.ts` **(new)** — DB-aware probe (server + DB + masked env flags); 200 when healthy, 503 when DB down.
- `electron-builder.yml` — ships `build/.env.production` if present; adds **Linux (AppImage/deb)** + **macOS (dmg/zip)** targets.
- `build/.env.production.example` **(new)**, `.gitignore` (allow the example), `package.json` (`dist:linux`, `dist:mac`).

## 4. Packaging config changed
Standalone still shipped as `extraResources/standalone`. Added optional bundled `.env.production`. `asar: true`, `asarUnpack: []` (correct — no native deps). Win NSIS + portable retained; Linux + macOS added.

## 5. Runtime boot model (Model A)
load config → start in-process Next standalone server (0.0.0.0:3210) → poll until reachable → **GET /api/health** → if `db.connected` open `http://127.0.0.1:3210/`, else render the diagnostic screen. Single-instance lock; LAN-reachable for ZK devices.

## 6. Env/config strategy
No developer `.env` required. Admin can drop `userData/drais.env` (e.g. `%APPDATA%/DRAIS/drais.env` on Windows) **without reinstalling**; or the build can bundle `build/.env.production`. System env overrides both. Secrets masked in `drais.log`.

## 7. DB mode result
Online TiDB only (no SQLite/offline). Internet required. The fix delivers `TIDB_*` to the server; `/api/health` confirms connectivity at boot and on demand.

## 8. Native module handling
None required (`bcryptjs`, `mysql2`, `pdfkit`, `qrcode`, `xlsx` are pure-JS). `bcrypt@6` is unused → recommend removing from deps. If a native dep is added later: set `asarUnpack` + `nodeGypRebuild` and rebuild for Electron's ABI (note: server runs in Electron's main process, so native ABI must match Electron, not system Node).

## 9. Asset handling
`postbuild-electron.mjs` copies `.next/static` → `standalone/.next/static` and `public` → `standalone/public` (verified present) — so CSS/JS/images load. No `process.cwd()` fragility introduced; main uses `process.resourcesPath` / `app.getPath('userData')`.

## 10. Logs location
`app.getPath('userData')/drais.log` (Windows: `%APPDATA%/DRAIS/drais.log`). Now also captures the in-process server's `console.*`, config source (masked), health results, fatal errors. Reachable via **Help → Open Logs Folder**.

## 11. Build command
`npm run build:electron` (next build + postbuild) then: Windows `npm run dist:win` (or `dist:win:portable`); Linux `npm run dist:linux`; macOS `npm run dist:mac`. Optional: place real `build/.env.production` first.

## 12. Installer output path
`dist/` — e.g. `dist/DRAIS-<version>-x64-win.exe` (NSIS), `DRAIS-<version>-portable.exe`, `DRAIS-<version>-x64.AppImage`, `DRAIS-<version>-x64.dmg`.

## 13. Test results
Verified on this Linux box:
- `/api/health` live → `{ok:true, db:{connected:true}, env:{…masked}}` (and 503 path when DB unset, by construction).
- Config loader: precedence correct (userData overrides bundled; system env overrides both) + secrets masked.
- `electron/config.cjs` + `electron/main.cjs` parse clean; health route lint-clean.
**Not runnable here (needs the OS):** launching the actual Windows/macOS `.exe`/`.dmg` and the Electron BrowserWindow — see acceptance checklist below to run on Windows first.

## 14. Remaining limitations
- Secrets in a bundled `build/.env.production` are extractable from the installer — inherent to a desktop client that connects **directly** to TiDB. Longer-term: route desktop DB access through the DRAIS platform API instead of embedding DB creds. (Architectural, not packaging.)
- Final Windows/macOS acceptance must be run on those OSes (Phase 11 checklist).
- `next/image` optimization runs via the in-process server (works) — consider `images.unoptimized` only if needed.

## 15. Android — separate track
Do **not** ship Android from Electron. Capacitor is already present (`@capacitor/android`); the native Expo edition lives in the sibling repo. Android is its own build pipeline — keep it out of the desktop installer.

---

### Windows-first acceptance checklist (run on Windows)
1. Put real creds in `build/.env.production` (or plan to drop `userData/drais.env`). 2. `npm run dist:win`. 3. Install from `dist/`. 4. Launch → server starts → health passes → **login page loads** (not white/diagnostic). 5. Log in; open Students / Attendance / Reports; export a PDF. 6. Close + relaunch. 7. Confirm `%APPDATA%/DRAIS/drais.log` written; **Help → Open Logs Folder** works. 8. Temporarily blank the DB password → relaunch → **diagnostic screen** (not blank). 9. Restore creds via `userData/drais.env` → **Help → Retry connection** → app loads.
