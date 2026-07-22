# DRAIS Stability Execution — Device Time, Fees Ledger, Parent Portal Readiness

Verified against **TiDB Cloud** (`gateway01***/drais`), school 12011, superadmin. Commits: fees `1f5a50f`, time policy `…84/85`.

---

## 1. Device time mismatch — root cause
The correction logic was **not school/device-aware**:
- **Single global offset.** `decidePunchTime` used `SCHOOL_UTC_OFFSET_MINUTES` (one env value) for *every* school/device. Different machines/schools could not resolve to different zones, so corrected times were inconsistent.
- **Unconditional auto-sync.** Whenever a device drifted >2 min, DRAIS queued a `SET OPTIONS DateTime` command to the device — with **no opt-out**. That is the "when a machine connects, DRAIS changes its time" symptom.
- **Why the 5h-earlier machine "appeared correct" but the corrected one was wrong:** under the drift policy a clock reading in the **past** (behind/backlog) is *trusted* (to preserve genuine offline backlog) — so a 5h-slow machine silently recorded the device's own wrong (earlier) time and looked "fine," while a machine reading the **future** (ahead) was force-corrected against the wrong global offset → visibly wrong. The behavior diverged by drift *direction* and a global (often mismatched) offset.

Raw device time, server-receive time, and corrected time were already all stored — the missing piece was a **per-school policy** governing which is authoritative and whether DRAIS may touch the device clock.

## 2. Device time policy implemented
New per-school policy with four modes (default `CORRECT_BY_DRIFT`):
| Policy | Behaviour |
|---|---|
| `TRUST_DEVICE_TIME` | Store device wall-clock as-is (minus tz). Never correct, never sync. |
| `TRUST_SERVER_RECEIVE_TIME` | Stamp punch = server receive instant always. |
| `CORRECT_BY_DRIFT` (default) | Trust device unless it reads in the future; recover real time from learned drift; preserve backlog. |
| `MANUAL_REVIEW_IF_DRIFT` | Keep device time but flag rows over the drift limit (`time_confidence='review'`). |

Plus: `school_timezone` + `utc_offset_minutes`, per-device `tz_offset_minutes` override, `auto_sync_device_time` (**OFF by default — DRAIS no longer changes device clocks unless opted in**), `max_allowed_drift_seconds`, `correct_offline_backlog`, `display_raw_and_corrected_time`. Every punch records `time_source` + `time_confidence` + `clock_skew_seconds`; raw device time is never destroyed. Auto-sync, when enabled, is **per-device** (throttled hourly), never global. **Phase-2 matrix tested** (correct / 5h-behind / 5h-ahead / backlog) across all four policies — results as designed.

## 3. Tables changed
- **New** `attendance_time_policy` (per school).
- `devices` + `tz_offset_minutes`.
- `zk_attendance_logs`, `attendance_raw_events` + `time_confidence`.
(migration `018_device_time_policy.sql`, applied + verified on TiDB.)

## 4. Routes changed
- New `GET/PUT /api/attendance/time-policy`.
- `src/app/api/zk-handler/route.ts` — resolves policy per batch; auto-sync now gated on `auto_sync_device_time`.
- `src/lib/attendance/device-clock.ts` — `resolveTimePolicy`, policy-aware `decidePunchTime`, per-device tz, `getDeviceTimeContext`.
- `src/lib/attendance/engine.ts` — persists `time_confidence`.

## 5. UI settings changed
`/attendance/settings` → **Device Time Policy** panel (timezone, policy selector, max drift, auto-sync toggle with warning, backlog toggle, raw+corrected display toggle).

---

## 6. Fees ledger — root cause
`GET /api/finance/ledger/fees` 500'd on TiDB (→ "Failed to load fees ledger"). **Three** bugs, each fatal:
1. **Invalid nested aggregate** — the summary query used `COUNT(CASE WHEN SUM(sfi.balance)=0 …)` with no GROUP BY → `Invalid use of group function`.
2. **Non-existent `sections` table** joined (`LEFT JOIN sections`). The real schema uses **streams**.
3. **Non-existent `students.section_id`** referenced.

## 7. Fees ledger — fix
- Summary rewritten with a **per-student derived table** then aggregated.
- `sections` → `streams`; `s.section_id`/`e.section_id` → `e.stream_id` (section filter now maps to stream).
- Verified on TiDB: main (50 rows), count (624), summary all succeed. Commit `1f5a50f`.
- `student_fee_items` columns were all present — no schema change needed there. Balance source for the list/popup is `student_ledger` (separately verified working).

## 8. TiDB Cloud verification
All changes applied + queried against TiDB Cloud: migration 018 applied; fees ledger queries return rows; time-policy table created; policy matrix validated by the decision engine.

---

## 9. Parent portal readiness report
**Present (✓):**
- Parent identity table `parents` (id, school_id, name, phone, email) — **but 0 rows** (unused).
- Linking `student_parents` (student_id, parent_id, relationship) — **0 rows**.
- **Populated** guardian path today is `student_contacts` → `contacts` → `people` (phone/email); 42 people have phones.
- `auth_codes` (user_id, purpose, code, expires_at, consumed_at) — OTP/verification infra exists (keyed to `users`).
- `users`, `sessions`, `user_sessions`, `user_roles` — auth infra.
- `/api/admin/parent-links` — staff approval queue for parent→learner link requests (scaffolded).
- Reusable read data: `student_ledger` balances (now stable), `students/[id]/timeline`, `students/[id]/profile`, attendance (now trustworthy).

**Gaps (must close before building):**
1. **Two parallel guardian models** — empty `parents`/`student_parents` vs populated `contacts`/`student_contacts`. Unify (decide canonical, migrate/link) or the portal won't map parents to real guardian data.
2. **No parent authentication** — parents aren't in `users`; `auth_codes` is user-keyed. Need parent-capable identity + phone-OTP login.
3. **No parent-scoped read APIs** — existing reads are admin/staff-scoped; need versions that enforce "this parent sees only their linked learners."
4. **No `/parent` UI.**

**Verdict:** data foundations (attendance time, fees) are now **trustworthy after this work**; identity/linking exist as tables but are **unused and not unified**, and there is **no parent auth or parent-scoped API/UI**. Readiness ≈ 40% (schema scaffolding yes; auth + scoped access + unified guardian model no).

## 10. Parent portal phased roadmap
- **P1 — identity + linking:** pick the canonical guardian model (recommend `contacts`/`student_contacts`, which holds the real data; treat `parents`/`student_parents` as deprecated or backfill from contacts). Add `parent_user` identity + per-parent→learner permission rows. Admin approval via existing `/api/admin/parent-links`.
- **P2 — auth / OTP login:** phone-based OTP using `auth_codes` (extend to parent identities); short-lived parent session tokens, rate-limited.
- **P3 — attendance view:** parent-scoped read of `attendance_records`/raw events for linked learners, showing corrected time + `time_confidence`.
- **P4 — academics view:** results/report snapshots (read-only, published only).
- **P5 — fees view:** `student_ledger` balance + items for linked learners (reuse fixed fees queries, parent-scoped).
- **P6 — report card download:** gated to published snapshots.
- **P7 — communications/SMS prefs:** per-parent opt-in/out, reuse `notification_policies`/outbox.
- **P8 — mobile-first parent UI** under `/parent`.

## 11. Remaining risks
- **Slow-clock realtime devices** (behind clock, not backlog) are trusted under `CORRECT_BY_DRIFT` and look "correct" but aren't — mitigate with `MANUAL_REVIEW_IF_DRIFT` or enabling per-device auto-sync; truly fixing requires correct device hardware time. Replace dead K40 RTC batteries.
- **Guardian-model split** is the biggest parent-portal blocker; resolve in P1 before any portal code.
- Auto-sync remains OFF by default — schools that *want* DRAIS to fix device clocks must opt in per the new setting.
- This work was verified by DB reproduction + the decision-engine matrix; an end-to-end live device punch through the new policy on a warm server is still recommended before pilot.
