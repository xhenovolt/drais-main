# ADR-0003: Device clock drift is handled by explicit per-school time policies

- **Status:** Accepted
- **Affects:** `src/lib/attendance/device-clock.ts`, `src/lib/attendance/time-intelligence/`, `attendance_time_policy`

## Problem

Biometric attendance devices have unreliable clocks, and DRAIS has no control over them. They drift, they get reset to factory defaults after a power cut, their RTC batteries fail, and staff occasionally set them by hand to the wrong time.

The stored punch time is the basis for whether a learner is marked present or late — a decision that goes on a report card and gets communicated to a parent. Trusting a wrong clock produces confident, official, wrong records.

But the naive fix — always use the server's receive time — is also wrong. Devices legitimately buffer punches while offline (a school's internet drops for a morning) and upload them in a batch hours later. Stamping those with server-receive time marks an entire morning's arrivals as late.

**Neither "trust the device" nor "trust the server" is correct.** The right answer depends on the school, the device, and the specific failure mode.

## Context

A concrete production case at JIPRA drove the final design. A device's clock skew was measured across a day:

```
-17992s  (held for hours)
   +154s
+17992s
+21600s
```

That is not drift. Drift is smooth and monotonic — a crystal running slightly fast accumulates error gradually. This clock was **jumping between unrelated readings**: the signature of a failing RTC battery.

This broke the existing correction strategy in a specific, instructive way. `CORRECT_BY_DRIFT` recovers the true instant using a learned offset stored on the device record (`devices.clock_offset_seconds`) — a value remembered across ingests. That memory is a reasonable model for a steadily-drifting clock. For a *jumping* clock it is actively harmful: by the time a correction is applied, the remembered offset can be hours stale and describe a clock state that no longer exists. The correction makes the data worse than leaving it alone.

## Decision

Clock handling is a **per-school configured policy**, resolved via `resolveTimePolicy()`, not a single global strategy. Five policies (`DeviceTimePolicyKind` in `src/lib/attendance/device-clock.ts`):

| Policy | Behaviour |
|---|---|
| `TRUST_DEVICE_TIME` | Store the device wall clock as-is. Never override, never auto-sync. |
| `TRUST_SERVER_RECEIVE_TIME` | Always stamp `punch_at` with the server receive instant. |
| `CORRECT_BY_DRIFT` | Trust the device unless it reads future/ahead; recover the real instant via a learned offset. |
| `MANUAL_REVIEW_IF_DRIFT` | Keep device time, but flag the batch for human review when drift exceeds the configured maximum. |
| `ADAPTIVE_DRIFT_NO_MEMORY` | As `CORRECT_BY_DRIFT`, but **never consults the historical remembered offset** — only a fresh, same-batch measurement is trusted. |

`ADAPTIVE_DRIFT_NO_MEMORY` exists specifically for failing-RTC devices. When same-batch evidence is insufficient, it falls back to server-now — the same "first faulty punch" safety net `CORRECT_BY_DRIFT` uses — rather than guessing from a possibly-stale memory. **Falling back to a known-imperfect-but-fresh value beats applying a confidently-wrong correction.**

Alongside this, the time-intelligence module scores each batch's trustworthiness and surfaces drift to operators rather than silently absorbing it. Corrections are **operator-driven and auditable**, not automatic rewrites of attendance history.

## Alternatives considered

**One global strategy.** Simplest, and what existed first. Fails because the correct behaviour genuinely differs — a school with reliable devices and good power wants `TRUST_DEVICE_TIME`; one with a failing device needs `ADAPTIVE_DRIFT_NO_MEMORY`; a cautious school wants everything flagged for review.

**Always use server receive time.** Robust against bad clocks, but destroys offline-buffered batches — the exact scenario these devices are deployed to handle. Would mark whole mornings late.

**Auto-sync device clocks from DRAIS.** Attractive, and partially supported, but not a foundation to build on: it requires reachability at the right moment, and it cannot fix a clock that jumps *between* syncs. It reduces the problem; it does not remove the need to reason about untrusted times.

**Reject batches from drifting devices.** Refuses to record attendance that genuinely happened. Unacceptable — the learner was there.

**Silently correct everything automatically.** Rejected on principle. Attendance is a record with real consequences for learners; a system that rewrites it without a human decision and an audit trail is not trustworthy. This is why corrections are surfaced, previewed, and applied deliberately.

## Trade-offs

- **Five policies is genuine complexity** — an engineer must understand all of them to reason about a punch's stored time.
- **Schools must be configured correctly.** A school on the wrong policy gets wrong data, and the default cannot be right for everyone.
- **`ADAPTIVE_DRIFT_NO_MEMORY` deliberately discards information** (the remembered offset) that is useful for well-behaved devices. It is a worse policy for a healthy clock — which is why it is opt-in per school rather than the default.
- **Operator-driven correction means drift persists until someone acts.** Chosen over silent auto-correction; the surfacing is what makes it workable.

## Consequences

- Time handling is a data/configuration concern, not a code change per school.
- The device's originally-reported time is preserved (see [ADR-0002](0002-device-wall-time.md)), which is what makes drift *detectable* — you cannot measure a clock's error after normalizing away what it said.
- Attendance corrections have an audit trail and are reversible.
- New failure modes can be added as new policies without disturbing existing schools.

## Migration notes

Schools default to a conservative policy; those with known-bad hardware are moved to `ADAPTIVE_DRIFT_NO_MEMORY` deliberately after their drift pattern is examined. Historical data ingested before a policy change is not retroactively re-corrected — the correction tooling exists for that and is applied explicitly.

## Related systems

- `src/lib/attendance/device-clock.ts` — policy definitions and resolution
- `src/lib/attendance/time-intelligence/` — drift detection, confidence scoring, correction tooling
- [ADR-0002](0002-device-wall-time.md) — preserving what the device reported
- [`../guides/ATTENDANCE_POLICY_SCOPING.md`](../guides/ATTENDANCE_POLICY_SCOPING.md)

## Future considerations

The policy set is deliberately closed and small. Before adding a sixth, check whether the new failure mode is genuinely distinct or a parameter of an existing policy — the value here is that each policy corresponds to a real, observed hardware behaviour.
