# `src/lib/passouts/` — Pass-outs and gate control

A learner leaving school grounds during the day: request, approval, identity verification, the gate decision, and the SMS to the guardian.

## Two rules that define the module

**1. A pass-out is never created on a bare list pick — identity is verified first.**

`identity.ts` supports three methods: `fingerprint` (device PIN → `biometric_enrollments`), `card` (student ID / admission number, typed or scanned), and `manual` (name search → explicit `student_id`, permission-gated at the route). Picking a name off a list is the failure mode this prevents; the whole point of the module is knowing which child actually left.

**2. SMS fires only after something real happened at the gate.**

Not on create. Not on approve. `notifyExit` fires only after the exit row is written; `notifyReturn` only after the return is recorded. **Parents are only ever told what actually happened** — a notification for a pass that was approved but never used would be worse than none.

Both are fire-and-forget: the gate popup never waits on SMS.

## The gate decision

```
decideGate()   READ-ONLY, fast — safe on the live-scan hot path
applyGate()    READ+WRITE — records the exit/return + a passout_event
```

Checks: an active pass exists · **approval is complete** · not expired · not already used or returned.

**Only status `approved` opens the gate.** A pending pass, or one that has cleared only the first step of two-step approval, never does. Splitting the read-only decision from the write is what lets the live-scan path stay fast while keeping the recording auditable.

## Everything is configurable, nothing is hardcoded

Settings live in the shared `school_settings` key/value table under a `passout.` prefix — no new tables:

| Key | Effect |
|---|---|
| `passout.notifications_disabled` | no pass-out SMS at all |
| `passout.notify_exit` | SMS the guardian after gate exit (default on) |
| `passout.notify_return` | SMS when the learner returns |
| `passout.emergency_only` | only emergency/medical passes notify |
| `passout.approval_mode` | `single` (default) or `two_step` |

`smsAllowed()` is a pure function and unit-tested.

## Reuse over reinvention

`notify.ts` **reuses the shared SMS infrastructure** — `notification_policies`, `notification_outbox`, and the outbox drainer, which already own provider selection, retries and delivery logging. Nothing new was built for pass-out messaging. See [`../notifications/README.md`](../notifications/README.md).

## Files

| File | Purpose |
|---|---|
| `engine.ts` | `decideGate` / `applyGate`. |
| `identity.ts` | The three verification methods. |
| `store.ts` | Request CRUD, approval workflow, `passout_events` audit, dashboard intelligence. |
| `settings.ts` | The keys above, plus `nextApprovalState` and the pure `smsAllowed`. |
| `notify.ts` | Guardian SMS via the shared outbox, governed entirely by settings. |
| `visitation.ts` | Visitation-card verification at the gate: VISIT ALLOWED / VISIT DENIED / UNKNOWN CARD. |
| `schema.ts` | Runtime schema ensure, promise-gated (same pattern as the attendance engine). Adds movement-management columns to the existing `passout_requests` / `passout_events` tables. ALTERs are best-effort — "duplicate column" on re-run is expected and ignored. |

## Working in this folder

- **Never notify before the physical event is recorded.**
- **Keep `decideGate` read-only.** A write on the scan path slows every gate interaction and makes the hot path fail on a database hiccup.
- **New behaviour goes in settings**, not in a branch. Schools differ on approval depth and on what parents are told.
- **Don't build new SMS plumbing.** Extend the shared outbox.

## Tests

`npm run test:passouts`

## Known constraints

- **A pass approved but never used generates no record of intent** at the gate — by design, but it means "who was approved to leave today" and "who left" are separate questions.
- **Runtime schema ensure means schema drift is possible** between environments until the migration runs.
- **Manual identity verification is only as strong as the operator.** The permission gate is the control.
- **SMS depends on the drainer running** — see [`../notifications/README.md`](../notifications/README.md).

## Dependencies

`src/lib/db` · `src/lib/biometric` (fingerprint identity) · `src/lib/notifications` (outbox) · `node:crypto`

## Related

[`../notifications/README.md`](../notifications/README.md) · [`../biometric/README.md`](../biometric/README.md) · [`../attendance/README.md`](../attendance/README.md)
