# DRAIS ATTENDANCE TRUST AUDIT — Forensic Report & Implementation Roadmap

Date: 2026-06-12
Scope: ZKTeco biometric lifecycle, device sync, attendance persistence, classification, SMS/notification, UI routes.
Method: every claim below references an actual file, route, function, table, or query in this repository. No speculation. Where a claim depends on runtime database state that cannot be inspected from the repo, it is explicitly marked **[DB-VERIFY]**.

---

## 1. EXECUTIVE TRUTH STATEMENT

**DRAIS attendance is currently NOT TRUSTED.**

Not because the architecture is missing — a surprisingly complete phased architecture exists (canonical identity table, raw-event journal, rule evaluator, notification outbox, template distribution queue, device transfer service). It is not trusted because **the phases were never stitched together**. The system is two generations of architecture running side by side, with the new generation receiving data only on a narrow happy path, and at least five verified breaks where data silently stops flowing:

1. The **SMS trigger is dead code** — the only call site is a function that is never invoked ([§4.1](#41-the-dead-sms-path)).
2. The **classification engine is skipped** for every punch resolved through the legacy mapping tables — which is the majority path, because the auto-linker, the local TCP enroller, and the mapping UI all write only legacy tables ([§4.2](#42-the-engine-gate)).
3. The repo contains **two incompatible schemas for `biometric_enrollments`** and **two incompatible schemas for `devices`**; in any given database only one shape can exist, so one set of writers is silently failing in every deployment ([§3.2](#32-conflicting-table-definitions)).
4. The **local TCP enrollment writes the device IP into `device_sn` columns**, making its mappings invisible to the ADMS punch resolver, which keys by real serial number ([§5.2](#52-the-ip-vs-serial-identity-split)).
5. The handler file contains a **verified compile error** (`evaluateDay` used but not imported, TS2304) that ships to production because `next.config.ts` sets `ignoreBuildErrors: true` ([§4.3](#43-verified-compile-error-shipping-to-production)).

The result matches every user-observed symptom: enrollment "works" but the popup says Unrecognized, the popup shows scans that never become permanent classified attendance, `/attendance/logs` and the biometric monitor disagree, SMS never fires, and nothing detects device drift.

---

## 2. CURRENT ARCHITECTURE MAP (AS BUILT, VERIFIED)

```
ZKTeco device (ADMS push, /iclock/* → rewrite → /api/zk-handler)
  │
  ├─ GET  (heartbeat) ──► upsertDevice → devices (sn-keyed, NO canonical schema!)
  │                       device_heartbeats, system_logs, zk_raw_logs
  │                       updateDeviceSyncState → device_sync_state (count proxy only)
  │                       getPendingCommand → zk_device_commands (C:id:cmd reply)
  │
  ├─ POST table=ATTLOG ──► zk_raw_logs (mandatory, raw-first)
  │     │                  zk_parsed_logs (per line)
  │     │                  resolveUser → resolveIdentity()        [src/lib/biometric/identity/resolve.ts]
  │     │                     1. biometric_enrollments (canonical, pin_value+school)
  │     │                     2. legacy: zk_user_mapping → device_user_mappings → device_users
  │     │                  zk_attendance_logs  (legacy truth — NO dedup key)
  │     │                  attendance_raw_events (canonical journal — NO dedup key)
  │     │                  evaluatePunch(rawEventId)  ◄── ONLY IF matched && personId  ← BREAK #2
  │     │                     └─ evaluateDay → attendance_rules + holidays
  │     │                        → rule-evaluator.ts (pure) → attendance_records (UPSERT)
  │     │                        → publishEvent('attendance.record.upserted')
  │     │                           └─ notifications/fanout.ts → notification_policies
  │     │                              → notification_outbox  ◄── DRAINER NEVER SCHEDULED ← BREAK #3
  │     │                  publishEvent('attendance.event.recorded') → SSE live popup
  │     │                  ✗ notifyAdmsAttendance NEVER called (dead saveAttendancePunch) ← BREAK #1
  │     │
  ├─ POST table=OPERLOG ─► FP lines → processFingerprint → student_fingerprints
  │                          └─ lookupActiveEnrollment(pin) → biometric_templates
  │                             → template_distributions (queue with NO drainer)
  │                          └─ unmapped PIN → fingerprint_orphans (lazy table)
  │                        USER lines → device_user_directory + autoLinkPinFromName (fuzzy)
  │                          └─ writes zk_user_mapping ONLY (legacy)  ← feeds BREAK #2
  │
  └─ POST table=USERINFO ► processUserInfo → device_user_directory
                            exact-name match (LIMIT 1, no ambiguity guard)
                            → or fuzzy autolink → or CREATE phantom people+students rows

UI readers (THREE different truths):
  /attendance (dashboard)        → /api/attendance/zk/dashboard   → zk_attendance_logs
  /admin/biometric-monitor       → /api/admin/biometric-monitor   → zk_attendance_logs
  live popup + SSE               → /api/attendance/live-scan, /api/attendance/stream → zk_attendance_logs
  /attendance/logs               → /api/attendance/history        → attendance_raw_events
  reports/aggregates             → attendance_records / attendance_daily_aggregates
```

There is **no route at `/attendance/biometric-monitor`** — the monitor page is `src/app/admin/biometric-monitor/page.tsx`. Users comparing "the monitor" with `/attendance/logs` are comparing `zk_attendance_logs` against `attendance_raw_events`/`attendance_records` — two pipelines that are only consistent on the canonical happy path.

---

## 3. DATABASE REALITY AUDIT

### 3.1 Table inventory

| Table | Canonical schema file | Lazily created | Writers | Readers | Class |
|---|---|---|---|---|---|
| `devices` (ADMS shape: `sn`, `ip_address`, `push_version`, `is_online`, `deleted_at`) | **NONE — no SQL file defines this shape** | No (assumed pre-existing) | zk-handler `upsertDevice` (route.ts:556), transfer-service | nearly every attendance route | device registry |
| `devices` (integration shape: `device_name`, `device_type`, `device_ip`, **no `sn`**) | `database/device_integration_schema.sql:10` | No | `/api/devices/[id]/users` | same route | **conflicting duplicate definition** |
| `zk_devices` | `database/migrations/017_zkteco_adms_integration.sql:10` | No | **nobody** (zero references in src) | nobody | dead table |
| `zk_raw_logs` | `017_...sql:38` | No | zk-handler `saveRawLog` | `/api/zk/logs`, device-logs pages | raw forensic |
| `zk_parsed_logs` | not in 017 **[DB-VERIFY]** | No | zk-handler `saveParsedLog` | device-logs pages | parsed forensic |
| `zk_attendance_logs` | `017_...sql:58` — **no unique key on (sn, pin, check_time)** | No | zk-handler (2 call sites), backfills | monitor, dashboard, live-scan, stream, zk/logs, zk/reports | legacy attendance truth |
| `zk_device_commands` | `017_...sql:89` | No | sync-identities, sync-members, enroll-fingerprint, actions, reset-and-sync | zk-handler GET, commands pages | command queue |
| `zk_user_mapping` | `017_...sql:116` — UNIQUE `(device_user_id, device_sn)`, **not school-scoped** | No | autoLinkPinFromName, processUserInfo, local-enroll, sync-identities, mapping UI, pin-allocator mirror | legacy resolver, sync state, fingerprint-status | legacy identity |
| `device_users` | `device_integration_schema.sql:37` | No | `/api/devices/[id]/users` | legacy resolver step 3 | parallel identity #2 |
| `device_user_mappings` | `999_complete_system_audit_fix.sql:43` | No | `/api/device-mappings/*` (keyed to `biometric_devices`!) | legacy resolver step 2 | parallel identity #3 |
| `device_user_directory` | none | **Yes** (`device-directory.ts:42`) | captureDeviceUserDirectory | live popup, history, engine display-name | device echo directory |
| `device_sync_state` | none **[DB-VERIFY]** | No create found | zk-handler `updateDeviceSyncState` | devices pages | sync proxy |
| `device_heartbeats` | none found | No create found | zk-handler | monitor | forensic |
| `system_logs` | none found in attendance scope | No | zk-handler | system-logs route | forensic |
| `biometric_enrollments` (NEW: `pin_value`, `person_id`, `role_type`, status `active/...`) | `src/Database/DRAIS.sql:1332` | **Yes** (`biometric-enrollments-schema.ts:35`) | pin-allocator, transfer-service, backfill | resolver, template-service | canonical identity |
| `biometric_enrollments` (OLD: `device_slot`, `student_id`, status `INITIATED/...`, `session_id`) | `database/biometric_enrollment_pipeline.sql:24` | No | **local-enroll route.ts:194** | **`/api/biometric/unassigned`**, `/api/biometric/assign` | **conflicting duplicate definition** |
| `enrollment_sessions` | `biometric_enrollment_pipeline.sql:8` | No | local-enroll | unassigned API | old pipeline |
| `biometric_templates` | `DRAIS.sql:1603` | **Yes** | template-service `recordTemplate` | admin templates API | canonical template store |
| `template_distributions` | `DRAIS.sql` | **Yes** | template-service fanout | admin distribute API | **queue with no worker** |
| `student_fingerprints` | **THREE conflicting definitions**: `DRAIS.sql:1256` (fingerprint_data TEXT), `DRAIS.sql:1289` (WebAuthn passkey shape), `consolidated_schema.sql:509` + the shape zk-handler actually writes (`finger_position`, `hand`, `template_data`, `template_format`) per `MERGE_IBUNBAZ_SCHEMA.sql` | No | zk-handler `processFingerprint`, orphan claim | fingerprint-status, enroll status | template (legacy) |
| `staff_fingerprints` | **does not exist** — orphan-claim comments confirm "staff side stays template-less" (`orphans/route.ts:18`) | — | nobody | nobody | missing |
| `fingerprint_orphans` | none | **Yes** (zk-handler route.ts:1268, **DDL on hot path, ungated**) | processFingerprint | `/api/biometric/orphans` | orphan queue |
| `attendance_raw_events` | `DRAIS.sql:1448` | **Yes** (`attendance-tables-schema.ts:83`) — **no unique/dedup key** | engine `recordRawEvent` | `/api/attendance/history`, transfer-service | canonical journal |
| `attendance_records` | `DRAIS.sql:1483` | **Yes** — UNIQUE(person, date) | engine `persistVerdict` | reports v2 / aggregates | derived attendance |
| `attendance_rules` | `DRAIS.sql:1393` | **Yes** | `/api/attendance/settings` | engine `loadActiveRule` | rules |
| `holidays` | `DRAIS.sql:1431` | **Yes** | `/api/admin/holidays`, `/attendance/holidays` | engine | rules |
| `attendance_daily_aggregates` | `DRAIS.sql:1750` | **Yes** | `/api/cron/aggregate-refresh` | reports | derived |
| `student_attendance` / `staff_attendance` | `consolidated_schema.sql:481/561` | No | manual mark/signin/signout/reconcile routes | legacy reports | manual attendance (NOT written by ZK pipeline) |
| `daily_attendance` | not found as ZK writer target | — | — | — | legacy |
| `dahua_attendance_logs` | `dahua_tidb_schema.sql` | No | dahuaPoller | dahua routes | parallel raw |
| `notification_policies` / `notification_outbox` / `notification_deliveries` | `DRAIS.sql:1655/1687/1717` | **Yes** | fanout / drainer | admin notification APIs | notification |
| `comm_rules` + dispatch audit | comm module | No | /admin/communications | comm dispatcher | notification system A |
| `device_transfers` / `device_alerts` | `DRAIS.sql:1534/1559` | **Yes** (`devices-ownership-schema.ts`) | transfer-service | admin devices UI | ownership |
| `enrollment_log` | `database/enrollment_log.sql` | No | local-enroll | — | audit |
| `relay_commands` | relay schema | No | relay-enroll | relay agent + status route | relay queue |

### 3.2 Conflicting table definitions

**CRITICAL ARCHITECTURAL VIOLATION — `biometric_enrollments` exists in two incompatible shapes.**
- OLD (`database/biometric_enrollment_pipeline.sql:24`): `device_sn`, `device_slot`, `student_id`, `status ENUM('INITIATED','CAPTURED','UNASSIGNED','ASSIGNED','VERIFIED','ORPHANED')`, UNIQUE`(device_sn, device_slot)`.
- NEW (`src/Database/DRAIS.sql:1332` + runtime ensure `biometric-enrollments-schema.ts`): `enrollment_uuid`, `person_id`, `role_type`, `role_ref_id`, `pin_value`, `status ENUM('active','suspended','revoked','transferred')`, UNIQUE`(school_id, pin_value)`.
- Both use `CREATE TABLE IF NOT EXISTS` → whichever ran first wins **forever**, and the other generation's reads/writes fail silently:
  - If OLD exists: the Phase 1 resolver (`resolve.ts:114`), `pin-allocator.ts`, `template-service.lookupActiveEnrollment` all error (caught → treated as miss) → canonical identity is permanently dead → everything runs on legacy tables → engine skipped (see §4.2).
  - If NEW exists: `local-enroll` route.ts:194 INSERT fails ("Unknown column 'device_slot'", caught at :201 as "non-fatal"), and `/api/biometric/unassigned` (route.ts:51 joins `be.session_id`) errors → the unassigned page shows nothing.
- **[DB-VERIFY]** which shape exists per environment, but in *either* case major features are broken — this is provable from code alone.

**CRITICAL ARCHITECTURAL VIOLATION — `devices` exists in two incompatible shapes**, and the shape the entire ADMS pipeline depends on (`sn` unique key, `ip_address`, `is_online`, `deleted_at`, `last_activity`) is **defined in no schema file in the repository**. The only committed definition (`device_integration_schema.sql:10`) has no `sn` column at all. The production table is pure runtime drift, unreproducible from the repo.

**`student_fingerprints` has three committed conflicting definitions** (DRAIS.sql:1256 vs DRAIS.sql:1289 WebAuthn shape vs the ADMS shape zk-handler writes). zk-handler's UPSERT (route.ts:1194) assumes columns `finger_position, hand, template_data, template_format, enrollment_timestamp, is_active, status` and a unique key that makes `ON DUPLICATE KEY UPDATE` meaningful — none of the in-repo definitions guarantee that key. **[DB-VERIFY]**

### 3.3 Missing constraints

- `zk_attendance_logs`: **no UNIQUE(device_sn, device_user_id, check_time)** (017_...sql:58). ADMS devices re-send ATTLOG batches when an ACK is missed → duplicate rows → duplicate popup events and inflated counts.
- `attendance_raw_events`: same — no dedup key (`attendance-tables-schema.ts:83`). Duplicate journal rows inflate `raw_event_count`.
- `zk_user_mapping`: UNIQUE`(device_user_id, device_sn)` is **not school-scoped**, and MySQL permits unlimited duplicate rows when `device_sn IS NULL` → multiple schools can hold "global" rows for the same PIN; the legacy resolver (`resolve.ts:193`) accepts `school_id = ? OR school_id IS NULL` rows → **cross-school attribution risk**.
- `zk_user_mapping` allows the same `student_id` to appear under many PINs and the same PIN to point at both a student row and staff row across tables (resolved only by the staff>student precedence hack, `resolve.ts:237`).

---

## 4. BROKEN TRUST CHAIN — THE FIVE VERIFIED BREAKS

### 4.1 The dead SMS path

`saveAttendancePunch` (`src/app/api/zk-handler/route.ts:802-968`) is the only place `notifyAdmsAttendance` is invoked (route.ts:939). **`saveAttendancePunch` is never called** — `grep` over the repo shows zero call sites; the POST ATTLOG handler re-implements the same logic inline (route.ts:1732-1886) **without** the SMS call.

**CRITICAL ARCHITECTURAL VIOLATION** — scan-triggered SMS (system A: comm dispatcher / `comm_rules`) cannot fire, ever.

It is dead twice over: even if called, `loadStudentSubject` (`src/lib/comm/adms-attendance.ts:146`) selects `s.first_name, s.last_name FROM students s` — the `students` table has no name columns (names live in `people`, `consolidated_schema.sql:481`) → SQL error → caught → returns null → silent no-op.

### 4.2 The engine gate

Both inline ATTLOG sites call the classification engine only as:

```ts
if (rawEventId && matched && resolution.personId) { evaluatePunch(rawEventId)... }   // route.ts:871, :1820
```

`resolution.personId` is set **only** when identity resolved via canonical `biometric_enrollments` (`resolve.ts:131-139`). The legacy resolver (`legacyResolve`, resolve.ts:182-264) returns `studentId`/`staffId` but **never `personId`**.

But every operational identity writer writes **legacy tables only**:
- fuzzy auto-link `autoLinkPinFromName` → `zk_user_mapping` (route.ts:432)
- `processUserInfo` → `zk_user_mapping` (route.ts:1096)
- local TCP enroll → `zk_user_mapping` (local-enroll route.ts:174)
- mapping UI `/api/attendance/zk/user-mapping` → `zk_user_mapping`
- sync-identities → `zk_user_mapping` (sync-identities route.ts:166)

Only `pin-allocator.ts` (used by the ADMS-queue enrollment routes `students/enroll-fingerprint`, `staff/enroll-fingerprint`) writes canonical rows.

**CRITICAL ARCHITECTURAL VIOLATION** — for every punch resolved through the legacy path: no `attendance_records` row, no late/absent/departure classification, no `attendance.record.upserted` event, therefore **no notification fanout (system B) either**. The punch exists in `zk_attendance_logs` (popup shows it) and in `attendance_raw_events` with `person_id NULL`, and dies there. This is exactly "popup works, permanent classified attendance doesn't."

### 4.3 Verified compile error shipping to production

`evaluateDay` is called at zk-handler route.ts:479 (post-autolink backfill re-evaluation) but is **not imported** (only `recordRawEvent, evaluatePunch` at route.ts:8). Verified: `npx tsc --noEmit` → `route.ts(479,19): error TS2304: Cannot find name 'evaluateDay'`. Ships anyway because `next.config.ts:9` sets `ignoreBuildErrors: true` (and `ignoreDuringBuilds: true` for ESLint). At runtime the ReferenceError is swallowed by `catch { /* non-critical backfill */ }` (route.ts:483) → **retroactive day re-evaluation after auto-link silently never happens**.

### 4.4 The outbox with no drainer

Notification system B is fully built: engine emits → `fanout.ts` matches `notification_policies`, dedups via `dedup_key`, enqueues `notification_outbox` → `/api/cron/notification-drain` sends via provider with retry + `notification_deliveries` receipts. The drainer's own doc comment says "Scheduling: vercel.json `* * * * *`" (notification-drain/route.ts:9) — but **`vercel.json` contains exactly one cron: `/api/result-deadlines`**. Nothing schedules the drain (or `/api/cron/aggregate-refresh`, or `/api/cron/device-status`).

**CRITICAL ARCHITECTURAL VIOLATION** — even on the canonical happy path, notifications queue forever and are never sent.

### 4.5 The queue with no worker

`template_distributions` rows are created on every captured template (`template-service.ts:115`) for every sibling device — explicitly documented as "INTENT — the firmware-capable drainer is Phase 4.5" which **does not exist** in the repo. Multi-device fingerprint portability is therefore an accumulating queue that no process ever executes.

---

## 5. PHASE 2 — LOCAL TCP ENROLLMENT AUDIT

Flow as implemented in `/api/device/local-enroll` (`src/app/api/device/local-enroll/route.ts`):

| Step | What actually happens | Evidence |
|---|---|---|
| Admin clicks enroll | POST `{student_id, device_ip}` | route.ts:36 |
| Resolve identity | name from `people` via `students` | :63 |
| Slot resolution | DB mapping → **device name match (exact uppercase)** → first free slot | :129-171 |
| Mapping write | `zk_user_mapping` upsert with **`device_sn = device_ip`** | :174-179 |
| Session record | `enrollment_sessions` + `biometric_enrollments` **OLD shape INSERT** (`device_slot`, `source`, `session_id`) — fails silently if NEW table exists | :186-203 |
| Device commands | CMD_USER_WRQ (72-byte) + CMD_REFRESHDATA + CMD_STARTENROLL Format B | :206-238 |
| Completion | returns "scan finger now"; **immediately** flips enrollment → `ASSIGNED`, session → `COMPLETED` | :281-295 |
| Template arrival | asynchronous, via ADMS OPERLOG `FP PIN=...` to zk-handler keyed by **real SN** | zk-handler route.ts:1675 |

### 5.1 Answers to the mandatory questions

1. **Does DRAIS store the device PIN after successful enrollment?** Partially — slot/PIN goes into `zk_user_mapping`, but keyed by IP, not SN (§5.2), and into old-shape `biometric_enrollments` which may not exist. Never into the canonical NEW `biometric_enrollments`.
2. **Does DRAIS store the template?** Only if the ADMS push later arrives AND the PIN maps via `(pin, real SN)` — which the local-enroll mapping cannot satisfy (§5.2) → template lands in `fingerprint_orphans`, or in `student_fingerprints` only if some *other* row (e.g. fuzzy autolink from the OPERLOG USER echo) matched first.
3. **Which machine contains the fingerprint?** Only via `template_distributions`/`biometric_templates.captured_device_sn` on the canonical path; for local enrollments effectively unknown.
4. **Does DRAIS know enrollment succeeded?** **No.** Status is flipped to ASSIGNED/COMPLETED *before any finger touches the sensor* (route.ts:281-295). There is no confirmation step bound to template arrival. The separate ADMS path's status check (`students/enroll-fingerprint` GET, route.ts:41-54) does poll for a captured template — the local path has nothing equivalent.
5. **Learner profile updated?** `/api/students/fingerprint-status` reads `student_fingerprints` + `fingerprints` + command status — so the profile only updates if the template actually landed (it usually doesn't, per above).
6. **Monitor updated?** Monitor reads `zk_attendance_logs` only; enrollment state is invisible there.
7. **Queued to other machines?** Only via the never-drained `template_distributions` queue, and only for canonical enrollments.
8. **Rollback on partial success?** None. Failure path marks enrollment `ORPHANED` (route.ts:259) but the device may already hold the user record written by CMD_USER_WRQ; nothing deletes it.

### 5.2 The IP-vs-serial identity split

**CRITICAL ARCHITECTURAL VIOLATION** — local-enroll writes `device_sn = device_ip` (route.ts:178, :190, :198). Every consumer of `zk_user_mapping.device_sn` compares against the **ADMS serial number**: the legacy resolver (`resolve.ts:195`), `processFingerprint`'s mapping lookup (zk-handler route.ts:1170-1174), sync-state counting. A mapping row keyed by `192.168.x.x` matches nothing. Consequences, in order: punch arrives → resolver misses that row → unmatched or fuzzy-rescued by name; template arrives → mapping lookup misses → `fingerprint_orphans`; the popup says "Unrecognized" right after a "successful" enrollment. The BIO-9 fuzzy auto-linker was added to paper over exactly this hole (its own comment, route.ts:1704-1710, admits enrollments through DRAIS leave `zk_user_mapping` empty for the real SN).

---

## 6. PHASE 3 — PIN AND IDENTITY MAPPING AUDIT

The correct identity key — `school_id + device_sn + device_user_pin` — is respected **only** by the canonical resolver's school+pin lookup (per-school, device-agnostic by design: one PIN per person per school) and by `device_user_directory` (UNIQUE sn+pin).

| Source | Identifier | Meaning | Scope | Risk |
|---|---|---|---|---|
| `biometric_enrollments.pin_value` (NEW) | per-school PIN | person identity | school | LOW — UNIQUE(school, pin) |
| `zk_user_mapping.device_user_id` | device PIN as VARCHAR | student or staff | UNIQUE(pin, sn), school column un-enforced; NULL sn = "global" | HIGH — cross-school, multi-NULL dup, staff/student ambiguity |
| `device_users.device_user_id` | PIN per `devices.id` | student only | per device row | MED — third parallel writer |
| `device_user_mappings` | PIN per `biometric_devices` (a *different* device registry) | student/staff | per device | MED — keyed to a registry the ADMS path doesn't use |
| local-enroll `device_sn` | **an IP address** | — | — | CRITICAL (§5.2) |
| `students.id` ↔ PIN confusion | local-enroll detects "corrupted mapping (large SQL id stored)" (route.ts:147-153) | historical writers stored `students.id` as PIN | — | HIGH — `uid` overflow + misattribution, partially self-healed |
| `attendance_raw_events.device_user_id INT` | PIN as INT | — | — | LOW-MED — `Number(userId)` (route.ts:1804) corrupts alphanumeric PINs |

The system *knows* PIN ≠ database id (extensive comments at local-enroll route.ts:92-101), but four mapping tables, two device registries, and one IP-keyed writer mean the invariant is enforced nowhere.

---

## 7. PHASE 4 — NAME-BASED MATCHING RISK AUDIT

Where names are used to identify device users:

1. **`processUserInfo` exact match** (zk-handler route.ts:1038-1053): `LOWER(first_name)=? AND LOWER(last_name)=? ... LIMIT 1`. **No ambiguity guard** — two active learners with identical names: the first row id wins and the PIN is permanently mapped to possibly the wrong child. **CRITICAL ARCHITECTURAL VIOLATION** (silent wrong-learner attribution).
2. **`autoLinkPinFromName`** (route.ts:385-492): Jaccard token fuzzy (`name-fuzzy.ts`), threshold 0.6 + 0.2 margin, skips ties (`AUTOLINK_AMBIGUOUS`) — conservative, logged, but still **writes a permanent mapping with no operator confirmation**, then backfills historical unmatched logs (route.ts:456-462). A wrong fuzzy link silently rewrites history. No confirmation workflow, no undo UI (only raw mapping delete).
3. **`processUserInfo` phantom creation** (route.ts:1062-1093): unmatched device name → **creates real `people` + `students` rows** marked 'active'. A misspelled device name forks a duplicate learner who then accrues attendance. **CRITICAL ARCHITECTURAL VIOLATION** (roster pollution + split attendance history).
4. **Live popup tentative match** (live-scan/route.ts:277-300): fuzzy against `device_user_directory` name, displayed as "likely match" — acceptable (display-only), provided it never persists (it doesn't).
5. **local-enroll device name match** (local-enroll route.ts:158-165): exact uppercase device-name match chooses the slot — same-name collision on the device steals another person's slot/fingerprint. HIGH.

Dangerous-case outcomes: same-name learners → wrong permanent map (case 1) or skip (case 2); learner/staff same name → fuzzy candidates include both, margin usually saves it, exact-match path is student-only so staff scans can map to a student; no-space device names → tokenizer yields one token, usually below threshold → orphan (correct); former-learner-now-staff → handled only by staff>student precedence at read time, stale student mapping remains forever (append-only writers, resolve.ts:23-31 comments confirm).

**Mandatory conclusion (confirmed by code):** DRAIS currently *does* permanently attribute identity from name matches without confirmation in paths 1 and 3. This must stop; deterministic key is `school_id + device_sn + PIN` with operator-confirmed claims for everything else.

---

## 8. PHASE 5 — FINGERPRINT TEMPLATE STORAGE AUDIT

| Question | Answer | Why |
|---|---|---|
| Can DRAIS back up templates? | **Partially yes** | OPERLOG/TEMPLATEV10/BIODATA `TMP` base64 is stored in `student_fingerprints.template_data` and (canonical path only) `biometric_templates.template_bytes` |
| Restore to a device? | **No** | No code builds `DATA UPDATE FINGERTMP`/`BIODATA` push commands; distribute API only queues rows |
| Push to multiple machines? | **No** | `template_distributions` has no drainer (§4.5) |
| Detect template on machine but not DRAIS? | **Yes, narrow** | unmapped `FP` push → `fingerprint_orphans` + claim flow (`/api/biometric/orphans`) |
| Detect DRAIS-has-template but machine lost it? | **No** | no device-side template inventory query (`DATA QUERY FINGERTMP` never issued) |
| Template status per learner per device? | **No** | `fingerprint-status` route reads `student_fingerprints`/`fingerprints` globally, not per device; `template_distributions` UI exists only as admin templates API |
| Staff templates? | **No storage** | `staff_fingerprints` doesn't exist; orphan claim is student-only (orphans/route.ts:18) |
| Versioning / restore history | **No** | `recordTemplate` UPSERT overwrites bytes (template-service.ts:74-79, comment admits "old bytes are lost") |

---

## 9. PHASE 6 — DEVICE DRIFT AND RECONCILIATION MATRIX

| Scenario | Detected? | Where | UI? | Fixable in UI? | Command queued? | Audited? | Wrong attribution possible? |
|---|---|---|---|---|---|---|---|
| A. In DRAIS, not on device | **Proxy only** — `updateDeviceSyncState` count comparison (route.ts:513-549); counts are wrong (counts global-NULL rows for every device; "on device" proxied by acked USERINFO commands, not device truth) | zk-handler | sync_status chip only, no names | sync-identities re-push | yes (USERINFO) | partial | n/a |
| B. On device, not in DRAIS | **Yes (best path in system)** — USERINFO/OPERLOG USER → `device_user_directory`; unmatched punches visible in monitor/logs `unmatched` tabs; orphan FP queue | zk-handler BIO-8 | monitor unmatched tab + QuickAssign (but **broken by `urser-mapping` typo**, logs/page.tsx:80) | partially | no | yes (directory) | yes via fuzzy/exact auto-link (§7) |
| C. On device with wrong name | No comparison of directory name vs people name | — | no | no | no | no | yes |
| D. Renamed in DRAIS, stale on device | No re-push on rename | — | no | manual sync-identities only | no | no | confusing popup |
| E. FP on device, not in DRAIS | Yes — `fingerprint_orphans` | zk-handler | orphans API (page wiring thin) | claim flow | no | yes | no |
| F. FP in DRAIS, not on device | **No** | — | no | no | no | no | silent auth failure |
| G. Deleted on device, mapped in DRAIS | **No** — USERINFO processing is additive; no full-inventory diff, no `last_seen` staleness sweep | — | no | no | no | no | **PIN reuse → punches attributed to the old person** — CRITICAL |
| H. Deleted/archived in DRAIS, still on device | **No** — no student-lifecycle hook queues `DATA DELETE USERINFO` (grep: zero per-user delete commands in repo; only `CLEAR DATA USER` nuke in actions/reset-and-sync) | — | no | no | **no per-user delete capability exists at all** | no | **CRITICAL** |
| I. Device reassigned to another school | **Yes** — transfer-service release/acquire/decommission (`transfer-service.ts`), revokes/`transferred` enrollments, deletes orphans, preserves raw events, `device_transfers` audit | admin devices UI | yes | yes | acquire path **[DB-VERIFY]** whether device-side wipe is enqueued | yes | mitigated |
| J. Same PIN reused for another person | UNIQUE(school,pin) on canonical only; legacy tables allow it | — | no | no | no | no | **CRITICAL** with G |
| K. On machine A, not machine B | Only as un-drained `template_distributions` rows + per-device USERINFO command history | — | no per-person-per-device matrix | no | queue only | partial | no |
| L. Unknown users shown only as "mismatch" | Directory has names+PINs, but `device_sync_state` exposes only counts | — | counts only | no | no | — | — |

---

## 10. PHASE 7 — ATTENDANCE PROCESSING AUDIT

Stage-by-stage (verified):

1. **Raw**: every POST lands in `zk_raw_logs` first (route.ts:1457) — solid, raw-first. ✅
2. **Parsed**: every line → `zk_parsed_logs` success/failed. ✅
3. **Legacy log**: every ATTLOG record → `zk_attendance_logs`, matched or not. ✅ (no dedup ❌)
4. **Canonical journal**: dual-write → `attendance_raw_events` best-effort. ✅ but `ensureAttendanceEngineSchema` runs DDL + a full-table display-name backfill UPDATE on first call per cold start (attendance-tables-schema.ts:112-141) — heavy on serverless cold starts. ⚠️
5. **Classification**: `evaluatePunch` → ONLY canonical-resolved punches (§4.2). ❌
6. **Unresolved identity**: row sits with `matched=0`; later mapping triggers `UPDATE ... matched=1` backfill + `backfillAttendanceRawEventsForMapping` + (broken) `evaluateDay` (§4.3). ⚠️
7. **Duplicate scan**: rule `ignore_duplicate_scans_within_minutes` exists in the evaluator, but ingest writes every duplicate row; dashboard/monitor counts read raw logs → inflated. ❌
8. **Departure**: `io_mode` stored; evaluator computes last_out/early_leave/half_day — when it runs. ⚠️
9. **Staff**: staff>student precedence at resolve; engine handles roleType staff; SMS staff events dead (§4.1). ⚠️
10. **Browser closed**: processing is fully server-side in the ADMS handler. ✅ The popup is *not* the processor (good), but it **is** the only place users currently see scan results because downstream stages are broken — which creates the *illusion* that the popup is the system.

**Verdict:** persistence to raw layers is genuinely robust (the strongest part of the system). Persistence to *meaningful, classified attendance* fails for the dominant identity path.

Side findings: `/api/attendance/stream/route.ts:70` joins `st.class_id` (`students` has no `class_id` in `consolidated_schema.sql:481`) — the SSE enrichment query references a column that doesn't exist in the canonical schema **[DB-VERIFY: production may have drifted]**. Engine timezone: `evaluateDay`/`startOfDay`/`formatDate` use server-local time (engine.ts:441-453); on UTC servers (Vercel) Ugandan punches after 21:00 EAT land on the wrong attendance date and rule windows shift by 3 hours. **CRITICAL ARCHITECTURAL VIOLATION** (wrong-day attendance on serverless deploys).

---

## 11. PHASE 8 — ROUTE CONSISTENCY MATRIX

| Route (page) | API | Table read | Learners | Staff | Raw | Classified | Unmatched | Class/stream | Late status |
|---|---|---|---|---|---|---|---|---|---|
| `/attendance` dashboard | `/api/attendance/zk/dashboard` | `zk_attendance_logs` (+devices, mappings) | ✅ | ✅ | ✅ | ❌ | counts | partial | ❌ |
| `/admin/biometric-monitor` | `/api/admin/biometric-monitor` | `zk_attendance_logs`, `device_heartbeats`, `zk_device_commands` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| live popup / SSE | `/api/attendance/live-scan`, `/api/attendance/stream` | `zk_attendance_logs` + `device_user_directory` + fuzzy | ✅ | ✅ | ✅ | ❌ | ✅ tentative | broken join (§10) | ❌ |
| **`/attendance/logs`** | `/api/attendance/history` | **`attendance_raw_events`** | only if raw-event write succeeded; names only if `person_id` or directory hit | ✅ | ✅ | ❌ (raw only) | ✅ | via enrollments join | ❌ |
| `/attendance/reports*` | reports/v2, aggregates | `attendance_records` / `attendance_daily_aggregates` | **only canonical-path punches** | same | ❌ | ✅ | ❌ | ✅ | ✅ |
| `/attendance/mapping` | zk/user-mapping | `zk_user_mapping` | — | — | — | — | — | — | — |
| `/attendance/biometric/unassigned` | `/api/biometric/unassigned` | OLD-shape `biometric_enrollments` | broken if NEW shape exists | — | — | — | — | — | — |

**Why the user sees divergence:** the monitor reads the legacy log (every punch, classified never); `/attendance/logs` reads the canonical journal (populated best-effort, names frequently NULL for legacy-resolved punches since `person_id` is NULL — display falls back to `device_user_directory`); reports read `attendance_records` (only canonical path). Three layers, three truths. Additional paper cut: the logs page Quick-Assign posts to `/api/attendance/zk/urser-mapping` (typo, logs/page.tsx:80) → 404 → the page's only repair action is broken.

---

## 12. PHASE 9 — RULES AND CLASSIFICATION

What exists (rule-evaluator.ts + attendance-tables-schema.ts:24-64 + settings UI):
arrival start/end, late threshold, absence cutoff, closing time, departure start/end, early-leave threshold, half-day threshold, weekday mask, applies_on_holidays, boarding_scope, applies_to (students/teachers/all), duplicate-scan window, priority. Holidays table + admin UI. A real test suite exists (`src/lib/attendance/__tests__/rule-evaluator.test.mjs`, run via `npm run test:attendance`).

What's missing/not wired:
- **The evaluator runs only on the canonical identity path** (§4.2) — for most schools the rules engine is effectively decorative. **CRITICAL ARCHITECTURAL VIOLATION** (settings exist but scan pipeline doesn't reach the evaluator).
- `loadActiveRule` takes ONE rule per school per role (`LIMIT 1`, engine.ts:310-321) — per-class, per-stream, per-device rules unsupported.
- `personIsBoarding` passed as `undefined` (engine.ts:260) — boarding/day rules defined but never differentiated.
- Term-calendar awareness, manual override workflow: absent.
- Timezone: §10.
- `/api/attendance/settings` deactivates all rules and inserts one (settings/route.ts:76-82) — UI supports exactly one global rule.

---

## 13. PHASE 10 — SMS READINESS MATRIX

| Capability | System A (comm_rules / dispatcher) | System B (notification_policies / outbox) |
|---|---|---|
| Trigger from scan | **dead** (§4.1) | wired via engine event, **engine rarely runs** (§4.2) |
| Sender execution | dispatcher sends inline | **drainer never scheduled** (§4.4) |
| Per-school enable | comm_rules active flag | policy is_active |
| Per-learner enable | ❌ | ❌ (policy conditions only) |
| Arrival/late/departure events | checkin/checkout/late event types defined | status-based conditions incl. status_changed |
| Missing-phone warning | ❌ silently zero recipients | logged, zero rows; no UI warning |
| Dry-run | ❌ | console provider fallback (providers.ts) |
| Delivery logs | dispatch audit rows | notification_deliveries ✅ |
| Retry | ❌ | attempts/max_attempts ✅ |
| Live "sending SMS to parent…" in popup | ❌ nothing connects popup to either system | ❌ |

**Net: no attendance scan can produce an SMS in production today.** Two half-finished systems overlap; system B is architecturally superior (outbox, dedup, retry, receipts) and one cron entry + the engine-gate fix away from functioning.

---

## 14. PHASE 11 — MULTI-MACHINE READINESS

| Question | Answer |
|---|---|
| Which persons exist on each device? | Partially — `device_user_directory` (sn,pin,name) is per-device truth-by-echo; no UI matrix |
| Which fingerprints exist on each device? | Only inferable from `biometric_templates.captured_device_sn` + queue rows; no device inventory query |
| Who's missing from a device? | No (count proxy only) |
| PIN per person per device? | Canonical model says one PIN per school (good design), legacy tables disagree per device; no UI |
| One enrollment → many devices? | Identity yes (sync-identities queues USERINFO to a device); fingerprints **no** (§4.5, §8) |
| Sync without overwriting? | USERINFO push is upsert-style; `reset-and-sync` is destructive (CLEAR DATA USER) and is the only "make device match DRAIS" tool — **a sledgehammer that deletes all fingerprints on the device** |
| Remove stale users from all devices? | No per-user delete command exists anywhere |
| Enroll once, recognized everywhere? | **No** — templates aren't distributed; each machine needs physical re-enrollment |

---

## 15. PHASE 12 — DEVICE OWNERSHIP AND TRANSFER

Surprisingly good: `transfer-service.ts` implements release (marks device released, `biometric_enrollments → 'transferred'`... **[DB-VERIFY]** exact semantics, counts raw events for audit), acquire (clears `fingerprint_orphans` for the SN, reassigns school), decommission; `device_transfers` is the audit trail; admin endpoints `/api/admin/devices/[sn]/release|acquire|decommission` and `/admin/devices` page exist. Historical attendance is preserved (raw events keep school_id). Gaps: release does not queue a device-side `CLEAR DATA` so the physical machine still holds the old school's users/fingerprints when the next school powers it on (acquire clears DRAIS-side orphans only); legacy `zk_user_mapping` rows for the SN are not archived/cleared by transfer **[DB-VERIFY]** → cross-school resolution risk via the `school_id IS NULL` clause.

---

## 16. PHASE 13 — UI TRUST MATRIX

| Page | Reads | Verdict |
|---|---|---|
| `/attendance` | zk_attendance_logs dashboard | **Misleading** — counts raw punches incl. duplicates, no classification |
| `/attendance/logs` | attendance_raw_events | **Incomplete + broken action** (urser-mapping typo; NULL names on legacy path) |
| `/admin/biometric-monitor` | zk_attendance_logs + heartbeats + commands | **Most honest page** for raw activity; zero classification/fingerprint status |
| `/attendance/mapping` | zk_user_mapping CRUD | Functional but manages only the legacy table → edits don't reach canonical identity → engine still skips |
| `/attendance/enrollment` | enrollment APIs | Shows initiation, not completion truth (§5) |
| `/attendance/biometric/unassigned` | OLD biometric_enrollments | **Broken in NEW-shape deployments** |
| `/attendance/settings` | attendance_rules | Writes rules the pipeline mostly never evaluates — **trust theater** |
| `/attendance/devices`, device-control, commands, device-logs | devices/commands/logs | Functional observability |
| Learner profile / students list | `/api/students/fingerprint-status` | Global has/has-not flag only; no per-device status, no sync status, no stale/orphan indicators |
| Staff profile | — | No staff fingerprint surface at all |

---

## 17. PHASE 14 — HIDDEN FLAWS (beyond user complaints)

1. **`ignoreBuildErrors: true` + `ignoreDuringBuilds: true`** (next.config.ts:6-9) — the safety net that let §4.3 ship. Systemic risk multiplier.
2. **DDL on hot paths**: `fingerprint_orphans` CREATE TABLE on every orphan write (ungated, zk-handler route.ts:1268); `ensure*Schema` full-table backfill UPDATE per cold start (attendance-tables-schema.ts:122).
3. **Unbounded growth, no retention**: zk_raw_logs (full bodies + headers), zk_parsed_logs, system_logs, device_heartbeats (every ~60s per device), zk_device_logs (raw payload up to 64KB per POST, twice).
4. **`updateDeviceSyncState` runs two COUNTs + an UPSERT on every heartbeat** with a non-indexed `command LIKE 'DATA UPDATE USERINFO%'` scan (route.ts:524).
5. **Batch ACK overreach**: a `Return=0` for *any* command acknowledges ALL sent USERINFO commands for the device (route.ts:1507-1514) — a partial batch failure is recorded as full success → sync-state lies.
6. **`getDeviceSchoolId` returns NULL for unregistered SNs** and processing continues with `schoolId = null` into NOT NULL columns (raw log insert defaults school 1 at route.ts:1341 GET path; POST path passes null) — unknown devices either crash inserts (caught) or contaminate school 1.
7. **`processUserInfo` backfill joins `m.device_sn IS NULL` rows across devices** (route.ts:1133) — a global mapping retro-matches another device's unmatched logs.
8. **Event bus is in-process** (`publishEvent`) on a serverless platform — fanout subscriber registration via module side effect (`engine.ts:51`) works per-instance, but any queued work depending on long-lived process state is unreliable on Vercel.
9. **No idempotency on command creation** in several queue writers (sync-members dedups; enroll-fingerprint **[DB-VERIFY]**), no command audit UI beyond raw list.
10. **`/api/attendance/zk/user-mapping` POST writes legacy only** — even the deliberate manual mapping flow never creates canonical enrollments (user-mapping/route.ts:163 calls evaluateDay, so classification *does* run for manual mappings — the ONLY legacy writer that does).
11. **Dahua pipeline is a parallel universe** (`dahua_attendance_logs`, dahuaPoller) — out of scope of most fixes above but must eventually funnel through `recordRawEvent` (the enum already reserves `dahua_pull`).
12. **`relay-status` route deletes zk_user_mapping rows** (relay-status/route.ts:170) **[DB-VERIFY]** semantics — a device-facing route mutating identity is a red flag.

---

## 18. NON-NEGOTIABLE TEST CASES (acceptance contract for the roadmap)

1. Local TCP enroll → row in canonical `biometric_enrollments` with real device SN + PIN; visible in learner profile within one heartbeat.
2. Staff local enroll → staff-typed canonical enrollment (requires staff path in local-enroll, today student-only).
3. Two learners named identically → USERINFO/auto-link must park the PIN for operator confirmation, never auto-map (kills route.ts:1038 LIMIT 1 path).
4. Device-only user → appears in a Device Directory UI with PIN+name+device, with Map/Create/Ignore actions (no phantom auto-create).
5. DRAIS learner missing on device → per-device status "missing on device".
6. User deleted on device → inventory diff marks mapping `stale_on_device` within one sync cycle.
7. Learner archived in DRAIS → `DATA DELETE USERINFO PIN=x` queued to every device holding them; UI shows pending removal.
8. Any matched punch (canonical OR legacy mapping) → `attendance_records` row exists with status.
9. `/attendance/logs`, monitor, dashboard, reports all derived from the same canonical journal + records; counts agree for any (school, date).
10. Late arrival classified per active rule, in Africa/Kampala timezone, regardless of server TZ.
11. SMS disabled (no policy) → zero outbox rows.
12. Policy on + parent phone missing → outbox row absent + visible "phone missing" warning on the scan record.
13. Policy on + phone present → outbox row queued AND drained (cron actually scheduled) → deliveries receipt.
14. Staff punch never emits learner events; staff>student precedence covered by an enrollment-time revocation test.
15. Same PIN on two devices, different schools → no cross-attribution (school-scoped resolution proven by test).
16. Released device acquired by school B → no school-A mappings/templates resolvable; physical wipe command queued and verified.
17. Unknown device users listed by (device, PIN, name) — never just "data mismatch".
18. Multi-device school → per-person-per-device fingerprint/identity matrix renders.
19. Duplicate ATTLOG re-push → exactly one raw event (dedup key) and unchanged attendance_records.
20. All of the above with the browser closed (pure ADMS path).

---

## 19. IMPLEMENTATION ROADMAP

Ordering principle: each phase ships a user-visible improvement while converging on one canonical pipeline. Phases 1–4 are the trust core; nothing else matters until they land.

### PHASE 0 — Stop the bleeding (prep, 1–2 days, LOW risk)
- Fix `evaluateDay` import (zk-handler route.ts:8) and the `urser-mapping` typo (logs/page.tsx:80).
- Add crons to `vercel.json`: notification-drain (1m), device-status, aggregate-refresh.
- Turn `ignoreBuildErrors` off in CI (keep deploy override temporarily); add `tsc --noEmit` to the gate script.
- Add UNIQUE dedup keys: `zk_attendance_logs(device_sn, device_user_id, check_time)` + `attendance_raw_events(school_id, device_sn, device_user_id, punch_at, source)` with INSERT IGNORE at both call sites. Migration: dedupe existing rows first (keep MIN(id)).
- **Visible win:** quick-assign works; duplicate scans vanish from the monitor; queued notifications actually send (for whoever has canonical data).
- Rollback: each item independently revertable.
- Tests: 19, 13 partial.

### PHASE 1 — Canonical biometric identity mapping (CRITICAL)
- Objective: ONE trusted model `school_id + device_sn + PIN → enrollment(person, role)`; all writers converge.
- Decide the schema collision (§3.2): migration script that detects which `biometric_enrollments` shape exists, renames OLD to `biometric_enrollments_legacy`, creates NEW, backfills (`src/lib/biometric/migrations/backfill-enrollments.ts` already exists — audit and reuse). Same for the `devices` table: commit a canonical CREATE for the ADMS shape into `src/Database/DRAIS.sql` + an idempotent ensure.
- Make EVERY identity writer dual-write canonical: autoLinkPinFromName, processUserInfo, local-enroll, sync-identities, mapping UI (`/api/attendance/zk/user-mapping`) — all route through `pin-allocator`/a new `enrollment-service`.
- **Fix the engine gate**: in `legacyResolve`, hydrate `person_id` (one JOIN to students/staff) so `evaluatePunch` runs for legacy-resolved punches during the migration window.
- School-scope the legacy resolver (drop `school_id IS NULL` acceptance after backfill).
- Files: resolve.ts, zk-handler, local-enroll, user-mapping route, pin-allocator, DRAIS.sql.
- **Visible win:** scans start producing classified attendance_records → reports and `/attendance/logs` fill in; popup recognizes DRAIS-enrolled users without fuzzy rescue.
- Risk: MED-HIGH (touches resolution); rollback: legacyFallback flag already exists per school.
- Tests: 8, 14, 15.

### PHASE 2 — Enrollment persistence and fingerprint status
- local-enroll: pass real device SN (require device registration; map IP→SN via `devices`), write canonical enrollment, do NOT mark COMPLETED until the FP template arrives (status flow INITIATED → AWAITING_CAPTURE → CAPTURED, driven by processFingerprint matching the enrollment), add a status-poll endpoint like the ADMS path has.
- Staff local enrollment + `staff_fingerprints`-equivalent via `biometric_templates` (role on enrollment).
- Learner/staff profile: per-device fingerprint status panel (enrollment + templates + distributions).
- Tests: 1, 2, 18 partial.

### PHASE 3 — Device directory and mismatch resolution UI
- Add full-inventory reconciliation: on demand (and nightly), queue `DATA QUERY USERINFO`, diff `device_user_directory` (with snapshot semantics: mark rows not in the latest echo as `missing_from_echo`) against canonical enrollments → per-device drift report: on-device-only (map/create/ignore with confirmation), in-DRAIS-only (push), name drift, PIN conflicts.
- Kill phantom creation (route.ts:1062-1093) — replace with "pending device user" queue.
- Demote exact-name auto-map to suggestion requiring confirmation; keep fuzzy auto-link only at ≥ deterministic confidence with audit + undo.
- Tests: 3, 4, 5, 6, 17.

### PHASE 4 — Attendance processing engine completion
- Timezone: store and evaluate in school-local TZ (school_settings.timezone, default Africa/Kampala).
- Absentee sweep: scheduled job that runs evaluateDay for all enrolled persons after absence_cutoff (today absent = no record at all).
- Wire boarding flag; emit popup payload from the engine verdict (status badge in live popup).
- Tests: 8, 10, 20.

### PHASE 5 — Unified attendance routes
- Single query layer (`src/lib/attendance/read-model.ts`) over raw_events + records; migrate dashboard, monitor, logs, live-scan, stream, reports to it; fix the `st.class_id` join; legacy `zk_attendance_logs` becomes write-only forensic.
- Tests: 9.

### PHASE 6 — Attendance rules engine UX
- Multiple rules (per class/stream/device/boarding), priority UI, duplicate-scan window enforced at read-model level, term calendar + holiday integration surfaced in settings.
- Tests: 10.

### PHASE 7 — SMS and notification policies
- Retire system A's attendance bridge (delete dead saveAttendancePunch + adms-attendance or fix and fold into policies); policy editor UI (per event, per role, per school; learner-level opt-out flag), missing-phone surfacing on scan records, dry-run toggle, outbox/deliveries dashboard (`/api/admin/notifications/outbox` exists — give it a page).
- Tests: 11, 12, 13.

### PHASE 8 — Multi-device synchronization
- Implement the template distribution drainer: ADMS `DATA UPDATE FINGERTMP`/BIODATA push (firmware-dependent; feature-flag per device model), per-device person matrix UI, per-user `DATA DELETE USERINFO` command builder + lifecycle hooks (archive/transfer/delete learner ⇒ queue removals).
- Tests: 7, 18.

### PHASE 9 — Device ownership, release, transfer hardening
- Release queues physical wipe (CLEAR DATA USER) with confirmation; archive legacy mappings for the SN; acquire verifies device is empty (user-count from echo) before activation.
- Tests: 16.

### PHASE 10 — Production hardening
- Retention jobs for raw/heartbeat/log tables; indexes (zk_device_commands(device_sn,status,command(24)), directory school index already present); per-school metrics on resolution path mix (the telemetry hooks already exist: PHASE1_LEGACY_PATH_HIT); idempotency keys on command writers; remove per-heartbeat sync-state writes in favor of a 5-minute job; CI: tsc, eslint, attendance test suite mandatory.

---

## 20. STOP

Audit complete. No implementation has been performed (two trivial bugs were *identified* — the `evaluateDay` import and the `urser-mapping` typo — but **not fixed**, per the stop condition). Awaiting approval on the roadmap; Phase 0 can begin immediately on approval.
