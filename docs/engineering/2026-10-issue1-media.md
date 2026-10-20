# Issue 1 — Offline image / media management (result)

Baseline: `2026-10-directive-baseline.md` § Issue 1. Labels as there; test outcomes are PASS / PARTIAL / FAIL / NOT VERIFIED / BLOCKED.

## What changed

**Storage model** (`src/lib/media/`)
- Media root `DRAIS_MEDIA_ROOT` or `~/.drais/media` — outside `public/`, so it is writable inside a packaged exe.
  Per school: `<root>/<schoolId>/manifest.json` (DB reference → local file, sha256, size, origin, time) and `files/…`.
  Manifest and config writes are atomic (temp file + rename) and serialised per school.
- References stay what they are in the database. Kinds (`refs.ts`): `cloudinary`, `remote`, `legacy` (`/uploads/`, `/offline-photos/`),
  `managed` (`media://<schoolId>/<path>`, only ever on this machine), `data`, `empty`, `unknown`.
- Policy per school (`config.json`): `cloud` | `local-first` | `local-only`. Default: `local-first` in local DB modes, `cloud` online.
  Hosted builds (no `DRAIS_ALLOW_LOCAL`) are always `cloud` — production behaviour is unchanged.
- **Online DB rows are never rewritten.** The only DB write is a `media://` reference on a LOCAL database for a person who had
  no photo (folder mapping or offline upload); `setPersonPhotoRef` refuses in online mode.

**Serving** — `GET /api/media/file?ref=` (any signed-in session of the school): serves the local copy; under `local-first` falls back to a
302 to the original URL; under `local-only` returns 404 rather than reaching the internet. Another school's ref → 403;
path traversal / symlink escape → 404 (`safe-path.ts`, realpath containment).

**Client** — `<MediaImg>` / `useMediaSrc()` (`client.ts`). Cloud mode returns the reference unchanged (no extra hop, same as before);
local mode routes through `/api/media/file`. 59 `<img>` tags in 48 files plus the DRCE header/signature/info blocks and
print HTML (`withPrintableMedia`) now resolve through it.

**Uploads** — all seven upload routes call `storeImage()` (`upload.ts`): Cloudinary when the policy is `cloud`, otherwise the local store.
Fixed on the way: `staff/add` never saved the photo (now stored; response has `photo_saved`); `students/upload-photo` and
`bulk-photo-map` updates now carry `AND school_id = ?`; `bulk-photo-map` auto-links only unambiguous matches; `students/full`
stores the photo only after authorisation.

**Settings → Photos & Media** (`/settings/media`, permission `system.settings.manage`, inventory `system.school.view`):
inventory by status, policy switch, "copy cloud photos to this computer" (batches of 20, per-file failure reasons),
photo-folder mapping (scan → review → apply; exact identifier match only — admission no., staff no. or DRAIS id, never names;
ambiguous files listed for a human), and ZIP export with `manifest.json` + `manifest.csv`. Folder choice uses the native picker
in the desktop app (`draisDesktop.pickFolder`). Folder paths are validated (no drive roots, system folders or the app folder).
All config/localize/folder/export actions are audited. All strings are in `mediaSettings.*` with Arabic.

**Startup fix** — `src/instrumentation.ts` now imports the Node-only body from `instrumentation-node.ts`
(webpack failed resolving `node:crypto` for the edge bundle via `read-drs`).

## Verification

| # | Test | Result | Evidence |
|---|---|---|---|
| U1 | Unit: refs, safe paths, folder validation, matching rules, ZIP writer | PASS | `npm run test:media` — 13/13 |
| U2 | Unit: policy defaults, resolve, localize, cross-school refusal | PASS | same |
| E1 | HTTP, local-sqlite copy of school 8002: mode, login, default policy, inventory | PASS | `.ops-work/e2e-media.mjs` T0–T3 |
| E2 | Legacy ref → 302 under local-first; missing file → 404 | PASS | T4, T5 |
| E3 | Localize saved 42 files; managed file served `image/jpeg` | PASS | T6, T7 |
| E4 | `local-only` never redirects to the cloud | PASS | T8 |
| E5 | Other school's ref 403; traversal 404; unauthenticated 401 | PASS | T9, T10, T12 |
| E6 | Export: valid ZIP, 375 files + 175 skipped listed, school 8002 only | PASS | T11 (121 MB) |
| E7 | Real local MySQL (XAMPP, 931 people): local-first default, 3×20 localized, 0 failures; under local-only the localized refs come from disk, an un-copied one is `missing/no_local_copy` | PASS | `.ops-work/e2e-localmysql.ts` |
| C1 | Client resolver: local mode routes cloud/legacy/managed refs through the API; cloud mode passes through unchanged; placeholders untouched | PASS | `.ops-work/mediaimg-check.mjs` |
| R1 | i18n and snapshot suites unchanged | PASS | `test:i18n` 34/34, `test:snapshots` 6/6 |
| B1 | Full app in a browser with the internet blocked renders photos from disk | NOT VERIFIED | dev server unstable under puppeteer (chunk timeouts); to run on the packaged build in Issue 4 |
| B2 | Folder-mapping flow end to end in the browser | NOT VERIFIED | service + API covered by U1/E-tests; UI click-through pending |
| O1 | Online regression: an upload in `cloud` policy still lands in Cloudinary | NOT VERIFIED | code path unchanged (`storeImage` → `uploadStudentPhoto`); not exercised live to avoid writing to production storage |

## Limitations (known, deliberate)
- The 204 legacy `/uploads/...` production references are broken online too; nothing here can recover files that were never deployed.
- Local copies are per machine. Two desktops of the same school each copy their own; export/import of the ZIP is the transfer path.
- A `media://` reference written to a local DB has no meaning online; sync of such photos back to the cloud is not built.
- Cloudinary URLs that the school later deletes in Cloudinary remain served from the local copy (by design: offline first).
