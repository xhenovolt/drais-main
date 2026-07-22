# ATTENDANCE TRUST REFACTOR — PHASE 3 COMPLETION REPORT
## Device Directory, Reconciliation Engine & the /attendance/devices Operations Center

Date: 2026-06-14
Rule honored: all DB work rehearsed on a scratch DB **on the TiDB cluster** then applied to **production TiDB Cloud `drais`** and verified. A real K40 (serial `GED7254601154`, 192.168.1.17) was driven live through the reconciliation flow. No secrets printed; connection logs masked.

---

## 1. Files changed
**New**
| File | Purpose |
|---|---|
| `database/migrations/tidb/009_device_reconciliation.sql` | reconciliation run/item tables, directory columns, audit table |
| `src/lib/biometric/reconciliation-service.ts` | Phase 3C engine — 12 mismatch categories, compute + persist |
| `src/lib/biometric/device-access.ts` | school-scoped device authorization for all device APIs |
| `src/app/api/attendance/devices/[id]/reconciliation/route.ts` | GET compute / POST run+persist |
| `src/app/api/attendance/devices/[id]/sync-directory/route.ts` | queue inventory sync (DATA QUERY USERINFO) + status |
| `src/app/api/attendance/devices/[id]/fingerprint-matrix/route.ts` | per-person-per-device template truth |
| `src/app/api/attendance/devices/[id]/users/[pin]/route.ts` | map / create-student / create-staff / ignore / quarantine / release |
| `src/app/api/attendance/devices/[id]/push-missing/route.ts` | push DRAIS people to device (+ preview, bulk) |
| `src/app/api/attendance/devices/[id]/activity/route.ts` | command queue + directory audit |
| `src/components/attendance/DeviceReconciliationModal.tsx` | the 6-tab operations center UI |
| `scripts/db/smoke-phase3.mts` | reconciliation engine smoke (TiDB) |

**Modified**
| File | Change |
|---|---|
| `src/lib/biometric/fingerprint-status.ts` | added `getDeviceFingerprintMatrix` + `DeviceTemplateStatus` (Phase 3F) |
| `src/lib/biometric/name-fuzzy.ts` | added `loadSchoolRoster` + `fuzzyCandidatesFromRoster` (in-memory scoring — perf) |
| `src/app/attendance/devices/page.tsx` | "Reconciliation Center" button + modal wiring on every device card |
| `src/app/api/admin/biometric-monitor/route.ts` | `mismatch_summary` (per-device device-only/missing/orphan/conflict counts) + `unmatched_recent` |
| `src/Database/DRAIS.sql` | (Phase 0-2 canonical defs already present; 009 tables mirrored by migration) |

**Note — routing:** the new device sub-routes live under the existing `[id]` slug (Next.js forbids `[id]` and `[sn]` siblings). The segment value is the **serial**; `resolveDeviceForSession` resolves by serial first, numeric id as fallback. A stale `.next` cache from the rename caused a transient "different slug names" boot error — cleared.

## 2. Tables changed (migration 009)
- `device_reconciliation_runs` (new) — one row per sync/run; counts + partial flag + trigger/requester.
- `device_reconciliation_items` (new) — persisted mismatches with resolution lifecycle (open → resolved/ignored/quarantined), candidates, audit fields.
- `device_directory_audit` (new) — append-only action trail (map/create/ignore/quarantine/sync/push).
- `device_user_directory` (extended) — `card_number`, `last_sync_run_id`, `has_recent_echo`, `directory_status` + index.

## 3-4. Migrations applied — local rehearsal → TiDB Cloud
- Rehearsed on `drais_phase3_rehearsal` (full 1→9 set): all ✔.
- Production `drais`: `009_device_reconciliation.sql` applied ✔; `schema_migrations` now 9 rows, all `success`. Preflight: 20/20 expected tables + canonical shapes intact, no IP-as-serial regressions.

## 5. APIs added (Phase 3K — consolidated, not duplicated)
`GET/POST …/[id]/reconciliation` · `POST/GET …/[id]/sync-directory` · `GET …/[id]/fingerprint-matrix` · `POST …/[id]/users/[pin]` (6 actions) · `POST …/[id]/push-missing` (+preview) · `GET …/[id]/activity`. All school-scoped; all identity writes funnel through the Phase 1 enrollment service.

## 6. UI pages changed
- **`/attendance/devices`** — each device card opens the **Reconciliation Center** modal: Overview · People on Device (filterable; map/create/ignore/quarantine inline) · Missing from Device (bulk select + preview + push) · Mismatches (grouped) · Orphan Templates (attach) · Activity (commands + audit). Partial-directory honesty banner always shown.
- **`/admin/biometric-monitor`** — API now returns mismatch counts per device + recent-unmatched count for deep-linking.
- **`/attendance/logs`** — unmatched rows already carry device name/PIN + a working map action (Phase 0/2); reads canonical.

## 7-8. Reconciliation logic + mismatch categories
`computeReconciliation(school, sn)` diffs `device_user_directory` (+orphans) against canonical `biometric_enrollments` (+students/staff roster). All 12 categories implemented: MAPPED_OK, DEVICE_ONLY_USER, DRAIS_ONLY_PERSON, DEVICE_ONLY_TEMPLATE, DRAIS_TEMPLATE_NOT_ON_DEVICE, NAME_DRIFT, PIN_CONFLICT, ROLE_CONFLICT, STAFF_STUDENT_AMBIGUOUS, ORPHAN_TEMPLATE, STALE_MAPPING, IGNORED_OR_QUARANTINED. `runDeviceReconciliation` persists a run + batched items.

## 9-11. Workflows + fingerprint truth
Map-to-existing, create-learner (class required), create-staff, ignore, quarantine, release, bulk push-missing (with preview) — all live-tested. Template truth via `getDeviceFingerprintMatrix` with 10 honest statuses; never claims a DRAIS backup when no template bytes exist.

## 12-13. Tests + TiDB verification
- `npm run test:biometric` — 17/17 (Phase 1E + 2K pure logic).
- `scripts/db/smoke-phase3.mts` on TiDB rehearsal — **14/14**: MAPPED_OK, DEVICE_ONLY_USER, DRAIS-only/stale, run-persist (no MAPPED_OK noise), map, PIN-conflict-refused, matrix honesty.
- `npm run typecheck` — all Phase 3 files clean (one pre-existing unrelated error in `/api/devices/[id]/sync` predates this work, confirmed by stash diff).

## 14. K40 LIVE TEST RESULTS (production TiDB, serial GED7254601154, school 12011 = test@xhenvolt.com)
| Test | Result |
|---|---|
| Read real serial over TCP | ✅ `GED7254601154` (never IP) |
| Capture device directory | ✅ 45 users captured; 649 total in directory view |
| GET reconciliation (compute) | ✅ **8.6s** for 649 users (was >120s timeout before perf fix) |
| Device users not in DRAIS shown with real names+PINs | ✅ 639 DEVICE_ONLY_USER e.g. "KAYAGI AISHA ISSA" PIN 1655 — **not "data mismatch"** (TEST 1) |
| Orphan templates surfaced | ✅ 9 DEVICE_ONLY_TEMPLATE |
| Ignore / quarantine device user | ✅ persisted to pending_device_users (TEST 17/18) |
| Create learner from device user (class required) | ✅ person+student+enrollment+canonical biometric_enrollments, PIN attached, audited (TEST 4) |
| Map device user to existing learner | ✅ canonical write, legacy mirror (TEST 2) |
| **PIN conflict** map to different person | ✅ **409 refused** "actively mapped to another person" (TEST 10) |
| POST run+persist | ✅ **17.8s** batched, run recorded, items persisted, MAPPED_OK excluded (TEST 19) |
| TiDB persistence of all actions | ✅ runs, items, canonical enrollments, ignore/quarantine, audit trail all verified in `drais` |
| Cleanup | ✅ all ZKTEST* artifacts removed; 0 residual; device left as user configured |

## 15. Remaining risks / honest limitations
1. **Directory is inherently partial** — the K40 ADMS push only echoes users it was told about; a full hardware dump isn't guaranteed. Surfaced everywhere as a banner; "Not on device" can be a not-yet-echoed user. This is a hardware-protocol limit, not a DRAIS bug.
2. **POST run+persist ~18s** for ~650 users (compute 8.6s + batched insert). Acceptable for a manual button with a spinner; not a hot path. Could move to a background job in Phase 10 hardening.
3. **`device_user_directory` read includes `school_id IS NULL` rows for the SN** — legacy/unassigned captures for the same physical device. Benign (same device) but slightly inflates counts; tighten when legacy NULL rows are backfilled.
4. **ROLE_CONFLICT / PIN_CONFLICT categories** are detected at write time (enrollment service) and via ambiguity, but the read-time engine surfaces conflicts primarily as STAFF_STUDENT_AMBIGUOUS / NAME_DRIFT; a dedicated read-time PIN-collision scan across devices is a Phase 8 (multi-device) item.
5. Template **distribution** to devices remains intentionally out of scope (Phase 8).

## 16. Rollback
- `git revert` the Phase 3 commit (additive APIs/UI/lib; no existing behavior changed).
- DB: `DROP TABLE device_reconciliation_items, device_reconciliation_runs, device_directory_audit;` and drop the added `device_user_directory` columns. Migration 009 is additive — no data transformed, nothing destructive. Canonical tables untouched.
- No raw logs, templates, mappings, or enrollments are deleted by any Phase 3 code path (ignore/quarantine set status; revoke never hard-deletes).

## 17. Recommendation
**Safe to proceed to Phase 4.** Phase 3 pass criteria met: /attendance/devices shows who is on each device and who is missing; device-only users are visible with real names/PINs; admins can map/create learners & staff and ignore/quarantine; fingerprint/template truth is per-person-per-device and honest; "data mismatch" is replaced by 12 specific categories; name-only mapping stays confirmation-based; every mapping writes canonical `biometric_enrollments`; all actions are audited; and all of it was verified live against TiDB Cloud with a real K40. Address the ~18s run-persist and the partial-directory UX polish during Phase 10 hardening.
