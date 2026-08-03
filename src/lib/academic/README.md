# `src/lib/academic/` — Term resolution

> **Note the singular.** There is also [`src/lib/academics/`](../academics/README.md) (plural), which holds
> teacher-allocation and result-entry rules. The names are historical and confusing; check which one you have
> open. `academic/` = *what term is it*. `academics/` = *who may teach and mark what*.

## Responsibilities

Answer one question authoritatively — **what term is it?** — and generate the term-related notifications that
make the answer visible to admins.

## Why this exists

Term selection was scattered and broken. The problem was structural: a term carries **both** a legacy
`status` column (`'draft' | 'active' | …`) **and** an `is_active` flag, and the old `getCurrentTerm`:

- matched on `status = 'active'`, then fell back to "latest term" — so a past term left with `is_active = 1`
  while its status was still `'draft'` was returned **forever**, and enrolment silently used the wrong term;
- `INNER JOIN`ed `academic_years`, which **hid** any term whose academic-year row was missing.

Because almost everything in DRAIS attaches to a term, a wrong answer here files marks, fees and attendance
against the wrong period — and nobody notices until a report card is printed.

## The resolution rule

```
date-driven FIRST      today within [start_date, end_date]  → current
manual override        is_active, explicit and SURFACED
no match               current = null   (never a stale guess)
```

**When no term's dates cover today, `current` is `null`.** The resolver then tells the caller the nearest
upcoming term, the last completed term, and a set of warnings — rather than silently keeping a stale term
"current", which is what the old behaviour did.

## Working in this folder

- **Never re-derive the current term.** Call the resolver. A second implementation is exactly what produced
  the original bug.
- **Handle `current === null`.** It is a real, expected state — between terms, or when a school has not set up
  the new year yet. A caller that assumes a term always exists will throw during exactly the week when the
  school is busiest.
- **Do not `INNER JOIN` academic_years** when listing terms. That is what hid terms with a missing parent row.
- **Treat `stored_status` as legacy.** It is returned for visibility, not for decisions.

## Notifications

`term-notifications.ts` turns the resolver's warnings into in-app notifications — "no current term", "term
ends in N days", "stale active term" — so an admin sees them in the navbar bell rather than discovering the
problem through wrong data. Deduped per (school, action) per day.

This is the same principle as attendance clock-health badges: **a health signal that lives only behind a route
nobody visits is not monitoring.**

## Related

[`../academics/README.md`](../academics/README.md) — the plural folder · [`../snapshots/README.md`](../snapshots/README.md) — snapshots are keyed by term · [`docs/database/TABLE_DICTIONARY.md`](../../../docs/database/TABLE_DICTIONARY.md)
