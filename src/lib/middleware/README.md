# `src/lib/middleware/` — Post-operation hooks

> **This is not Next.js middleware.** The real edge middleware is `middleware.ts` at the repository root.
> These are plain helper functions you call *after* an operation, and the folder name is misleading.

## What is here

| File | Called after | Does |
|---|---|---|
| `feeStatusMiddleware.ts` | Any operation that might change a fee item's state | Recomputes fee item statuses via `FeeService`. |
| `notificationMiddleware.ts` | An operation worth telling someone about | Builds a notification context and dispatches. |

## The pattern, and its weakness

Both follow the same shape: *do the thing, then call the hook.* That works, and it is honest about being a
convention rather than a mechanism.

**The weakness is that it depends on the caller remembering.** A new route that changes fee items but does not
call `updateFeeItemStatus` leaves statuses stale, and nothing fails — the data is simply wrong until someone
notices a learner marked unpaid who has paid.

So when you add a write path that touches fees or should notify, **check whether one of these applies**. Grep
for existing callers of the same operation before assuming yours is the first.

## Fee status: derived, but cached

This sits slightly against the [finance](../finance/README.md) rule that balances are always derived. Balances
*are* derived; a fee item's **status** is a stored, recomputed field. That is why it needs an explicit hook —
and why a missed call shows up as a wrong status rather than a wrong balance.

If you are adding something similar, prefer deriving. A stored field with a hook to keep it fresh is a
maintenance cost you carry forever.

## Notifications

`notificationMiddleware.ts` predates the [comm engine](../comm/README.md). **For anything new, emit a comm
event instead** — you get per-school rules, templates, audience resolution, auto/reviewed mode, quiet hours
and delivery logging, none of which this has.

Treat this file as legacy and do not extend it.

## Working in this folder

- **Do not add new hooks here.** Fee-adjacent logic belongs in `src/lib/finance`; notifications belong in
  `src/lib/comm`.
- **If you touch fee items, call the status hook** — or better, check whether the value could be derived.
- **Never confuse this with `middleware.ts`.** Nothing in this folder runs on the Edge runtime or gates a
  request.

## Related

[`middleware.ts`](../../../middleware.ts) — the actual edge middleware · [`../finance/README.md`](../finance/README.md) · [`../comm/README.md`](../comm/README.md) — the modern replacement for the notification hook · [`../services/README.md`](../services/README.md) — `FeeService`, the other legacy finance surface
