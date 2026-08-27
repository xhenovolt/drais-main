# DRAIS — Build & Release Pipeline

GitHub Actions pipeline that turns a `vX.Y.Z` tag into downloadable desktop
and Android release artifacts. iOS is a readiness report only because no iOS
Capacitor project exists in this repository.

## 1. Audit summary (what's in the repo)

| Area | Finding |
|------|---------|
| Desktop framework | **Electron 33 + electron-builder 25** (`electron/main.cjs`, `electron/preload.cjs`, `electron/config.cjs`) |
| App server | **Next.js 15, `output: 'standalone'`** — packaged under `resources/standalone`, booted by `main.cjs` |
| Builder config | `electron-builder.yml` (NSIS+portable / AppImage+deb / dmg+zip / snap) |
| Local build cmd | `npm run build:electron` (`next build` + `scripts/postbuild-electron.mjs`) |
| Local package cmds | `dist:win`, `dist:linux`, `dist:mac`, `dist:snap` |
| Native modules | **None** (bcryptjs, mysql2, node-zklib are pure JS) → no node-gyp/Python/VS toolchain needed (`npmRebuild: false`) |
| Icons | `build/icon.png` (512×512) present; `.ico`/`.icns` auto-generated from it |
| Lockfile | `package-lock.json` tracked → CI uses `npm ci` |
| Node | `engines.node = 24.x` → CI pins Node 24 |
| Mobile (Android) | **Capacitor 8 + nodejs-mobile**, `android/` project committed (gradlew, build.gradle), `capacitor.config.ts`, `scripts/build-mobile.mjs` → debug APK is buildable (experimental) |
| Mobile (iOS) | **No `ios/` project** → readiness report only |
| Existing workflows | `release-all.yml` is the tagged-release entry point; desktop and Android workflows remain manual fallbacks |
| Runtime config | env-based (`.env.production` bundled if present, else `userData/drais.env` / system env) |

## 2. Workflows

- **`.github/workflows/release-all.yml`** — one tagged/manual workflow for Windows x64, Linux x64, macOS x64, macOS arm64 and Android debug APK. Tagged runs create one draft GitHub Release after all required artifact jobs complete. Manual runs upload artifacts only.

- **`.github/workflows/build-desktop.yml`** — manual desktop-only fallback.
- **`.github/workflows/build-android.yml`** — manual Android-only fallback.

## 3. Config changes

- `electron-builder.yml`: `win.icon` and `mac.icon` switched from the **missing** `build/icon.ico` to `build/icon.png` (electron-builder generates `.ico`/`.icns` from the 512×512 PNG). This prevents a hard "icon not found" failure in CI. Nothing else changed; all existing targets/behaviour preserved.
- No package.json scripts changed — the existing `build:electron` / `dist:*` / `mobile:*` scripts are reused as-is.

## 4. Desktop targets produced

| OS | Targets | Example artifact (v1.48.0) |
|----|---------|----------------------------|
| Windows | NSIS installer + portable | `DRAIS-1.48.0-x64-win.exe`, `DRAIS-1.48.0-portable.exe` |
| Linux | AppImage + deb (+ snap, best-effort) | `DRAIS-1.48.0-x64.AppImage`, `DRAIS-1.48.0-amd64.deb`, `DRAIS-1.48.0-amd64.snap` |
| macOS | dmg + zip | `DRAIS-1.48.0-arm64.dmg` (+ x64 on Intel runners), `…-arm64.zip` |

(Artifact names come from `electron-builder.yml` `artifactName` and already include product name, version and arch.)

## 5. Android readiness — **READY (experimental)**

Base exists, so `build-android.yml` is a real build, not a stub. It produces an
**unsigned debug APK**. Expect first-run tuning around the nodejs-mobile native
runtime and Gradle. To make it release-grade later, add signing (see secrets).

## 6. iOS readiness — **NOT READY (no project)**

There is no `ios/` Capacitor project. To enable iOS later:
1. `npx cap add ios` (generates the Xcode project) and commit it.
2. Provide an Apple Developer account + signing assets (secrets below).
3. Add a `build-ios.yml` on `macos-latest` (Xcode build → `xcodebuild -exportArchive`).
Unsigned **simulator** builds are possible for testing without a paid account; a
distributable **`.ipa`** requires signing. No iOS workflow is created until the
project and a signing strategy exist.

## 7. Required GitHub secrets (none needed for current unsigned builds)

Add later, under **Repo → Settings → Secrets and variables → Actions**:

| Purpose | Secrets |
|---------|---------|
| Windows code signing | `WINDOWS_CERTIFICATE_PFX` (base64), `WINDOWS_CERTIFICATE_PASSWORD` |
| macOS signing/notarize | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Android release signing | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |
| iOS signing | `APPLE_TEAM_ID`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `IOS_CERTIFICATE_P12`, `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE` |
| App runtime config (optional) | `API_BASE_URL`, `DRAIS_MODE`, etc. — wire into the build step env if you want them baked in |

`GITHUB_TOKEN` is provided automatically; no PAT needed for releases.

## 8. How to cut a release

```bash
# from an up-to-date main
git tag v1.48.0
git push origin v1.48.0
```

That triggers `release-all.yml`, which builds all available desktop and Android
targets and creates a **draft** GitHub Release with the artifacts attached. Review it under
**Releases**, then click **Publish**. Re-running: delete the tag
(`git push origin :v1.48.0`) and re-push, or use **Actions → Build Desktop → Run
workflow** (manual).

Manual artifact run: **Actions → Release All Platforms → Run workflow**.
Desktop-only fallback: **Actions → Build Desktop → Run workflow**.
Android-only fallback: **Actions → Build Android (debug APK) → Run workflow**.

## 9. Remaining limitations

- All desktop builds are **unsigned** → Windows SmartScreen warning, macOS
  Gatekeeper block ("unidentified developer", right-click → Open to bypass).
  Add signing secrets to remove these.
- macOS dmg is unsigned and **not notarized**.
- Android APK is **debug/unsigned** and experimental (nodejs-mobile chain may
  need tuning on the first CI run).
- iOS: no project yet — readiness report only.
- The pipeline assumes `next build` succeeds without runtime DB access (true
  today — API routes are dynamic).
