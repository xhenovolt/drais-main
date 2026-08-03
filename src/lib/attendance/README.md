# `src/lib/attendance/` — Attendance engine

The largest subsystem in DRAIS (~72 files) and the most safety-critical: its output decides whether a learner is marked present or late, which reaches a parent and a report card.

**Read [ADR-0001](../../../docs/adr/0001-attendance-raw-events.md), [ADR-0002](../../../docs/adr/0002-device-wall-time.md), and [ADR-0003](../../../docs/adr/0003-device-time-policies.md) before changing anything here.** Most of what looks odd in this folder is the fix for a specific production incident.

## Responsibilities

Ingest punches from biometric devices (ZKTeco push/TCP-pull, Dahua) and manual marking; resolve them to people; decide a per-day verdict against school rules; detect and correct untrustworthy device clocks; and surface all of it to operators with enough evidence to act on.

## The shape of it

```
device / manual
      │
      ▼
acquisition/        wall-clock capture, tz-invariant  (ADR-0002)
      │
      ▼
recordRawEvent()  → attendance_raw_events   (append-only)
      │
      ▼
rule-evaluator.ts   PURE decision logic — no DB
      │
      ▼
evaluatePunch() / evaluateDay()  → attendance_records  (idempotent upsert)
```

**Raw events are the record; `attendance_records` is a derived verdict.** Verdicts are recomputed, never patched — which is what makes late identity resolution, rule changes, and clock corrections possible at all.

## Entry points

| Function | File | Purpose |
|---|---|---|
| `recordRawEvent(input)` | `engine.ts` | Insert a raw event. All sources funnel through here. |
| `evaluatePunch(rawEventId)` | `engine.ts` | Recompute the verdict for the (person, date) of that event. |
| `evaluateDay(personId, roleType, date)` | `engine.ts` | Recompute by explicit person+date. Used by late identity claims. |
| `resolveTimePolicy(schoolId)` | `device-clock.ts` | The school's device-time policy and UTC offset. |
| `finalizeDay(...)` | `finalize-day.ts` | Close out a day (absences for those who never punched). |

Both `evaluate*` functions are **idempotent** — `UNIQUE(person_id, attendance_date)` drives an upsert, so re-running is always safe.

## Sub-modules

- **`acquisition/`** — protocol boundary. Captures the device's timezone-less wall-clock string and keeps it as a string until exactly one UTC conversion at persist time. **Nothing here may consult the host timezone** ([ADR-0002](../../../docs/adr/0002-device-wall-time.md)).
- **`time-intelligence/`** — clock-drift detection, confidence scoring, the first-arrival health check, and operator-driven correction (preview → apply → undo). See [ADR-0003](../../../docs/adr/0003-device-time-policies.md).
- **`migrations/`** — runtime ensure-schema fallback. Duplicates managed migrations; see [`docs/database/MIGRATIONS.md`](../../../docs/database/MIGRATIONS.md).
- **`export/`** — attendance data export.
- **`__tests__/`** — pure-function tests around the evaluator and time logic. `npm run test:attendance`.

## Key files

`engine.ts` (orchestration, deliberately thin) · `rule-evaluator.ts` (**all** decision logic, pure) · `device-clock.ts` (the five time policies) · `shifts.ts` / `policy-resolver.ts` (per-school rules) · `recovery.ts`, `historical-repair.ts`, `raw-event-backfill.ts` (repair paths) · `founder-independence.ts` (the autonomy scorecard, see [ADR-0012](../../../docs/adr/0012-founder-independence.md))

## Extension guidelines

- **Decision logic goes in `rule-evaluator.ts`, not the engine.** The engine loads inputs, calls the evaluator, persists the verdict. Keeping decisions pure is what makes them testable without a database — preserve that split.
- **New ingestion sources call `recordRawEvent`.** Do not write verdicts directly and do not invent a parallel ingestion path.
- **Never write to `zk_attendance_logs`** from new code. It is a legacy dual-write target being retired ([ADR-0001](../../../docs/adr/0001-attendance-raw-events.md)); adding readers or writers extends the transition.
- **Adding a time policy?** Check first whether the failure mode is genuinely distinct from the existing five, or just a parameter of one. Each policy corresponds to a real observed hardware behaviour — that is what makes the set meaningful.
- **Corrections must stay operator-driven, previewable, and undoable.** Attendance is a record with consequences; silent automatic rewriting is out of bounds.

## Known constraints

- **Dual-write is live.** The ZK handler writes the legacy table *then* the canonical path. Removal is gated on the remaining direct readers of `zk_attendance_logs` reaching zero.
- **Raw events grow without bound.** No archival policy exists — and discarding them also discards the ability to re-derive those verdicts.
- **`toISOString().slice(0,10)` is wrong here.** In EAT it rolls the day backwards. Use `src/lib/datetime/local-date.ts` ([ADR-0004](../../../docs/adr/0004-timezone-safe-dates.md)).
- **Tests cover the pure evaluator, not the routes.** Ingestion endpoints have no automated coverage.

## Dependencies

`src/lib/db` · `src/lib/datetime/local-date.ts` · `src/lib/biometric/identity/` (person resolution) · `src/lib/comm/` (notifications on check-in)

## Related

[`docs/adr/0001`–`0004`](../../../docs/adr/README.md) · [`docs/guides/ATTENDANCE_POLICY_SCOPING.md`](../../../docs/guides/ATTENDANCE_POLICY_SCOPING.md) · [`docs/audits/ATTENDANCE_ARCHITECTURE_AUDIT.md`](../../../docs/audits/ATTENDANCE_ARCHITECTURE_AUDIT.md) · [`docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md`](../../../docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md)
