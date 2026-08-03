# ADR-0004: Date handling uses two deliberately different primitives for client and server

- **Status:** Accepted
- **Affects:** `src/lib/datetime/local-date.ts`, everywhere a `YYYY-MM-DD` is produced

## Problem

`new Date(...).toISOString().slice(0, 10)` is the most natural-looking way to get a date string in JavaScript, and in Uganda it is **wrong roughly one-eighth of every day**.

`toISOString()` renders in UTC. East Africa Time is UTC+03:00. So between local midnight and 03:00, the UTC date is still *yesterday* — and the expression silently returns the wrong day. Attendance taken at 06:00 local is fine; a record written at 01:30 local lands on the previous date.

This is a footgun rather than a bug in one place: the idiom is everywhere in JavaScript codebases, it reads as obviously correct, and it fails only for a minority of timestamps, so it survives casual testing.

## Context

DRAIS runs the same codebase on both sides of the wire, and the correct answer differs by side:

- **In the browser**, the operator is physically at the school. The browser's local clock *is* school-local time. Local calendar components are already the right answer.
- **On the server**, the process clock is UTC (Vercel, containers). Local components are meaningless; the school's offset must be applied explicitly.

A single shared helper would have to guess which context it was in, and would guess wrong somewhere.

## Decision

Two primitives in `src/lib/datetime/local-date.ts`, named and documented so choosing the wrong one is a visible mistake rather than an invisible one:

- **`toLocalDateStr(date)`** — formats from **local calendar components**, never via UTC. Use on the **client**.
- **`schoolLocalToday(offsetMinutes, now)`** — shifts the instant by the school's offset **first**, then reads the date. Use on the **server**, passing the school's resolved offset.

`DEFAULT_OFFSET_MINUTES = 180` (EAT) is the default, matching the default school configuration — but the offset is a parameter, so the system is correct for any timezone rather than accidentally correct for one.

Note that `schoolLocalToday` *does* use `toISOString()` internally — that is safe, because the instant has already been shifted, so the UTC rendering of the shifted value is the local date by construction.

## Alternatives considered

**A date library (date-fns-tz, Luxon, dayjs/timezone).** Correct, and a reasonable choice for a greenfield project. Rejected here because the problem is narrow (produce a `YYYY-MM-DD`), the fix is a dozen lines, and adding a timezone-database dependency has real weight in a build that already ships to four targets including an Android APK. The library would also not prevent someone reaching for `toISOString()` anyway.

**One universal helper that detects environment.** Rejected: the detection is the fragile part, and a helper that is right in dev and wrong in production is worse than two explicit ones.

**Store everything as UTC and format at the edges.** This *is* what happens for instants. But a school day is a calendar date, not an instant — "attendance for 2026-07-17" is a local-calendar concept, and it must be resolved against the school's offset regardless.

**Set `TZ=Africa/Kampala` on the server.** Makes local components accidentally correct, until a deploy target changes it. Fails silently, exactly like the original bug, and breaks the moment DRAIS serves a school in another timezone.

## Trade-offs

- **Engineers must know which side of the wire they're on** and pick the right function. Naming carries the load.
- **The server variant needs the school's offset threaded to it**, which means a resolution step (and a sensible default) at each call site.
- **The unsafe idiom still compiles.** Nothing prevents `toISOString().slice(0,10)` being reintroduced.

## Consequences

- Date handling is correct for schools outside EAT, not just Kampala.
- The offset is an explicit input, so per-school timezone configuration is a data change rather than a code change.
- Attendance dates, report periods, and fee due-dates agree with what a person at the school would call "today".

## Related systems

- `src/lib/datetime/local-date.ts`
- [ADR-0002](0002-device-wall-time.md) — the same underlying hazard at the device-protocol boundary
- `resolveTimePolicy` — where a school's offset comes from

## Future considerations

An ESLint rule banning `.toISOString().slice(0, 10)` repo-wide would convert this from a convention into an enforced constraint. Recommended if the pattern reappears.
