# `src/lib/notifications/` — Notification outbox and drainer

The durable queue behind event-driven notifications: policies match events, rows land in `notification_outbox`, and a drainer sends them.

Distinct from [`src/lib/comm/`](../comm/README.md), which is the broader event → template → provider engine. This folder is the **policy fanout + outbox** half, used directly by pass-outs and attendance.

## The bug this folder's shape is a response to

The drainer originally lived inside the `GET` handler of `/api/cron/notification-drain`. The audit found **that route was never scheduled** — `vercel.json` has no cron for it, and the Vercel Hobby plan allows only one, already spent. Queued notifications therefore never sent, silently, for as long as that was true.

So the core was extracted into `drain.ts` and given **two callers**:

1. `/api/cron/notification-drain` — for external schedulers (cron-job.org, a school server crontab).
2. The existing scheduled path, which pumps the queue as part of work that actually runs.

**The lesson generalizes: on this deployment, "add a cron" is not available.** New periodic work must attach to something that already runs. The Control Center's [`platform_jobs` runner](../control/README.md) is the general solution to the same constraint.

## Pipeline

```
typed event bus
   ↓
fanoutAttendanceRecord(event)
   ↓  load active notification_policies for (school_id, event_type)
   ↓  match
   ↓
notification_outbox rows, one per recipient
   ↓
drain.ts  →  provider, retries, delivery logging
```

## Files

| File | Purpose |
|---|---|
| `fanout.ts` | Subscribes to the event bus, matches policies, enqueues outbox rows. |
| `drain.ts` | The extracted drainer core. Provider dispatch, retries, delivery logging. |
| `migrations/` | Outbox schema ensure helpers. |

## Working in this folder

- **Never put queue-pumping logic inside a route handler only.** That is the original bug. Keep the core callable from anywhere.
- **Assume the drainer runs irregularly.** Retries and idempotency must tolerate long gaps and bursts.
- **Enqueue, don't send inline.** A punch or a gate scan must not wait on a provider.
- **Adding periodic work? Attach it to an existing runner.** Do not add a cron.

## Known constraints

- **Delivery latency depends entirely on what invokes the drainer.** If nothing does, messages queue silently — which is precisely how the original failure went unnoticed.
- **Outbox rows accumulate** without a retention policy.
- **The event bus does not cross serverless instances.** Fanout must happen in the same invocation as the event, or via a durable row.

## Tests

`npm run test:notifications`

## Dependencies

`src/lib/db` · `src/lib/africastalking` · the typed event bus

## Related

[`../comm/README.md`](../comm/README.md) · [`../control/README.md`](../control/README.md) — the `platform_jobs` runner · [`../passouts/README.md`](../passouts/README.md) — a consumer
