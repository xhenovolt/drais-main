# `src/lib/portal/` — Parent portal

Authentication, linking and data isolation for parents and guardians. A third auth domain, separate from staff sessions and from the Control Center.

Paired with [`src/lib/parent/`](../parent/README.md), which serves the cross-school `/api/parent/*` routes on top of this session layer.

## Responsibilities

Let a parent prove who they are by phone, establish which learners they may see, and make it structurally impossible for them to see anyone else's.

## The isolation gate — the invariant this folder exists for

> **A parent can only ever see learners whose `student_id` is in their own active link set, scoped to the active school. Every data query intersects (requested) ∩ (authorized) — never the requested set alone.**

That is stated at the top of `guard.ts` and it is a **code-review rule**, not a suggestion:

**No portal route may query `students`, `results`, `daily_attendance`, `fee_payments` or anything comparable without going through `authorizedStudentIds()` or `assertCanViewStudent()`, or embedding `studentGateSubquery()` in its SQL.**

A route that filters on a client-supplied `student_id` is a cross-family data leak, and the reason the gate is a shared function rather than a convention is that a convention would eventually be forgotten in one route. See [ADR-0009](../../../docs/adr/0009-parent-portal-isolation-gate.md).

## Evidence is not a grant

The distinction that makes linking safe:

| | |
|---|---|
| **Evidence** | The parent's verified phone appears on a learner's on-file contact record. Comes from DRAIS's fragmented contact tables. |
| **Grant** | A row in `parent_student_links` with `status='active'`. |

`findMatchableLearners()` produces evidence. It never produces access. Evidence creates a link **request**, which the school either auto-activates (if it opted in) or holds `pending` for staff approval. The messy contact tables can therefore be as inconsistent as real school data actually is without that inconsistency becoming an access-control decision.

## Session separation

Parent sessions live in their own cookie (`drais_parent_session`) and their own table. **A parent token can never satisfy `getSessionSchoolId()`, and a staff token can never satisfy `requireParent()`** — there is no shared code path, so there is no privilege confusion to reason about ([ADR-0008](../../../docs/adr/0008-two-auth-systems.md)).

Sessions are deliberately long-lived (~3 months). A new device still costs one OTP; after that the parent stays signed in. Bouncing parents to a login screen repeatedly is how a portal stops being used.

## Files

| File | Purpose |
|---|---|
| `guard.ts` | **The isolation gate.** `authorizedStudentIds()`, `assertCanViewStudent()`, `studentGateSubquery()`. Start here. |
| `session.ts` | Parent session issue/verify. Separate cookie, separate table, no shared path with staff auth. |
| `otp.ts` | 6-digit codes for signup verification, password reset and link claim. Stored **hashed** — the raw code exists only in the SMS. 10-minute TTL, 5 attempts. |
| `linking.ts` | Evidence discovery and link creation, per the distinction above. |
| `context.ts` | Request guard for portal read routes: resolves the session, requires an active school, enforces the gate for single-learner routes. Returns a typed result or a ready `NextResponse`, so routes stay one-liners. |
| `visibility.ts` | Per-school toggles for what the portal exposes, backed by `school_settings`. Fees are visible by default (`parent_finance_visibility`), and a school can switch that off. |

## Working in this folder

- **Every new data route goes through `context.ts` or the gate helpers.** If a route needs a query shape the guard doesn't cover, extend the guard — don't bypass it.
- **Never trust a `student_id` from the client.** In `/api/parent/*` the client only ever holds an opaque `access_uuid`; see [`../parent/README.md`](../parent/README.md).
- **New portal surface? Add a visibility toggle** unless it's unconditionally safe. Schools differ on what parents should see, especially about money.
- **OTPs stay hashed.** No logging of raw codes, ever, including in debug branches.

## Known constraints

- **Long sessions trade security for adoption.** A stolen device retains access until the session is revoked. This was decided deliberately.
- **Auto-activation is a per-school opt-in** that converts evidence directly into a grant. A school with dirty contact data and auto-activation on can link the wrong parent — staff approval is the safer default.
- **OTP delivery depends on SMS.** No email fallback; a parent with an unreachable phone cannot self-serve.
- **`school_settings` visibility lookups are per-request** and uncached.

## Dependencies

`src/lib/db` · `src/lib/africastalking` (SMS, phone normalization) · `bcryptjs` · `node:crypto`

## Related

[ADR-0009](../../../docs/adr/0009-parent-portal-isolation-gate.md) — the isolation gate · [ADR-0008](../../../docs/adr/0008-two-auth-systems.md) · [`../parent/README.md`](../parent/README.md)
