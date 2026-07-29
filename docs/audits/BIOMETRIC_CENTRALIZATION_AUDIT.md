# Biometric Centralization — Architecture Audit & Gap Analysis

Status: **Phase 1-3 inspection complete. No code changed by this audit.**
Scope: whether DRAIS can become a centralized biometric identity authority
(enroll once → template stored in DRAIS → pushed to any device → no re-enrollment).

## Executive verdict

**DRAIS is already mid-build on this exact architecture.** This is not a
green-field feature. A previous hardening pass ("Part 6 — central identity")
already shipped: a real template-byte store, a per-device distribution
tracking table, a working push-to-device command builder using the device's
own native format (no conversion), a manual per-person "push to device" UI,
and an immutable audit log. What's missing is entirely at the **operator/bulk
layer** described in Phase 4/5 (fleet-wide push with pre-flight preview,
filters, diffing, and a synchronization report) — the underlying plumbing for
that layer already exists and can be reused, not rebuilt.

---

## Phase 1 — What DRAIS already stores

### 1. Does DRAIS store fingerprint templates? — **Yes, in two places**

**Primary (canonical, current direction): `biometric_templates`**
`database/migrations/tidb/001_canonical_core_tables.sql:114-128`

| column | type | notes |
|---|---|---|
| `enrollment_id` | BIGINT | FK → `biometric_enrollments.id` |
| `finger_index` | TINYINT | which finger, 0-9 |
| `template_bytes` | **MEDIUMBLOB** (≤16MB) | the actual template |
| `template_size` | INT | byte length, cross-checked on write |
| `template_format` | VARCHAR(20), default `'ZK_ADMS'` | tags capture path, not a true algorithm version |
| `quality_score` | INT | device-reported quality |
| `captured_device_sn` | VARCHAR(64) | provenance |
| unique key | `(enrollment_id, finger_index)` | one row per finger, correctly modeled for multi-finger |

Stored **verbatim in the device's own ADMS base64 format** — confirmed by the
comment in `src/lib/biometric/template-distribution.ts:4-6`: "bytelen ==
template_size, decodes to the ZK template header" — i.e. **no transformation**.
This is exactly the property required for template portability: what comes
off the device can go back onto another device unchanged.

**Secondary (legacy, parallel, TCP-path): `student_fingerprints`**
`database/Database/IbunNew.sql:206`, written by
`src/app/api/attendance/zk-tcp/route.ts:677-689`
- `template_data LONGBLOB`, `template_format='ZK_TCP'`, `finger_position ENUM('thumb'..'pinky','unknown')`, `hand ENUM('left','right')`.
- Populated by a different code path (TCP `CMD_USERTEMP_RRQ` read), **not
  reconciled with `biometric_templates`**. Two independent template stores
  exist today with no merge job between them — flagged as a gap below.

**Tertiary (holding pen): `fingerprint_orphans`**
`database/migrations/tidb/001_canonical_core_tables.sql:251-268` — raw
template bytes (`template_data LONGTEXT`) for PINs that arrived with a
template but no resolvable person, claimable via `/api/biometric/orphans`.

### 2. Field inventory vs. what a full user-recreation needs

| field | present? | where |
|---|---|---|
| PIN | ✅ | `biometric_enrollments.pin_value` (unique per school) |
| Device User ID | ✅ | `zk_user_mapping.device_user_id`, `device_user_directory.device_user_id` |
| Employee number | ⚠️ partial | not on enrollment table directly; lives on `staff`/`students` tables, joinable via `person_id` |
| Card number | ✅ | `biometric_enrollments.card_number` |
| Face template | ❌ | no storage or capture path found anywhere (verify_type=15 in `zk_attendance_logs` acknowledges face verification events happen, but no template bytes are ever captured/stored) |
| Password (device PIN password) | ❌ | no column on the canonical ZK/ADMS `devices`-adjacent tables; exists only on the unrelated generic `device_integration_schema.sql` devices table and `dahua_devices.password` — different vendor integration, not reachable from the ZK/ADMS enrollment path |
| Privilege level | ⚠️ partial | `device_user_directory.device_priv` captures what a device *reports*, but there's no DRAIS-authoritative priv field on `biometric_enrollments` to push as a deliberate assignment |
| Finger index | ✅ | `biometric_templates.finger_index`, correctly one-row-per-finger |
| Template format/version | ⚠️ weak | `template_format` conflates "capture source" (ZK_ADMS vs ZK_TCP) with true algorithm/version; no dedicated version column |

### 3. Can DRAIS recreate a user entirely on another compatible device today?

**Mostly yes, for fingerprint-only users on ZK/ADMS devices** — PIN, name,
card, and every stored finger template are all present and already have a
working push command (`buildFingerTmpCommand`, `DATA UPDATE USERINFO`).

**Missing pieces, precisely:**
- Device login **password** (device-local numeric password, independent of biometrics) — no field exists on the canonical path.
- **Face templates** — not captured at all; a face-enrolled user cannot be recreated.
- A deliberate, DRAIS-owned **privilege level** to assign (vs. merely mirroring whatever a device last reported).
- Reconciliation between the two template stores (`biometric_templates` vs `student_fingerprints`) — a user enrolled via the TCP path today would NOT be portable through the ADMS push mechanism, since `syncTemplatesToDevice` only reads from `biometric_templates`.

---

## Phase 2 — Template portability: verified, not assumed

| question | verified answer | evidence |
|---|---|---|
| Does the TCP SDK support uploading templates? | **No.** `node-zklib`'s public API (`getUsers, getAttendances, getRealTimeLogs, disconnect, freeData, disableDevice, enableDevice, getInfo, getSocketStatus, clearAttendanceLog, executeCmd`) has no `setUserTemplate`/`uploadTemplate` method. | `node_modules/node-zklib/zklib.js:129-208` |
| Does the TCP SDK support downloading templates? | **Only via raw opcode**, hand-built by DRAIS on top of `executeCmd`, not a library feature. | `node_modules/node-zklib/constants.js` (`CMD_USERTEMP_RRQ=9`), `src/app/api/attendance/zk-tcp/route.ts:593-618` |
| Does the protocol support template *write*? | The opcode exists (`CMD_USERTEMP_WRQ=10`), but **DRAIS never calls it** — no TCP-based template push exists anywhere in `src/`. | grep of `src/` — zero hits |
| So how does template push actually work today? | **Via ADMS HTTP push, not TCP** — `DATA UPDATE FINGERTMP PIN=..\tFID=..\tSize=..\tValid=1\tTMP=<base64>`, queued in `zk_device_commands`, delivered on the device's own next heartbeat poll, ACKed via `path=devicecmd`. | `src/lib/biometric/template-distribution.ts:24-29`, `src/app/api/zk-handler/route.ts:1147-1183, 1295-1394` |
| Template compatibility (format match) | **Confirmed compatible** — stored bytes are the untouched ADMS base64 payload; the push command is the literal structural inverse of the ingest command. | `template-distribution.ts:1-19` (comment), `biometric_templates.template_format='ZK_ADMS'` |
| K40 Pro firmware limitations | Not independently verifiable from the codebase alone — no device-specific capability table exists to record per-model support. This is a real gap: a fleet with mixed models (K40 Pro + others) has no per-model "supports FINGERTMP push" flag. | absence noted in device schema inspection |
| Template versioning | **Not implemented.** `template_format` is a string tag, not a true version scheme; no migration path exists if the device firmware changes its template algorithm. | absence confirmed |
| Missing device metadata | Confirmed present: PIN, finger index, size, validity flag. Confirmed absent: nothing required by the `FINGERTMP` command itself is missing — the gap is entirely on the "is this device fleet even capable of accepting this command" question, which nothing currently answers in advance. | — |

**The Machine A → Machine B workflow described in the brief is technically
real today, at the single-person, single-device, manually-triggered
granularity** — confirmed working code path, not a design aspiration:
`BiometricEnrollmentPanel.tsx:131-149` → `POST /api/biometric/template-sync`
→ `syncTemplatesToDevice()` → queued `FINGERTMP` command → delivered on next
device heartbeat → ACKed → `template_distributions.status='loaded'`. What
does **not** exist yet is the bulk/fleet operator experience (Phase 4/5).

---

## Phase 3 — Enrollment completeness (multi-finger)

**The suspicion "only one fingerprint" is incorrect for the current schema.**
`biometric_templates` is keyed `(enrollment_id, finger_index)` — a proper
one-row-per-finger design that already supports finger 0 through 9 with no
artificial ceiling. `BiometricEnrollmentPanel.tsx` already renders a list of
however many fingers are enrolled (`data.fingers.map(...)`), not a single
slot. The **legacy** `student_fingerprints` table (TCP path) is more
constrained by its `finger_position ENUM('thumb'|'index'|'middle'|'ring'|'pinky'|'unknown')`
+ `hand ENUM('left','right')` shape (10 combinations, still full 10-finger
coverage, just modeled differently from the canonical 0-9 integer index) —
functionally equivalent capacity, different representation. No schema change
is needed to support all ten fingers; the ceiling that needs fixing is the
**lack of reconciliation** between the two representations, not capacity.

---

## Phase 4/5 — What exists vs. what Phase 4/5 requires (gap table)

| requirement | exists today | gap |
|---|---|---|
| Per-device deployment target concept | ✅ `devices` table, school-assigned, `is_online`, `last_seen` | ❌ no `role`/`purpose` field (e.g. "Gate Verification"), no `capabilities` field, no per-model firmware capability flags |
| "Templates: 152/160" style readiness count | ⚠️ partial | `template_distributions` has the raw data to compute this (loaded vs total) but no aggregated view/endpoint surfaces it per-device today |
| "Push Templates" button | ✅ exists, but **per-person only** (`BiometricEnrollmentPanel.tsx`) | ❌ no per-school bulk entry point on the Devices route itself |
| Scope selection (all / selected / staff-only / learners-only / recently-modified / diff-only) | ❌ `syncTemplatesToDevice` takes only an optional single `personId` | needs a scope parameter + query variants — straightforward extension of the existing SQL in `template-distribution.ts:45-55` |
| Pre-flight preview (count, estimated time, conflicts) | ❌ | needs a new dry-run endpoint; underlying counting query already exists in the sync SQL, just needs to run in "count-only" mode first |
| Diff detection (missing user, changed template/name/card/priv) | ⚠️ partial | `template_distributions` already tracks queued/loaded/failed per template — this gives "changed template" for free. Name/card/priv diffing is not implemented; would need a comparison against `device_user_directory` (which already captures device-reported name/card/priv) |
| Avoid duplicate uploads | ✅ already correct | `syncTemplatesToDevice` skips anything with `dist_status === 'loaded'`; `ON DUPLICATE KEY UPDATE` on `(template_id, device_sn)` prevents duplicate distribution rows |
| Failure handling (continue on one user's failure, log reason/SDK response/device response/retry) | ⚠️ partial | `zk_device_commands` already has `retry_count`, `max_retries`, `error_message`, `status='failed'` per command — the per-command retry/failure primitive exists; there is no aggregation step that turns N failed commands into a single "synchronization report" |
| Audit trail (admin, action, school, device, counts, duration) | ⚠️ partial | `biometric_mapping_history` already logs a `device_sync` action per push today, but only as a one-line reason string ("queued N templates → device"), not structured counts/succeeded/failed/duration — needs either new columns or a JSON metadata field |
| Deployment engine comparing device vs DRAIS users | ❌ | no code path today compares live device user lists against DRAIS state during a template push (it exists for identity-only sync in `sync-identities/route.ts`, but not integrated with template distribution) |

---

## Recommended path (not yet implemented — awaiting decision)

Everything in Phase 4/5 is additive on top of `template_distribution.ts` +
`template_service.ts` + `zk_device_commands` + `biometric_mapping_history` —
no existing table needs to change shape, and no existing behavior needs to
be broken. Concretely, reusing what's already there:

1. **Extend `syncTemplatesToDevice`** to accept a scope (`all | personIds[] | role='staff'|'student' | modifiedSince`) instead of just one optional `personId` — the SQL already joins the right tables, it just needs a `WHERE` variant per scope.
2. **Add a dry-run mode** (same query, `SELECT COUNT(*)` instead of inserting) to power the pre-flight preview (templates to upload, estimated time from a simple per-template constant, conflicts = rows where `dist_status='failed'` already).
3. **Add a bulk entry point** on the Devices route UI, reusing the existing single-device push component's logic, scaled to the new scoped query.
4. **Turn `zk_device_commands.status='failed'` rows into a synchronization report** — group by the just-created batch (would need a lightweight `batch_id` correlation, e.g. a new nullable column or a shared timestamp+device_sn grouping) and render success/fail/retry counts.
5. **Widen `biometric_mapping_history`** (or add a sibling `template_push_batches` table) to hold the structured audit fields (templates uploaded, succeeded, failed, duration) the brief's example shows, rather than a free-text reason string.
6. **Separately**: reconcile `student_fingerprints` (legacy TCP store) into `biometric_templates` so TCP-enrolled users become push-eligible too — this is the one piece that's a genuine data-migration task, not just new UI/API surface.
7. **Separately, lower priority**: a device-model capability table (does this SN/model support `FINGERTMP`?) before any fleet-wide push ships, so a push isn't silently sent to a device that can't accept it.

None of this requires re-architecting the template store, the distribution
table, or the command queue — they were already built for exactly this.
