# `src/lib/events/` — The typed event bus

A single typed publish/subscribe surface for cross-cutting events. The first publisher was the attendance
engine; notification fanout is the first subscriber.

## The constraint that governs everything here

> **The bus is in-process. It does not cross serverless instances.**

On Vercel, each request may be served by a different lambda. A `publish()` in the ingest handler reaches only
subscribers registered **in that same invocation**. Anything subscribed in a different request, or in a
different instance, receives nothing.

In the Electron desktop build the process is shared, so the bus works as you would expect — which is exactly
what makes this dangerous. **A feature built on the bus works locally and silently does nothing in
production.** It is the single most common source of "it works on my machine" in DRAIS.

## What this means in practice

| You want | Do this |
|---|---|
| React to an event **within the same request** | Subscribe on the bus. This is what it is for. |
| Deliver something **later** or **elsewhere** | Write a durable row — `notification_outbox`, `platform_jobs` — and let a drainer or the job runner pick it up. |
| Push a UI update to a browser | You cannot. Live surfaces **poll**. The live attendance popup is ingest + poll bound, not push bound. |
| Fan out to several handlers reliably | Persist first, then fan out from the persisted row. |

## Working in this folder

- **Fanout must happen in the same invocation as the publish**, or via a durable row. There is no third option.
- **Subscribers must be registered before the publish runs** in that invocation — registration is not global
  state that survives.
- **Never make a feature depend on the bus for delivery guarantees.** It has none.
- **Keep events typed.** The value of a single surface is that the payload shape is checked; an untyped
  `emit('thing', anything)` gives up the only thing the bus buys you.
- **Do not "optimise" a poll into a bus subscription.** That conversion is the bug, not the fix.

## Relationship to the comm engine

Do not confuse the two:

- **`src/lib/events`** — in-process, synchronous, typed. Cross-cutting hooks inside one request.
- **[`src/lib/comm`](../comm/README.md)** — the communication engine. `emit('learner.attendance.checkin', …)`
  there resolves rules, templates, recipients and a provider, and can **stage** a message for review. That one
  is durable.

A feature that wants to notify a guardian uses `comm`, not this.

## Related

[`../comm/README.md`](../comm/README.md) · [`../notifications/README.md`](../notifications/README.md) — the outbox and drainer, and why the drainer had to be extracted from its route · [`../ingestion/README.md`](../ingestion/README.md) · [`../control/README.md`](../control/README.md) — `platform_jobs`, the durable alternative
