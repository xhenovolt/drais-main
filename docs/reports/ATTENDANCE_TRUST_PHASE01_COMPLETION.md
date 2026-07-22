# ATTENDANCE TRUST REFACTOR — PHASE 0 + PHASE 1 COMPLETION REPORT

Date: 2026-06-12
Scope: Phase 0 (stop the bleeding) + Phase 1 (canonical biometric identity) only.
Out of scope (deliberately untouched): template distribution drainer, SMS policy UI, multi-device sync, device transfer hardening, dashboards.

---

## 1. Files changed

**Modified**
| File | Change |
|---|---|
| `src/app/api/zk-handler/route.ts` | `evaluateDay` import fixed (was TS2304); ATTLOG ingest now `INSERT IGNORE` + duplicate short-circuit (no raw event / popup / engine / fanout on re-sent punches); `autoLinkPinFromName` rewritten to the deterministic policy + pending queue + enrollment service; `processUserInfo` no longer creates phantom people/students and no longer exact-matches with LIMIT 1; `processFingerprint` is canonical-first, handles staff templates, and flips `pending_capture → active` on template arrival; heartbeat now pumps the notification outbox and ensures the devices schema; dead `saveAttendancePunch` (168 lines, never called) deleted; retro-match backfill school-scoped |
| `src/lib/biometric/identity/resolve.ts` | Phase 1D: legacy hits hydrate `person_id` (school-scoped) so the engine gate passes; Phase 1F: strict `school_id = ?` on zk_user_mapping (NULL-school rows no longer attribute); device_user_mappings/device_users school-filtered; hydrated legacy hits auto-promote to canonical (fire-and-forget) |
| `src/lib/biometric/migrations/biometric-enrollments-schema.ts` | Shape detection: OLD pipeline shape → `RENAME TO biometric_enrollments_legacy` (never dropped) → create canonical → backfill resolvable rows; `pending_capture` added to status enum (CREATE + ALTER for existing installs) |
| `src/lib/biometric/template-service.ts` | Added `lookupEnrollmentForCapture` (matches active + pending_capture) and `completeEnrollmentCapture` (the only transition that confirms a fingerprint actually captured) |
| `src/lib/attendance/engine.ts` | `recordRawEvent` → `INSERT IGNORE`, returns null on duplicate so evaluation/eventing is skipped for re-sends |
| `src/lib/attendance/migrations/attendance-tables-schema.ts` | `uk_raw_punch` unique key in CREATE + guarded ALTER for pre-existing tables |
| `src/app/api/device/local-enroll/route.ts` | Phase 1B rewrite: resolves the REAL serial (asks the device via `CMD_OPTIONS_RRQ ~SerialNumber`, falls back to explicit `device_sn` body param, then registered-device-by-IP; rejects with 422 if none — never stores an IP as a serial); writes canonical enrollment `pending_capture` via the enrollment service (mirrors legacy with the real SN); no longer marks COMPLETED before capture; registers the device row; canonical PINs respected in slot allocation; ambiguous device-name slot match no longer steals slots |
| `src/app/api/attendance/zk/user-mapping/route.ts` | POST/PUT route through the enrollment service (canonical + mirror; PIN conflicts → 409 instead of silent rebind); DELETE revokes the canonical enrollment; pre-existing `parseInt(get('page', 10))` bug fixed |
| `src/app/api/attendance/zk/devices/sync-identities/route.ts` | Mapping writes route through the enrollment service; next-PIN computation considers canonical PINs |
| `src/app/api/biometric/orphans/route.ts` | Claim goes through the enrollment service; uses the claimed enrollment for template promotion; closes matching pending_device_users rows |
| `src/app/api/cron/notification-drain/route.ts` | Thinned to a wrapper around the extracted drain core |
| `src/app/attendance/logs/page.tsx` | `urser-mapping` typo fixed — Quick-Assign works again |
| `next.config.ts` | `ignoreBuildErrors` documented as temporary tech debt with the required `npm run typecheck` gate |
| `package.json` | Added `typecheck` and `test:biometric` scripts |
| `src/Database/DRAIS.sql` | Canonical `devices` (ADMS shape — previously defined nowhere), `pending_device_users`, dedup-key documentation, `pending_capture` in the enrollments enum |

**New**
| File | Purpose |
|---|---|
| `src/lib/biometric/enrollment-service.ts` | Phase 1C single write path: school-scoped person resolution, canonical UPSERT, legacy mirror, PIN-conflict refusal, PIN-move handling, revocation, audit logging |
| `src/lib/biometric/name-match-policy.ts` | Pure deterministic name-match policy + IP detector (unit-tested) |
| `src/lib/biometric/pending-device-users.ts` | Triage queue table + record/resolve helpers (replaces phantom creation) |
| `src/app/api/biometric/pending-device-users/route.ts` | GET list / POST map-ignore-quarantine API (map = enrollment service + retro-match + re-classification) |
| `src/app/api/device/local-enroll/status/route.ts` | Truth-based enrollment status poll (pending_capture / active / template count) |
| `src/lib/devices/migrations/devices-canonical-schema.ts` | Reproducible ADMS devices shape; additive ALTERs for old installs |
| `src/lib/notifications/drain.ts` | Extracted outbox drain core + `drainOutboxOpportunistically` (heartbeat-driven, throttled 90s/process — **no new Vercel crons**, per hobby-plan constraint) |
| `database/migrations/020_attendance_trust_phase0_phase1.sql` | Offline migration: dedupe + unique keys, school_id backfill, IP-as-serial repair, manual equivalents of the runtime ensures |
| `src/lib/biometric/__tests__/name-match-policy.test.mjs` | 10 unit tests (all pass) |
| `scripts/verify-attendance-trust.mjs` | Read-only DB verification of all acceptance checks |

## 2. Tables changed
- `biometric_enrollments` — collision resolved (OLD shape renamed to `biometric_enrollments_legacy`, canonical ensured); `pending_capture` status added.
- `devices` — canonical ADMS shape now reproducible; missing columns added additively at runtime.
- `zk_attendance_logs` — UNIQUE `uk_punch (device_sn, device_user_id, check_time)` (via migration 020).
- `attendance_raw_events` — UNIQUE `uk_raw_punch (school_id, device_sn, device_user_id, punch_at, source)`.
- `pending_device_users` — new (lazy + canonical SQL).
- `zk_user_mapping` — data backfill (school_id, IP-as-serial repair) via migration 020; no schema change; never hard-deleted by any new code path (DELETE route behavior unchanged for the legacy row, canonical rows are revoked, not deleted).

## 3. Migrations added
- Runtime (automatic, idempotent, per-process gated): enrollments shape detect/rename/backfill; pending_capture enum; devices columns; uk_raw_punch ALTER; pending_device_users CREATE.
- Offline: `database/migrations/020_attendance_trust_phase0_phase1.sql` (required for the dedup keys on populated databases).

## 4. Routes changed
Changed: `/api/zk-handler` (+ `/iclock/*`), `/api/device/local-enroll`, `/api/attendance/zk/user-mapping`, `/api/attendance/zk/devices/sync-identities`, `/api/biometric/orphans`, `/api/cron/notification-drain`.
New: `/api/device/local-enroll/status`, `/api/biometric/pending-device-users`.

## 5. Old behavior → 6. New behavior
| Old | New |
|---|---|
| Punch resolved via zk_user_mapping → no person_id → engine skipped → no attendance_records, no fanout | Legacy hits hydrate person_id (school-scoped) → `evaluatePunch` runs → classified `attendance_records` + `attendance.record.upserted` for **every** matched punch |
| Local enroll stored device IP as device_sn; marked COMPLETED before capture | Real serial resolved (device-queried → explicit → registry); canonical `pending_capture` enrollment; completion only when the template arrives; status poll endpoint |
| Two same-named learners: first row LIMIT 1 mapped the PIN forever; unknown names created phantom people/students | Deterministic-only auto-map (full score, no plausible runner-up); ties and weak matches → `pending_device_users` for operator triage; phantom creation removed entirely |
| Device ATTLOG re-sends created duplicate log rows, raw events, popup events, counts | UNIQUE keys + INSERT IGNORE + downstream short-circuit: one punch, once |
| Notification outbox never drained (no cron; hobby plan can't add one) | Device heartbeats pump the drain (throttled, fire-and-forget); cron endpoint kept for external schedulers |
| `evaluateDay` ReferenceError silently swallowed after auto-link | Imported; post-link day re-evaluation works |
| zk_user_mapping `school_id IS NULL` rows attributed punches cross-school | Strict school scoping; NULL-school rows surface as unmatched/pending instead |
| PIN held by person A could be silently rebound to person B by several writers | Enrollment service refuses active-PIN rebinds (409 / pending queue) |

## 7-8. Tests added & passed
- `npm run test:biometric` — 10/10 pass (deterministic policy: same-name ambiguity [TEST 4], unknown-name no-create [TEST 5], 0.6-score regression, IP-as-serial guard [TEST 1 invariant]).
- `npm run test:attendance` — 20/20 pass (pre-existing rule-evaluator suite, unaffected).
- `npm run typecheck` — all modified/new files clean; repo-wide count reduced by the fixed TS2304 (remaining 415 errors are pre-existing legacy debt outside the attendance module).
- `scripts/verify-attendance-trust.mjs` — DB-side acceptance checks (TESTS 2, 3, 6, 7 verification queries; engine-gate gap metric) — **run after deploy** (no DB access from this workstation).

## 9. Remaining risks
1. `CMD_OPTIONS_RRQ ~SerialNumber` reply parsing is firmware-dependent; if a model answers oddly, local-enroll falls back to explicit `device_sn`/registry-by-IP, or rejects with a clear 422 (safe failure — never an IP write).
2. The pending_capture flip depends on the device pushing the template via ADMS (OPERLOG/TEMPLATEV10). On devices with ADMS disabled, enrollments stay pending_capture (visible in the status endpoint) — correct but needs operator awareness.
3. Auto-promotion + heartbeat drain are per-instance throttled on serverless; both are idempotent and race-safe (canonical UNIQUE key; queued→sending claim), so the cost of extra invocations is bounded.
4. Pre-deploy matched punches with NULL person_id in `attendance_raw_events` are not retro-classified automatically; the verify script reports the gap, and re-mapping any PIN via UI/pending-queue re-runs its days.
5. The pending_device_users triage currently has API + data only — no dedicated page yet (the unassigned/mapping pages are the interim surface; UI is Phase 3 scope).
6. If duplicate rows exist, the runtime ALTER for `uk_raw_punch` fails harmlessly until migration 020 §0 is applied — duplicates keep flowing in until then.

## 10. Manual deployment steps
1. Backup the database.
2. Apply `database/migrations/020_attendance_trust_phase0_phase1.sql` §0.1–0.2 (dedupe + unique keys) — required.
3. Run §1.2 (school_id backfill) and §1.3 (IP-as-serial repair); review the listed leftover rows.
4. Deploy the app. First boot auto-handles: enrollments shape rename/backfill (if OLD shape), pending_capture enum, devices columns, pending_device_users.
5. Run `node --env-file=.env.local scripts/verify-attendance-trust.mjs` — expect 0 FAIL.
6. Optional: point an external scheduler (cron-job.org, school server) at `/api/cron/notification-drain?secret=$CRON_SECRET` as a backup pump; **do not add vercel.json crons** (hobby plan).

## 11. DB verification queries
The verify script automates these; key spot-checks:
```sql
-- canonical shape + enum
SHOW COLUMNS FROM biometric_enrollments LIKE 'pin_value';
SHOW COLUMNS FROM biometric_enrollments LIKE 'status';
-- dedup keys
SHOW INDEX FROM zk_attendance_logs WHERE Key_name='uk_punch';
SHOW INDEX FROM attendance_raw_events WHERE Key_name='uk_raw_punch';
-- no IP-as-serial
SELECT COUNT(*) FROM zk_user_mapping WHERE device_sn REGEXP '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$';
-- engine gate closing (should trend to 0 for post-deploy punches)
SELECT COUNT(*) FROM attendance_raw_events ar
 WHERE ar.matched=1 AND ar.person_id IS NOT NULL
   AND ar.punch_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
   AND NOT EXISTS (SELECT 1 FROM attendance_records r
                    WHERE r.person_id=ar.person_id AND r.attendance_date=DATE(ar.punch_at));
-- pending triage queue
SELECT status, COUNT(*) FROM pending_device_users GROUP BY status;
```

## 12. Rollback instructions
- Code: `git revert` the commit(s) — no destructive data dependency.
- `ALTER TABLE zk_attendance_logs DROP INDEX uk_punch;` / `ALTER TABLE attendance_raw_events DROP INDEX uk_raw_punch;` (deduped rows are gone but raw forensic truth in `zk_raw_logs` is untouched).
- If the shape migration ran: `RENAME TABLE biometric_enrollments TO biometric_enrollments_canonical_unused, biometric_enrollments_legacy TO biometric_enrollments;`
- Legacy mapping tables were never dropped or hard-deleted; canonical rows use status='revoked' rather than deletion; no raw logs or template bytes are deleted anywhere in this change.
- Per-school fallback already exists: the resolver's `legacyFallback` remains ON, so even with canonical data absent, attribution continues via the (now hydrated, school-scoped) legacy chain — with the fallback path logged (`PHASE1_LEGACY_PATH_HIT`).
