# `src/lib/datetime/` — Timezone-safe dates

One file, thirty lines, and it exists to stop a specific bug that has bitten this codebase.

## The footgun

```ts
new Date(...).toISOString().slice(0, 10)   // ❌ never do this
```

`toISOString()` renders in **UTC**. Uganda is UTC+3 (EAT), so for any instant before 03:00 local time, that
expression returns **the previous day**.

Concretely: a learner scans in at 07:30 EAT. Stored correctly as an instant. Someone derives the attendance
date with `toISOString().slice(0,10)` and files it against 04:30 UTC — same day, fine. But a boarding-school
gate scan at 02:00 EAT lands on *yesterday's* register, and a school looking at Monday's attendance sees a
learner who arrived on Sunday.

The bug is invisible in a UTC-based test environment and appears only in production, only for some hours of
the day. That is why the helper exists rather than a code-review convention.

## The rule

> **Store instants. Derive local dates explicitly.**

DRAIS stores the actual moment something happened (`punch_at`, `created_at`) and converts to a local calendar
date only at the point where a human needs one — a register, a summary, a report card. That conversion goes
through this module, never through `toISOString()`.

See [ADR-0004](../../../docs/adr/0004-timezone-safe-dates.md).

## Related: the driver setting

`src/lib/db` runs the MySQL driver with `timezone: 'Z'`. That is the other half of the same rule — a driver
that helpfully converted timezones on the way in or out would corrupt the stored instants themselves. **Do
not "fix" either one in isolation.**

## Working with this

- **Any `YYYY-MM-DD` for display or grouping** goes through the helpers here.
- **Never `toISOString().slice(0,10)`.** If you see it in existing code, it is either a bug or a UTC-intentional
  value; check which before copying the pattern.
- **Test near midnight.** A date bug that only appears between 00:00 and 03:00 local will not show up in a
  test suite that runs at 14:00.

## Related

[ADR-0004](../../../docs/adr/0004-timezone-safe-dates.md) · [ADR-0002](../../../docs/adr/0002-device-wall-time.md) — device clocks are separately untrustworthy · [`../db/README.md`](../db/README.md) · [`../attendance/README.md`](../attendance/README.md)
