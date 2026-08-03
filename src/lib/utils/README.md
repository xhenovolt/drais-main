# `src/lib/utils/` — Reliability utilities for device sync

Not a general grab-bag. Despite the name, three of these four files exist for one purpose: **making device
communication reliable when the device is unreliable.**

(General helpers live in `src/lib/utils.ts` and `src/utils/`. This folder is the sync-reliability set.)

## The problem they solve

A ZKTeco device on a school network is not a well-behaved API. It drops connections mid-transfer, ACKs
commands it will not execute, disappears for hours, and re-sends records it already sent. Sync operations are
therefore **retried routinely** — not exceptionally.

That makes three properties mandatory:

| File | Provides | Because |
|---|---|---|
| `idempotency.ts` | Safe retries via database constraints and transactions | A retried sync must not create duplicate enrolments or duplicate attendance rows. |
| `retry.ts` | Exponential backoff **and a circuit breaker** | A device that is down should be backed off, then stopped being called — not hammered every tick. |
| `parallel.ts` | Queue-based concurrent workers | Syncing devices one at a time does not finish before the school day starts. |
| `runtime-check.ts` | `isNodeRuntime()` | Middleware runs on Edge; route handlers run on Node. Code shared between them must know which. |

## The circuit breaker

Worth understanding before changing retry behaviour. Backoff alone is not enough: with a device that is
genuinely offline, retrying forever consumes the worker pool and starves devices that *are* reachable.

The breaker trips after repeated failures and short-circuits further calls until a cool-off passes. **A tripped
breaker is a normal operating state during a power cut**, not an error to alert on.

## Idempotency

Retry-safety here comes from **database constraints**, not from application-level bookkeeping. A unique key
makes a duplicate insert fail loudly and locally, which is far more reliable than a flag someone must remember
to check.

This is the same reasoning as `biometric_enrollments`' `uk_school_pin`: the constraint is the guarantee.

## `runtime-check.ts`

Nineteen lines, and it exists because of a real boundary. The **Edge runtime cannot reach the database** — that
is why middleware only checks cookie *presence* while route handlers do real authentication. Shared code that
might run in either place must branch on `isNodeRuntime()` rather than assume Node APIs exist.

## Working in this folder

- **Any new sync operation must be idempotent.** Assume it will run twice; the only question is whether that
  is harmless.
- **Do not remove the circuit breaker** to "get more retries through". It exists because unbounded retries
  starve the pool.
- **Tune concurrency against real devices.** More workers is not automatically faster — a school's network and
  the device's own throughput are the limits, not CPU.
- **Never block an identity operation on a device round-trip.** Queue the command with an expiry; DRAIS-side
  state must be correct whether or not the device ever answers.

## Related

[`../biometric/README.md`](../biometric/README.md) — the identity operations these protect · [`../devices/README.md`](../devices/README.md) · [`../ingestion/README.md`](../ingestion/README.md) · [`../control/README.md`](../control/README.md) — `platform_jobs` uses the same backoff reasoning
