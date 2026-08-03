# ADR-0002: Device wall-clock strings are the punch's identity until a single UTC conversion

- **Status:** Accepted
- **Date:** 2026-07 (from the TCP-pull forensic audit)
- **Affects:** `src/lib/attendance/acquisition/`, `attendance_raw_events`

## Problem

Attendance punches were silently landing up to **three hours off**, and the direction of the error depended on which timezone the *host server* happened to be running in. The same physical punch, ingested through two different code paths, produced two different stored times.

This is the worst class of data bug: nothing errors, nothing logs, and the data looks plausible. A learner marked late at 08:19 might have arrived at 05:19 or 11:19, and no one downstream could tell.

## Context

A biometric device reports a punch as a **timezone-less local wall clock string** — `"2026-07-17 08:19:33"`. That string carries no offset. It is not UTC, and it is not necessarily the server's local time; it is whatever the clock on the wall of that school reads.

DRAIS ingested these through several paths that each invented their own convention:

- `node-zklib` (TCP pull) built a JS `Date` via `new Date(y, m, d, h, mm, ss)` — i.e. interpreted the wall components in the **host** timezone
- the ADMS push normalizer treated the wall string as **UTC**
- `decidePunchTime` operated on values that were already **real UTC** instants

Every hop that wrapped the value in a `Date` and re-serialized it with a differently-configured formatter shifted it again. Calling `toISOString()` on a host-local `Date` was the single most damaging operation — it converts using the host offset, which is exactly the information the wall string does not have.

The devices could not be changed. The protocol genuinely does not transmit a timezone.

## Decision

**The wall-clock string is the punch's identity.** It is captured verbatim at the protocol boundary and stays a string — through staging, inspection, and validation — until persistence.

**Conversion to a real UTC instant happens exactly once**, in `wallToUtc`, with the timezone offset passed as an **explicit argument**.

**No function in `src/lib/attendance/acquisition/` may consult the host timezone.** Everything in that module is timezone-invariant and unit-tested as such.

The type `DeviceWallTime` (`src/lib/attendance/acquisition/wall-time.ts`) is a branded string enforcing the `YYYY-MM-DD HH:mm:ss` shape, so a raw `Date` cannot be passed where a wall time is expected.

There is one subtle rule worth stating explicitly, because it looks like a bug and is not: when recovering the wall string from a `node-zklib` `recordTime`, you must read it back with **local** getters (`getFullYear()`, `getMonth()`, …). Construction and read then use the same zone, so the original components come back exactly, whatever timezone the host runs in. **Never call `toISOString()` on those Dates** — that is the original root cause.

## Alternatives considered

**Normalize to UTC at ingestion.** The obvious approach, and the one that caused the bug. It requires knowing the offset at the boundary, which is precisely where it is least reliably known — the ingestion path may not yet have resolved which school (and therefore which timezone) the device belongs to. Converting early means converting with a guess.

**Store the offset alongside a UTC instant.** Better, but still converts early and leaves two fields that can disagree. It also doesn't help the staging/inspection phase, where an operator needs to see what the device actually said, not a derived value.

**Configure every server to a fixed timezone.** Fragile in a way that fails silently: correct until someone deploys to a differently-configured host, a container base image changes, or a laptop runs the desktop build. The bug returns with no code change.

**Make the devices report UTC.** Not available — the protocol doesn't carry it, and the deployed hardware is not under our control.

## Trade-offs

- **String-typed times are less ergonomic than `Date`.** You cannot do arithmetic directly, and every consumer needs to be aware of the conversion boundary.
- **The rule is enforced by convention and review**, not by the compiler. A branded type helps but does not prevent someone calling `new Date(wallString)` inside the module.
- **Two representations exist in the codebase** (wall string during acquisition, UTC instant after persistence), and engineers must know which layer they are in.

These costs are accepted because the alternative is silent, direction-varying data corruption in the system's most safety-critical dataset.

## Consequences

- Acquisition code is timezone-invariant and testable without manipulating `TZ`.
- The offset becomes an explicit input at exactly one call site, so it can be sourced from the school's resolved policy rather than the environment.
- What the device actually reported is preserved and inspectable, which is what makes the drift-detection in [ADR-0003](0003-device-time-policies.md) possible at all — you cannot detect a lying clock if you have already normalized away what it said.

## Migration notes

Introduced as Phase 1 of the TCP-pull redesign. Historical rows ingested under the old conventions may carry shifted values; they are not retroactively corrected by this change. The correction tooling in the time-intelligence module is the mechanism for fixing them, and it is deliberately operator-driven rather than automatic.

## Related systems

- `src/lib/attendance/acquisition/wall-time.ts` — the canonical implementation and its rules
- [`../audits/TCP_PULL_FORENSIC_AND_REDESIGN.md`](../audits/TCP_PULL_FORENSIC_AND_REDESIGN.md) — the forensic audit (RC-1 is this bug)
- [ADR-0003](0003-device-time-policies.md) — what happens when the device's own clock is wrong
- [ADR-0004](0004-timezone-safe-dates.md) — the related `toISOString()` footgun on the application side

## Future considerations

The branded type could be enforced more strictly with a lint rule banning `toISOString()` within the acquisition module. Worth doing if this class of bug recurs.
