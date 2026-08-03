# ADR-0001: Attendance is stored as immutable raw events with a dual-write to the legacy table

- **Status:** Accepted (dual-write is transitional)
- **Affects:** `src/lib/attendance/engine.ts`, `attendance_raw_events`, `attendance_records`, `zk_attendance_logs`

## Problem

Attendance originally wrote a verdict directly: a device punch arrived and a "present/late/absent" row was written. That structure makes several ordinary situations impossible to handle correctly.

- **Late identity resolution.** A punch arrives from a device user ID that isn't linked to a person yet. Under a verdict-only model there is nowhere to put it, so it is dropped — and when the mapping is created later, the attendance is simply gone.
- **Rule changes.** A school corrects its "late after" cutoff. Existing verdicts were computed under the old rule and cannot be recomputed, because the inputs were never kept.
- **Clock corrections.** When a device's clock is found to be wrong ([ADR-0003](0003-device-time-policies.md)), the stored verdict is wrong too — and without the raw punch there is nothing to re-evaluate against.
- **Multiple sources.** ZKTeco push, TCP pull, Dahua, and manual marking each had their own write path and their own subtly different behaviour.

## Context

Attendance is the highest-volume table in the system and the most consequential — it feeds report cards, parent notifications, and school decisions about individual learners. Corrections are routine, not exceptional: devices misbehave, identities resolve late, and rules get adjusted mid-term.

Meanwhile `zk_attendance_logs` was read directly by a significant amount of existing code. Changing the storage model and every reader in one step would have been a large, risky, all-at-once migration on live school data.

## Decision

**Separate the record of what happened from the judgement about it.**

- **`attendance_raw_events`** — an append-only log of punches. Source-tagged, so ZKTeco push, TCP pull, Dahua, and manual marking all funnel through one path (`recordRawEvent`).
- **`attendance_records`** — the derived verdict for a `(person, date)`, recomputed from raw events.

`evaluatePunch(rawEventId)` and `evaluateDay(personId, date)` recompute the verdict. Both are **idempotent**: `UNIQUE(person_id, attendance_date)` drives an UPSERT, so re-running yields the same row. That property is what makes recomputation safe to trigger from anywhere — a late identity claim, a clock correction, a rule change — without fear of duplicates.

The engine is deliberately thin. **Every decision lives in the pure rule-evaluator** (`src/lib/attendance/rule-evaluator.ts`); the engine only loads inputs, calls the evaluator, and persists the verdict. That separation is what makes the rules unit-testable without a database.

**Dual-write is a deliberate transitional state.** The ZK handler still writes `zk_attendance_logs` for untouched legacy readers, *then* calls `recordRawEvent` + `evaluatePunch` for the canonical path. The legacy table is intended to become a view.

## Alternatives considered

**Keep the verdict-only model and patch problems as they arise.** Rejected — the failure modes above are structural, not incidental. No amount of patching recovers a punch that was never stored.

**Event sourcing for the whole application.** Overkill. The raw-event pattern is valuable *here* because attendance specifically has late-arriving inputs and retroactive rule changes. Most of DRAIS does not, and the ceremony would not pay for itself.

**Big-bang migration, no dual-write.** Rejected as too risky against live school data with many direct readers of `zk_attendance_logs`. Dual-write allows the canonical path to be proven in production while legacy readers keep working.

**Store only raw events; compute verdicts on read.** Attractively simple, but attendance is read far more often than written (dashboards, reports, parent portal), and the rules involve per-school shifts and policies. Recomputing on every read is too expensive, and it makes "what did we decide" un-auditable.

## Trade-offs

- **Two tables to keep coherent**, plus a third during the transition. A verdict can be stale if recomputation isn't triggered.
- **Dual-write is genuine duplication** and a real source of confusion for new engineers — this ADR exists substantially to explain why the "redundant" legacy write is intentional.
- **Storage cost**: raw events are never deleted.
- **Ordering matters.** Because the legacy write happens first, a failure between the two writes leaves the legacy table ahead of the canonical one.

## Consequences

- Attendance is correctable and re-derivable rather than fixed at write time.
- Late identity resolution works: the punch was captured, so claiming it later is a recomputation.
- Clock corrections ([ADR-0003](0003-device-time-policies.md)) become possible at all — the raw punch survives the correction.
- Rules can change mid-term and be applied retroactively.
- All ingestion sources share one path, so behaviour is consistent.

## Migration notes

**The dual-write is not permanent.** The intended end state is `zk_attendance_logs` as a view over the canonical tables, at which point the legacy write is removed. Before removing it, audit remaining direct readers of that table — the count is the gating factor, and it has not yet reached zero.

Until then: **a new feature must read from `attendance_raw_events` / `attendance_records`, never from `zk_attendance_logs`.** Adding a reader to the legacy table extends the transition.

## Related systems

- `src/lib/attendance/engine.ts` — orchestration
- `src/lib/attendance/rule-evaluator.ts` — the pure decision logic
- [ADR-0002](0002-device-wall-time.md), [ADR-0003](0003-device-time-policies.md) — time handling
- [`../audits/ATTENDANCE_ARCHITECTURE_AUDIT.md`](../audits/ATTENDANCE_ARCHITECTURE_AUDIT.md)

## Future considerations

Raw events grow without bound. No archival strategy exists yet; at some point old raw events for closed academic years will need a retention policy — noting that discarding them also discards the ability to re-derive those years' verdicts.
