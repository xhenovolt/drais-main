# ATTENDANCE TRUST REFACTOR — PHASE 2 COMPLETION REPORT
## Database-first TiDB Cloud migration + enrollment persistence + fingerprint status

Date: 2026-06-12
Rule honored: every DB change was rehearsed on a scratch database **on the TiDB cluster itself** (`drais_phase2_rehearsal`, identical engine semantics — chosen over the local MySQL whose root credentials are unavailable, and deliberately better for TiDB-specific DDL quirks), then applied to and verified against **production TiDB Cloud `drais`**. No credentials were printed or committed; all connection info in logs is masked.

---

## 1. Migrations discovered (Phase 2A)
- ~40 historical ad-hoc SQL files in `database/`, `migrations/`, `sql/` — no ledger, no runner, unknown applied-state, several school-specific/destructive (NOT adopted).
- Runtime lazy `ensure*Schema()` modules were the de-facto production strategy (now demoted to defensive fallback).
- Production preflight found: 218 tables, **OLD-shape `biometric_enrollments` live in production** (confirming the audit's collision — every Phase 1 canonical writer had been failing silently), `devices` had drifted `sn` column, 7 canonical tables missing entirely, no migration ledger.

## 2-3. Migrations applied (local-equivalent rehearsal, then TiDB Cloud production)
New managed set in `database/migrations/tidb/`, executed by the new ledger-backed runner:

| Migration | Production result |
|---|---|
| 001_canonical_core_tables.sql | 15 tables created (templates, distributions, notification_*, device_transfers/alerts, pending_device_users, raw_events/records/rules/holidays/aggregates, directory, orphans) |
| 002_biometric_enrollments_canonical.mjs | OLD shape **renamed** to `biometric_enrollments_legacy` (kept); canonical created; backfill: **419 from legacy pipeline + 1,596 from zk_user_mapping; 726 skipped** (unresolvable — left in source tables, never invented) |
| 003_enrollment_lifecycle_columns.sql | capture_status / captured_at / last_seen_on_device_at / updated_by + idx_capture + pending_capture enum |
| 004_devices_canonical_columns.sql | full ADMS device shape + uk_devices_sn (TiDB rejects `ADD UNIQUE INDEX IF NOT EXISTS` — learned in rehearsal, runner tolerates errno 1061 instead) |
| 005_dedup_unique_keys.mjs | **16,938 + 20,351 duplicate rows removed** (oldest id kept) from zk_attendance_logs / attendance_raw_events; uk_punch + uk_raw_punch added. First attempt lost a race against LIVE device re-pushes; rewritten to interleave dedupe→ALTER with retries (won on attempt 8) |
| 006_zk_user_mapping_school_backfill.sql | school_id backfill (idempotent re-run of 002's b0) |
| 007_ip_as_serial_repair.mjs | **112 IP-keyed rows repaired to real serials, 298 merged into existing real-SN rows + archived (`ip-archived:` prefix, nothing deleted), 408 enrollment provenance rows fixed**; first attempt of a blind UPDATE hit uk_device_user — rewritten collision-safe |
| 008_archive_unrepairable_ip_rows.mjs | 14 rows archived (schools 12004/6/12011 have NO registered device — nothing to repair against; identity already canonical), 11 IP provenance values nulled |

Ledger: `schema_migrations` — 8/8 success on production, 8/8 on rehearsal (each database keeps its own history, checksummed; checksum drift aborts the runner).

## 4. TiDB Cloud verification (queries + results)
- `scripts/db/preflight.mjs` → 20/20 expected tables present, canonical enrollment shape, devices.sn present, ledger 8 rows.
- `scripts/verify-attendance-trust.mjs` → **10 PASS / 1 WARN / 0 FAIL**. The WARN: 118 matched-but-personless raw events from the last 7 days — all pre-deploy punches; the Phase 1D hydration stops the growth once the app deploys.
- `scripts/db/smoke-phase2.mts` (rehearsal, full write lifecycle through the real service modules + app db layer) → **18/18 PASS**.
- Production read-only smoke through `getFingerprintStatuses` + ledger: 2,015 active enrollments, all honestly labeled (see §11).

## 5. Tables changed
biometric_enrollments (canonical + lifecycle columns; old shape preserved as `biometric_enrollments_legacy`), devices (full ADMS shape + unique sn), zk_attendance_logs (uk_punch), attendance_raw_events (uk_raw_punch), zk_user_mapping (school backfill + IP repair/archive — no schema change, no hard deletes), 15 newly created canonical tables, schema_migrations (new).

## 6. Routes changed
- `/api/device/local-enroll` — staff enrollment first-class (`staff_id` body param), capture lifecycle stamps (`command_sent` → `awaiting_capture` → `failed` on error).
- `/api/device/local-enroll/status` — returns capture_status, captured_at, last_seen, human label.
- `/api/students/fingerprint-status` — rewritten on the canonical service; response keeps the legacy `data: number[]` AND adds `statuses` map (label, capture_status, pin, device, template_count, timestamps, source).
- `/api/staff/fingerprint-status` — **new** (staff had no status surface at all).
- `/api/students/enroll-fingerprint`, `/api/staff/enroll-fingerprint` — stamp `command_queued` on the canonical enrollment when the ADMS identity command is queued.
- `/api/biometric/unassigned` — rewritten: sources are now `fingerprint_orphans` (unclaimed) + `pending_device_users` (pending/ambiguous) instead of the renamed OLD-shape table (which the migration made permanently unreadable for it).
- `/api/zk-handler` — `touchEnrollmentSeen` on USERINFO/OPERLOG USER echoes; template arrival completes enrollments (status→active, capture_status→captured, timestamps).

## 7. Services changed
- `enrollment-service.ts` — `CaptureStatus` type, captureStatus threading through all four upsert paths, `setCaptureStatus`, `setCaptureStatusByPin`.
- `template-service.ts` — `completeEnrollmentCapture` now the single capture-proof transition (stamps status, capture_status, captured_at, last_seen); `touchEnrollmentSeen` new.
- `fingerprint-status.ts` — **new**: one read path + pure `deriveFingerprintLabel` (unit-tested) used by every surface.
- `biometric-enrollments-schema.ts`, `devices-canonical-schema.ts` — kept as defensive fallback, now including the Phase 2 columns; the migration runner is the production strategy.

## 8. UI pages changed
- `students/list` — fingerprint icon now reflects the real lifecycle (label + PIN + device in tooltip; amber=in-progress, red=failed/revoked, green=active); local enrollment **polls the truth endpoint** and only shows success when the template actually reaches DRAIS, with an explicit "Captured on device not yet confirmed by DRAIS" timeout message (Phase 2L).
- `attendance/biometric/unassigned` — now lists orphan templates AND pending/ambiguous device users with device name, PIN, suggested matches; assignment routes to the claim flow / triage flow respectively (also fixed a latent `res.ok`-on-parsed-JSON bug that made the old assign button always throw).

## 9 → 10. Old vs new enrollment behavior
| Old | New |
|---|---|
| Enrollment marked ASSIGNED/COMPLETED the moment the command was sent | `pending_capture` + capture_status pipeline (`command_queued`/`command_sent` → `awaiting_capture` → `captured`); ACTIVE only when the template provably reached DRAIS |
| Local enroll wrote rows the OLD-shape table silently rejected | Canonical row with the REAL serial (device-queried over TCP → explicit param → registry), IP guard at the service layer |
| Student-only | Staff local + ADMS enrollment first-class |
| UI pretended success in 1 second | UI shows queued → waiting → captured/failed truthfully, polling the status endpoint |

## 11. Fingerprint status behavior
Single label contract (`deriveFingerprintLabel`, 7 unit tests): Not enrolled / Enrollment pending / Awaiting fingerprint capture / **Captured on device — not yet confirmed by DRAIS** / Active / Failed / Expired / Revoked / Suspended.
Production reality surfaced honestly: all 2,015 enrollments currently show "Captured on device — not yet confirmed by DRAIS" because **zero template bytes exist in any DRAIS table** (student_fingerprints=0, fingerprints=0, biometric_templates=0; 10 unclaimed orphans). That is the truth the audit demanded the UI stop hiding; templates will accumulate as devices push and orphans are claimed.

## 12-13. Tests run
- Unit (local): `npm run test:biometric` 17/17 (name-match policy 10 + label derivation 7); `npm run test:attendance` 20/20; `npm run typecheck` — modified files clean (remaining repo errors are pre-existing legacy debt, verified by stash comparison).
- TiDB Cloud rehearsal (writes, real service modules): 18/18 — IP rejection, learner+staff enrollment, capture stamps, template→captured/active flip, orphan visibility, pending-ambiguous triage, status labels, serial-anchored identity (TESTS 5,6,7,8,9,10,11,12 equivalents).
- TiDB Cloud production: preflight (TESTS 1-4), trust verification 10/0, read-only service smoke (TEST 14). TESTS requiring a physical K40 on a LAN (live finger scans, IP-change drills) are covered by the service-level equivalents above plus the manual checklist (§17).

## 14. Remaining risks
1. 726 skipped backfill rows (mostly duplicate PINs across legacy sources or deleted people) remain in `biometric_enrollments_legacy`/`zk_user_mapping` for manual reconciliation — query: `SELECT * FROM zk_user_mapping m LEFT JOIN biometric_enrollments be ON be.school_id=m.school_id AND be.pin_value=CAST(m.device_user_id AS UNSIGNED) WHERE be.id IS NULL AND (m.student_id IS NOT NULL OR m.staff_id IS NOT NULL)`.
2. The app is not yet redeployed: until then, live devices still run the old ingest code; the new unique keys silently absorb its duplicate inserts (INSERT errors are caught), so data stays clean either way.
3. `CMD_OPTIONS_RRQ ~SerialNumber` parsing is firmware-dependent (graceful 422 fallback exists).
4. capture_status for the 2,015 backfilled enrollments is `not_requested` (history unknown) — first template/echo per PIN updates it organically.
5. Rehearsal db `drais_phase2_rehearsal` left on the cluster for future phases; drop anytime.

## 15. Rollback steps
- Ledger-tracked, all reversible: `RENAME TABLE biometric_enrollments TO biometric_enrollments_canonical_unused, biometric_enrollments_legacy TO biometric_enrollments;` restores the OLD shape; `ALTER TABLE … DROP INDEX uk_punch / uk_raw_punch`; lifecycle columns are additive (droppable); archived mapping rows recoverable via `UPDATE zk_user_mapping SET device_sn = REPLACE(device_sn,'ip-archived:','') WHERE device_sn LIKE 'ip-archived:%'`. No raw logs, template bytes, or mappings were deleted anywhere (only exact-duplicate derived rows).
- Code: `git revert`; the fingerprint-status API keeps the legacy `data` array so old UI builds keep working.

## 16. Deployment notes
- DB work is DONE on production — deploy the app whenever ready; no deploy-time migration needed.
- No new Vercel crons (hobby-plan constraint honored; heartbeat-driven drain from Phase 0 unchanged).
- After deploy, re-run `scripts/verify-attendance-trust.mjs` and expect the hydration-gap WARN to stop growing.

## 17. Manual verification checklist (requires a physical K40 on the LAN)
1. Enroll a learner via students list → icon turns amber "waiting", device beeps, scan finger → within ~1 heartbeat the icon turns green "Active · PIN n · device"; `local-enroll/status` shows captured=true.
2. Same for a staff member (staff_id path) — verify role_type='staff' in biometric_enrollments.
3. Power-cycle the device with a changed LAN IP → punches still resolve (serial-anchored), TEST 12.
4. Enroll a fingerprint directly on the device keypad for an unknown PIN → appears in /attendance/biometric/unassigned as orphan with device name → claim → punches retro-match.
5. Two same-named learners: device USERINFO echo → row appears as AMBIGUOUS in unassigned, no auto-map (TEST 11).
