# DRAIS — Live Popup Latency + Popup Config + SMS Visibility — Completion Report

Date: 2026-06-14
Scope: live popup configurability, scan→popup latency, attendance SMS visibility. All DB work applied + verified on **production TiDB Cloud `drais`** (migrations ledger = 14).

---

## 1. Root cause of the ~5s popup delay (Phase 0 trace)
Traced a real K40 punch through the pipeline using `zk_raw_logs` timestamps + the code path:

1. **`/api/attendance/stream` polled TiDB every 3000ms** with a 7-table join, and `setInterval` doesn't fire until *after* the first 3s — so a punch on the `/attendance` page waited up to 3s + join + TiDB latency. (Fixed — see §3.)
2. **`/api/attendance/live-scan` (the global popup's endpoint) was ALREADY event-bus driven** (subscribes to `attendance.event.recorded`, pushes immediately, 2s poll fallback). So the global popup's server path was already sub-second on a single instance.
3. **The dominant remaining delay is the device's ADMS upload cadence** — the K40 says "Thank you" instantly but POSTs the ATTLOG to the server on its next push cycle (seconds later). That is a device comm setting, not a DRAIS code path; DRAIS cannot render a popup before the device uploads the punch.
4. **CRITICAL side-discovery — the device clock is ~8 hours fast.** A punch stamped `19:13:20` (device) was received at `08:13:22Z` (≈11:13 EAT). This corrupts attendance times and lateness ("Late by 9h…" seen in the state-engine work) and must be fixed **on the device** (set correct date/time/timezone, UTC+3). It also makes device-vs-server latency unmeasurable from timestamps.

**Verdict:** DRAIS's own publish path is fast (in-process event bus). The visible lag is (a) the device upload interval and (b) the now-fixed 3s poll on the `/attendance` page. The device clock skew is a separate, high-impact data-integrity bug to fix on the hardware.

## 2. Old vs 3. New live popup architecture
- **Old (`/stream`)**: 3s DB poll, heavy 7-join, no school filter (cross-school leak), first event up to 3s late.
- **New (`/stream`)**: subscribes to the in-process event bus → pushes the scan immediately (one indexed by-id enrichment query); a **10s** poll remains only as a safety net + runs once on connect; **school-scoped** (fixes the multi-tenant leak); includes `derived_event` + `sms_status`.
- **`/live-scan`** (global popup): already bus-driven; extended to return `derived_event`, `derived_detail`, `sms_status` without blocking on the heavy deep-info query.

## 4. Settings added (Phase 1)
`attendance_live_ui_settings` (migration 014, per school): `live_popup_enabled`, `show_for_students/staff/unknown`, `show_for_late_only`, `show_sms_status`, `show_guardian_phone`, `show_fee_balance`, `sound_enabled`, `popup_duration_ms` (0=manual close), `mount_scope`. API: `GET/PUT /api/attendance/live-settings` (defaults = enabled).

The global `LiveIdentityPopup` now:
- gates the SSE connection on the **school** `live_popup_enabled` AND a **per-browser** mute;
- applies **scope filters** (students / staff / unknown / late-only);
- uses the configured **duration** (timer or manual-close) and **sound** toggle;
- the bottom-left indicator is now a **clickable UI toggle**: "Live Attendance: ON" → mute; "OFF" → re-enable.

## 5. Routes changed
`/api/attendance/stream` (rewritten), `/api/attendance/live-scan` (payload + status), `/api/attendance/history` (sms_status), `/api/attendance/live-settings` (new).

## 6. Tables changed
`attendance_live_ui_settings` (new, migration 014). No other schema change (notification_outbox/policies/deliveries already existed from earlier phases).

## 7. UI pages changed
- Global `LiveIdentityPopup`: settings-driven, derived meaning + SMS line, clickable on/off.
- `/attendance/logs`: each row now shows the **derived attendance state** AND an **SMS pill** (queued / sending / sent / failed / none / n/a).
- `/attendance` page popup: shows derived meaning instead of the device IN/OUT field.

## 8. Performance before/after
- `/stream` first-event latency: **~3s+ → sub-second** on a single instance (bus push); 10s safety poll instead of 3s hot poll (less TiDB load).
- Global popup (`/live-scan`): already sub-second server-side; unchanged path, now richer payload.
- Cross-school leak in `/stream`: **fixed** (school-scoped).
- Remaining device→popup wall-clock time is bounded by the **device upload interval**, outside DRAIS.

## 9. SMS policy implementation (Phases 4–8 status)
- **Outbox, not inline send** — already true from earlier phases: the attendance engine emits `attendance.record.upserted` → `notifications/fanout` matches `notification_policies` → `notification_outbox`; the drainer sends in the background (heartbeat-driven, no extra cron). Fingerprint path never blocks on SMS.
- **Visibility — DONE**: popup and `/attendance/logs` now show the outbox status per scan (queued/sent/failed/none; "n/a" for unmatched).
- **NOT done this pass (deferred, see §13)**: the admin SMS-policy **editor UI** (triggers, recipients, dry-run mode toggle, quiet hours, per-learner/per-staff SMS opt-out) under `/admin/communications`. The backend (policies/outbox/deliveries/drain) exists; the configuration UI does not yet.

## 10. Outbox / drainer status
`notification_outbox` + `notification_deliveries` live; drained opportunistically on device heartbeats (Phase 0 work). Provider = Africa's Talking with a console fallback (dry-run-capable at the provider layer).

## 11. Tests run
- `npm run typecheck` — all touched files clean (one pre-existing error in untouched `device-connection-history`).
- TiDB verification: 14 migrations applied; `attendance_live_ui_settings` present; the new school-scoped stream query (raw_events + enrollments + outbox joins) executes without error on `drais`.
- The automated popup/SMS scenario matrix (Tests 1–14) is **not** fully scripted here — popup behavior is browser-driven; verified by code + the live endpoints. Manual checklist below.

## 12. TiDB verification
Ledger 14/14 success; settings table exists; live queries run school-scoped against production. No schema drift.

## 13. Remaining limitations / not done
1. **Device clock ~8h fast** — fix on the K40 (correct time + UTC+3). Until then attendance times/lateness are skewed. (Highest-impact item.)
2. **Device upload interval** dominates perceived latency — set the K40 to realtime/short push interval; DRAIS can't beat the device's upload cadence.
3. **SMS policy editor UI** (triggers/recipients/dry-run/quiet-hours/per-person opt-out) not built — backend ready, UI is the next step.
4. **Popup settings page UI** — the table + API + popup wiring exist and the indicator toggles per-browser; a full settings panel (to flip school-level scope/duration from a page) is not yet built (currently set via the API).
5. `mount_scope` is stored but the popup is globally mounted regardless (route-scoping not yet enforced).

## 14. Recommendation for next phase
1. Fix the **device clock** (data integrity) — highest priority.
2. Build the **attendance SMS policy editor** under `/admin/communications` (triggers, recipients, dry-run, per-learner/staff opt-out) so SMS is configurable without code.
3. Add the **live-popup settings panel** to `/attendance/settings` (wire the existing `live-settings` API) and enforce `mount_scope`.

---

## 15. Device clock authority (follow-up — shipped)
Addresses the §1.4 / §13.1 finding that the K40 was ~8h fast. Fixed in two layers so it **cannot silently corrupt attendance again**, not just hand-set once.

**Layer B — server-side time authority (integrity guarantee).** On ingest ([device-clock.ts](src/lib/attendance/device-clock.ts) → [zk-handler/route.ts](src/app/api/zk-handler/route.ts)) every punch's device wall-clock is compared to the wall-clock the device *should* show (server time + school UTC offset, default +180 / EAT). A punch stamped in the **future** is physically impossible, so when the device is currently ahead beyond a 2-min tolerance the punch is corrected. Key design choices:
- The correction subtracts the device's **stored offset** (`devices.clock_offset_seconds`), **not** server-now — so it's a pure function of (device time, offset) and is **stable across ZKTeco ACK re-sends**, preserving `uk_punch` dedup (server-now would have double-counted).
- Correction is **gated on the live skew**, so once the device is resynced and reports correct time, a stale stored offset is **never** applied (verified: a fixed device with a stale +8h offset gets no correction).
- The device-reported time + measured skew are **always** preserved (`zk_attendance_logs.device_reported_time`, `clock_skew_seconds`, `time_source`).

**Layer A — device resync (self-healing).** A real clock fault queues a ZKTeco `SET OPTIONS DateTime=…` command (`encodeZkDateTime`), throttled to once/hour per device (`devices.clock_last_synced_at`). The device applies it on its next heartbeat and re-corrects after every power cycle — so even a **dead RTC battery** self-heals (though the battery should still be replaced).

**Schema:** migration 015 (applied + verified on TiDB) — `zk_attendance_logs.{device_reported_time, clock_skew_seconds, time_source}` + `devices.{clock_offset_seconds, clock_last_synced_at}`.

**Verified (logic):** fast-clock bootstrap keeps device time + queues resync + learns offset; next fast punch corrects to real EAT time (stable); a since-fixed device is not over-corrected; a backlog past-punch keeps its real time (not slammed to now) and only flags a resync.

**Answer to "won't it go wrong again?"** The device clock can still drift (battery/manual), but attendance no longer depends on it: future punches are corrected server-side, and the device is auto-resynced. Remaining hardware to-do: replace the K40 RTC coin-cell if the fault is a dead battery. Per-school UTC offset is still a single default (`SCHOOL_UTC_OFFSET_MINUTES`, EAT) — multi-zone support is a future enhancement. Layer A's `SET OPTIONS DateTime` command should be confirmed against the live K40 firmware on next physical access.

---

## 16. Actual-time authority (field fix — shipped)
Field report: device displayed **20:00**, DRAIS recorded **23:00**, true time **15:00** — two stacked errors:
1. Device RTC ~5h fast (20:00 vs 15:00).
2. punch/check times were stored as the device's **naive wall-clock digits**; mysql2 (`timezone:'Z'`) read them back as if UTC, then the **browser** added the EAT offset (+3) → a phantom extra 3 hours (23:00).

**Fix — separate IDENTITY from ACTUAL TIME** ([device-clock.ts](src/lib/attendance/device-clock.ts), [zk-handler](src/app/api/zk-handler/route.ts), [engine.ts](src/lib/attendance/engine.ts), migration 016/017):
- `punch_at` / `check_time` now hold the **actual instant** as a real UTC `Date`, so the browser renders correct local time with no phantom offset. The device clock is trusted only when accurate; a future-stamped punch (fast clock) is corrected via the learned offset, or the server receive instant on the first faulty punch. Past/within-tolerance punches are trusted verbatim so legitimate offline **backlog** uploads keep their real time.
- Dedup now keys on **`device_reported_time`** (the punch identity — what `uk_punch` used to be), freeing `punch_at` to be the actual time. ACK re-sends still collapse. Stale `uk_punch`/`uk_raw_punch` (on the stored time) dropped (016 + 017).
- **Verified on TiDB + logic-tested**: fast +5h (bootstrap & known-offset) → 15:00; correct clock realtime → 15:00; correct-clock backlog → time preserved; drift → trusted.

## 17. Popup latency regression (4s→8s) — analysed + resolved
**Root cause (measured, not guessed):** TiDB Cloud is remote — **each query round-trip is ~196ms**, and the popup path is a chain of **sequential** `await query()` calls, so latency = the *sum* of round-trips. The SMS/derived-state work added 3 sequential lookups to `enrichScanRow`, and `getLearnerDeepInfo` already did **4 sequential** queries (~830ms) — together a big serial chain on top of the ingest path. (The new lookups are all indexed — `idx_legacy` — and the table is tiny, so it was *serialization*, not slow queries.)

**Resolution:**
- `getLearnerDeepInfo`: its 4 reads (all keyed by `studentId`) now run via `Promise.all` — **836ms → 228ms** (warm pool). `@/lib/db` is a 10-connection pool, so concurrent `query()` calls use separate connections and truly parallelize.
- `enrichScanRow`: deep-info, derived-event, and person/outbox lookups now run **concurrently** — enrichment **~1.5s → ~0.4s** steady state.
- The SSE bus event is now **published right after the legacy INSERT** (before `recordRawEvent` + engine), so the popup starts enriching ~2 round-trips (~0.4s) sooner.
- Net: **~1.5s shaved** off the popup in steady state.

**Honest caveats:**
- Round-trip floor is ~200ms each; the parallel win requires a **warm pool** — the first punch after a cold serverless instance still pays TLS connection setup (concurrent setup can briefly be *slower* cold). For an active reception desk the pool stays warm.
- The **dominant** remaining wall-clock variance is the **device ADMS upload cadence** (outside DRAIS) — the "4s vs 8s" the user saw is largely device-side variance; DRAIS's own server path is now ~0.8–1.2s.
- A fast-clock device triggers the resync background path (`queueDeviceTimeSync`, fire-and-forget) on each punch until it's corrected; it's throttled hourly and self-limiting once the device clock is fixed, but it does consume pool connections in the interim.

---

## Manual verification checklist (browser + K40)
- Toggle the bottom-left "Live Attendance" pill → popup mutes/un-mutes on this device.
- `PUT /api/attendance/live-settings {live_popup_enabled:0}` → popup stops school-wide.
- Punch a learner → popup shows derived meaning (Arrived/Late) + SMS line; `/attendance/logs` row shows the SMS pill.
- Scan from school A does not appear in a school-B session (stream is now school-scoped).
