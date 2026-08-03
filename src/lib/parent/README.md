# `src/lib/parent/` — Parent API access resolution

The guard layer for `/api/parent/*`. Sits on top of [`src/lib/portal/`](../portal/README.md), which owns parent sessions, OTP and linking.

## What's different from `portal/`

`portal/` routes are **school-scoped** — the parent picks an active school and everything resolves within it. `parent/` routes are **cross-school**: one parent, one session, learners at any number of schools, no active-school pin. A parent with children at two DRAIS schools sees both in one list.

## The opaque id rule

> **The client only ever receives `access_uuid` (`learnerAccessId`). The internal `student_id` never leaves the server.**

A `learnerAccessId` is resolved back to `(student_id, school_id)` **only** when it belongs to the calling parent and the link is still `active`. That resolution is the isolation gate for every detail route here.

Two properties fall out of this: a client cannot construct or enumerate ids for learners it wasn't given, and revoking a link immediately invalidates every id the parent already holds — the check is at resolution time, not at issue time.

## Files

| File | Purpose |
|---|---|
| `parent-access-resolver.ts` | `resolveAccessId()` and the authorized-learner list. Resolves against the **grant** table `parent_student_links` (`status='active'`) across all schools. |
| `context.ts` | `requireParent()` — session guard for list routes; detail routes additionally resolve a `learnerAccessId` through the resolver gate. |

## Working in this folder

- **Never accept a `student_id` from a request.** Accept a `learnerAccessId` and resolve it. A route that takes a raw student id has no gate.
- **Resolve per request.** Don't cache the resolution across requests; revocation must take effect immediately.
- **Eligibility before login is not this folder's job** — that is `findMatchableLearners()` in [`../portal/linking.ts`](../portal/linking.ts), and it produces evidence, not access.

## Known constraints

- **Cross-school listing means no single `school_id` scope** on these routes, so the per-learner resolution *is* the entire tenant boundary. There is no second line of defence here.
- **`access_uuid` is stable per link.** It is opaque but not rotating, so it is a bearer-ish identifier if leaked alongside a valid session — the active-link check at resolution time is what limits the damage.

## Dependencies

`src/lib/db` · `src/lib/portal/session`

## Related

[`../portal/README.md`](../portal/README.md) · [ADR-0009](../../../docs/adr/0009-parent-portal-isolation-gate.md)
