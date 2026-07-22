# TCP Pull Forensic Investigation & Device Control Redesign
**Date:** 2026-07-22 · **Status:** AWAITING APPROVAL — no code written
**Scope:** `/attendance/device-control`, `/api/attendance/zk-tcp`, `src/lib/attendance/device-clock.ts`, `node-zklib`, `attendance_raw_events`

---

## 1. Executive Summary

The reported symptom — TCP-pulled attendance shows abnormal timestamps while USB export from the same device is correct — is **real, reproduced from production data, and has six distinct root causes**, all in the DRAIS pipeline (the device data is fine, as the USB export proves).

The central defect is **representation ambiguity**: a device's wall-clock time ("07:06:24") is wrapped into JavaScript `Date` objects under three different conventions at different pipeline stages (server-local by `node-zklib`, wall-as-UTC by the ADMS normalizer, real-UTC after `decidePunchTime`), then serialized back out with formatters that assume a *different* convention than the one used going in. The result is silent ±3 h shifts whose direction depends on **which machine ran the pull** — unacceptable for attendance data.

The stored `punch_at` values from the one production bulk pull (JIPRA, 2026-07-17, 206 rows) are actually **correct instants**; what is corrupted is (a) every *display/export* surface of the pull pipeline, and (b) the stored `device_reported_time` identity field — which breaks dedup for any future re-pull and makes the audit trail lie.

The fix is not a patch: the pull pipeline needs the redesign this mission specifies — raw-first acquisition, operator validation, then explicit persistence — with **one canonical time representation** (the device wall-clock string) preserved end-to-end and converted exactly once, at a defined boundary.

---

## 2. Root Cause Analysis (evidence-backed)

### RC-1 — Wall-clock/UTC representation ambiguity in every display path · CONFIRMED
`node-zklib` builds `recordTime` as `new Date(y,m,d,h,mm,ss)` — **server-local timezone** (`node-zklib/utils.js` `parseTimeToDate`/`parseHexToTime`). The pipeline then:
- `action=attendance` (preview): `rec.recordTime.toISOString()` → subtracts the server's TZ offset from the wall time (route line 324).
- `action=attendance_csv` / `map_attendance`: `formatTime(decision.punchInstant)` formats a **real UTC instant with server-local getters** (lines 162-163) → on a UTC-tz server prints wall−3 h.

**Evidence:** archived export from the incident (`archive/data-dumps/jipra-2026-07-17-attendance.csv`) shows `LocalTime 05:19:33` for punches whose device wall time was 08:19:33 EAT. The inspection JSON from the same session (`jipra-2026-07-17-device-attendance.json`) stores `deviceTimestamp: "…T07:06:24.000Z"` — wall time with a fake `Z`. Output is a function of the *server host's* timezone: same pull, different machine, different timestamps.

### RC-2 — Stored `device_reported_time` identity corrupted by the Jul-17 pull · CONFIRMED
All 206 production rows from `source='manual'` (the TCP pull path) have `device_reported_time == punch_at` (a shifted DATETIME copy) with `clock_skew_seconds = NULL, time_confidence = NULL` — written by an older pull implementation that bypassed `decidePunchTime`. `device_reported_time` is the punch's **dedup identity** (`uk` collapse on re-send); a future re-pull with the current code writes the proper wall string → same physical punch, different identity → **duplicate import instead of collapse**.

**Evidence:** query of `attendance_raw_events WHERE source='manual'`: 206 rows, school 12004, device GED7254601154, all ingested 2026-07-17 16:53–16:54 UTC, all with the NULL markers above; delta analysis shows `punch_at_wall − device_reported_time = +3.0 h` on 100 % of rows (vs 0.0 h on 4,361 healthy ADMS rows).

### RC-3 — Live-ingest clock policy applied to historical bulk pulls · CONFIRMED (design), latent (data)
`decidePunchTime` is built for live punches: when a device is *currently* ahead beyond tolerance, corrected punches get `punchInstant = server-now` (first faulty punch) or `deviceInstant − stored_offset` (an offset learned at a different epoch). Applied to a **bulk pull of historical logs**, this stamps days-old punches with the pull moment or an offset that wasn't true when the punch happened. The USB export would show the true times; DRAIS would not. This is precisely the mission's scenario waiting to recur on any drifted device.

### RC-4 — Device timezone misconfiguration modeled as "drift" · CONFIRMED
Two devices at **different schools** carry near-identical `clock_offset_seconds` ≈ 17,99x s ≈ **5 h ≈ UTC+8 (ZKTeco factory timezone) − UTC+3 (EAT)**. These devices aren't drifting — they're configured in the factory timezone. DRAIS has a per-device `tz_offset_minutes` column but it is NULL everywhere; the tz error is being re-"corrected" per punch forever (1,052 `corrected` rows) instead of being fixed once as device configuration.

### RC-5 — UI "clock offset minutes" field silently replaces the timezone offset · CONFIRMED (code)
`effectiveOffsetMinutes = clockOffsetMinutes || (deviceCtx.tzOffsetMinutes ?? timePolicy.offsetMinutes)` — the free-text UI value is passed to `decidePunchTime` as `deviceOffsetMin`, which **replaces the 180-min timezone offset**, it does not express drift. An operator entering "5" retimes every pulled punch by 2 h 55 m and trips the drift-correction path. A footgun labeled as a convenience.

### RC-6 — Device tenancy mismatch · CONFIRMED
`devices` registers GED7254601154 under **school 12011** (lan_ip 192.168.1.17), yet the Jul-17 pull stored its punches under **school 12004 (JIPRA)** — JIPRA has no devices row at all. Consequences: SN resolution by `lan_ip+school_id` fails, identity resolution can't match, and attendance can be attributed across tenants. Must be reconciled before any re-import.

### Secondary defects
- `pull_attendance` labels rows `source='manual'` — indistinguishable from true manual entries; provenance lives only in `legacy_table='zk_tcp_pull'`.
- Date filtering (`toLocalDateStr`) classifies punches by `toISOString().slice(0,10)` — on a non-UTC server, 00:00–02:59 punches land on the previous day; "pull specific date" drops/misplaces edge punches.
- `getAttendances()` always pulls the **entire device log** and filters in memory — no device-side windowing; slow and bandwidth-heavy on large logs.
- Non-standard record sizes in `node-zklib` (`readUInt32LE(27)` vs `(4)` branch by record length) are firmware-dependent — unvalidated against every deployed model.

---

## 3. Current TCP Pull Architecture

```
Device (ZK TCP 4370)
  └─ node-zklib getAttendances()            recordTime = Date in SERVER-LOCAL tz
       └─ /api/attendance/zk-tcp             881-line route, 20 actions, one switch
            ├─ attendance   → toISOString()               (−serverTZ shift)   [preview]
            ├─ map_attendance / attendance_csv
            │     └─ formatDateTime(local getters) → normalizeDeviceDateTime
            │          └─ decidePunchTime(policy, offsets) → punchInstant
            │               └─ formatDate/Time(local getters)  (−serverTZ shift) [display/CSV]
            └─ pull_attendance (persist)
                  └─ decidePunchTime → recordRawEvent → attendance_raw_events
                       (source='manual', mysql2 timezone 'Z' — writes are UTC-correct)
```
One giant route handler; communication, parsing, time policy, identity resolution, persistence and CSV generation interleaved; connection pool + in-memory state inside the route module; zero acquisition logging; no preview/confirm separation (pull = immediate DB writes).

## 4. Weaknesses
1. Every conversion point re-decides what a `Date` means; correctness depends on host TZ.
2. Pull writes to production tables immediately — no inspection, no operator confirmation, no dry-run.
3. No acquisition audit: who pulled, when, what window, how many records, outcomes — none stored.
4. Dedup identity already corrupted for the 206 stored rows (RC-2) → re-pull double-import risk.
5. Clock policy conflates three distinct things: timezone config, RTC drift, and backlog upload.
6. No per-pull structured logs, no retry semantics, no partial-failure story (per-row try/catch, counts only in the HTTP response).
7. Tenancy is inferred (`lan_ip + session.schoolId`), not verified against the device's own SN.

## 5. UI Review — `/attendance/device-control` (639 lines)
A flat "TCP SDK console": device/IP selector, a **Clock offset (minutes)** free-text input (RC-5), and ~20 buttons that map 1:1 to route actions (info, users, status, attendance, map_attendance, CSV, restart, unlock, enable/disable, LCD write/clear, enroll/cancel, read/capture/save template, raw exec, pull today/full/range). Results render as raw JSON blobs in a rolling list. Judgments:
- Every button has a real function — **nothing should be deleted**, they need grouping (Status / Acquisition / Operations / Diagnostics) exactly as the mission specifies.
- The acquisition actions are the dangerous ones today: `pull_attendance` writes to production with zero preview.
- No device time vs server time comparison anywhere — the single most important diagnostic for this domain.
- Raw `exec` and template operations belong behind an "Advanced" gate (exists as a toggle already).

## 6. Database Review
- `attendance_raw_events` — good bones: `punch_at` (UTC, driver `timezone:'Z'` verified), `device_reported_time` (identity), skew/source/confidence audit columns, dedup unique key. Gaps: no acquisition-batch reference, `source` enum lacks a `tcp_pull` value, 206 rows carry corrupted identity (RC-2).
- `devices` — has `clock_offset_seconds`, `tz_offset_minutes` (unused, NULL), `clock_last_synced_at`; one tenancy misregistration (RC-6).
- `attendance_time_policy` — per-school policy exists; no per-mode distinction (live vs historical import).
- **Missing:** an `attendance_acquisitions` table (one row per pull/import: school, device, operator, method, window requested, counts, duration, status, error) — the audit backbone the mission demands.

## 7. Recommended Architecture

**One rule above all: the device wall-clock string is the canonical value.** It is captured verbatim at the protocol boundary, flows untouched through parsing → staging → inspection → validation, and is converted to a UTC instant exactly once, in one function, at persistence time — with the school/device timezone as explicit input and the conversion recorded on the row.

```
Acquisition adapters (TCP pull │ ADMS push │ USB/CSV import │ manual)
      └─ RawPunch { deviceSn, pin, wallTime:"YYYY-MM-DD HH:mm:ss", verify, io, seq }
           └─ Staging (attendance_acquisitions + acquisition_records; no production writes)
                └─ Validation service (first/last-3 summary, drift vs server, duplicates vs
                   existing, unmatched identities, day-boundary integrity)
                     └─ Operator confirmation (UI)
                          └─ Committer (single tx: wall→UTC once, dedup on (sn,pin,wallTime),
                             provenance source='tcp_pull', batch id, operator id)
                               └─ existing recordRawEvent / engine downstream (unchanged)
```
- `device-clock.ts` stays for **live** ingest; historical imports use a dedicated `TRUST_DEVICE_TIME`-style path where tz is config, not correction (RC-3/RC-4 separation: timezone ≠ drift).
- The tz for conversion comes from `devices.tz_offset_minutes` (set once, surfaced in UI) falling back to school policy — never from a free-text pull parameter (kills RC-5).
- Every acquisition writes a structured `attendance_acquisitions` row (the mission's logging list, verbatim).

## 8. Proposed Device Control Redesign
Four-section console (all existing capabilities preserved):
1. **Device Status** — connection, firmware, serial, platform, user/log counts, **device time vs server time with live difference** (new probe), tz configuration with an explicit "device runs in UTC+X" setting.
2. **Attendance Acquisition** — the mission's wizard: select school→device→date → pull → **Raw Inspection table** (attendance ID, PIN, name-if-matched, RAW wall string exactly as received, verify, status; sticky header, search, pagination) → auto-highlighted first-3/last-3 punches → "Do these match your expectation?" ✓/✗ → on ✓: Preview only / Save (tx) / Export / Cancel; on ✗: Discard / Download raw / Inspect / Retry.
3. **Device Operations** — restart, sync time, enable/disable, LCD, users up/down, fingerprints, enroll, clear logs; destructive ones behind confirmation dialogs; raw exec stays under Advanced.
4. **Diagnostics** — last pull, last success/failure, acquisition history (from the new table), recent errors, clock drift trend.

## 9. Phased Execution Plan
- **Phase 0 — Data reconciliation (prod, transactional, backed up):** fix RC-6 tenancy for GED7254601154; repair the 206 rows' `device_reported_time` to true wall strings (recoverable: `punch_at + 180 min`) and set `source`/confidence markers so future re-pulls dedup correctly. Verification queries before/after.
- **Phase 1 — Acquisition backbone:** `attendance_acquisitions` + `acquisition_records` staging tables + `tcp_pull` source value; modular services (`acquisition/` lib): connector, parser (wall-string-preserving), stager. No UI change yet; existing pull keeps working but now also logs a batch row.
- **Phase 2 — Pull-by-date + Raw Inspection + validation service:** new endpoints (pull→stage only), first/last-3 computation, drift check vs server, duplicate/unmatched detection.
- **Phase 3 — Operator workflow UI:** the acquisition wizard on `/attendance/device-control`, sectioned console, retirement of the free-text clock-offset field (replaced by per-device tz config).
- **Phase 4 — Committer:** confirm→persist path (single transaction, dedup on wall identity, provenance), Preview/Save/Export/Cancel semantics; old direct-write `pull_attendance` becomes stage+auto-workflow or is gated off.
- **Phase 5 — Hardening:** structured logs surfaced in Diagnostics, retry semantics, clock-drift alarms, regression tests (wall-string round-trip property tests across host TZs — `TZ=UTC` and `TZ=Africa/Kampala` in CI), extensibility adapters (USB/CSV import reusing the same staging).

Each phase ships independently; production behavior changes only at explicitly gated points (Phase 3/4).

## 10. Risk Analysis
| Risk | Mitigation |
|---|---|
| Repairing 206 rows touches production attendance | Transaction + full backup + derived-value verification (wall = punch_at+180 min must match ADMS-style identity format); JIPRA sign-off on a sample |
| Re-pull double-import before Phase 0 lands | Freeze use of `pull_attendance` until identity repair is done (operator advisory) |
| Host-TZ-dependent behavior regressions | Property tests run under multiple `TZ=` values in CI; canonical wall-string type (`DeviceWallTime`) so `Date` never carries ambiguous meaning |
| Device firmware variance in zklib record parsing | Capture raw buffers in staging (hex) for the first N records of every pull → diagnosable without device access |
| Tenancy fix breaks the 12011 test-school data | Verify which school physically owns the device with the operator before moving the row |
| Big-log devices slow to pull | Device-side windowing where firmware supports it; else stream+filter with progress reporting in the wizard |

---
*All findings reproducible via read-only queries against production TiDB and the archived Jul-17 dumps in `archive/data-dumps/`. No code or data was modified during this investigation.*
