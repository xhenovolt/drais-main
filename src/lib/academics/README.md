# `src/lib/academics/` — Allocation and result-entry rules

> **Note the plural.** There is also [`src/lib/academic/`](../academic/README.md) (singular), which resolves
> *what term it is*. This folder decides *who may teach and mark what*. The names are historical; check which
> one you have open.

## Responsibilities

Pure, database-free decision rules for the many-to-many teacher-allocation model and for result-entry gating —
so both can be unit-tested without a database, and so every caller applies the identical rule.

## Why the logic is pure

Allocation and gating decisions are made in several places: the allocations UI, the marks-entry screen, the
result API, and report-card initials. When those diverge, two screens disagree about whether a teacher may
enter marks — and the disagreement surfaces as a permission complaint during mark-entry week.

Keeping the rules as pure functions means the API routes stay thin and the rules are covered by
`npm run test:allocations` without a fixture database.

## Allocation model

Teachers relate to a (class, subject) many-to-many, each with a **role**. The module owns:

| Function | Decides |
|---|---|
| `normalizeRole` | Coerces arbitrary input to a known `AllocationRole`. |
| `orderTeachers` | The canonical display order — so every screen and the report card list teachers identically. |
| `initialsFor` / `composeReportInitials` | The initials printed on a report card, joined consistently. |
| `primariesToDemote` | Which existing primaries must step down when a new primary is set. |
| Warning builders | Surfaced problems: unallocated subjects, duplicate primaries, and similar. |

`composeReportInitials` matters more than it looks: those initials are printed on a document parents keep. If
two screens compose them differently, reprints disagree.

## Result-entry gating

Two concerns, both pure:

**1. Who may enter or comment on a subject's results.**

```
privileged  (super-admin · HOD · allocations-manage grant)  → any subject
teacher                                                     → only subjects they
                                                              are ACTIVELY allocated
                                                              to teach for that class
```

**2. Manual vs automatic comment precedence.**

> A teacher's typed comment **always wins** over the rule-generated one. Blank falls back to the auto text.

That ordering is deliberate: comment rules exist to save typing thirty times, not to overrule the one teacher
who knows the learner. See [`../drce/README.md`](../drce/README.md) for the rules engine itself.

## Working in this folder

- **Keep it pure.** No `@/lib/db`, no `next/server`. That is what makes it testable and reusable.
- **Add the test with the rule.** `npm run test:allocations`.
- **Do not inline a variant** of a rule at a call site. A near-copy that drifts is the failure this folder
  prevents.
- **Gating here is not authorization.** These functions decide *domain* eligibility (are you allocated to this
  subject). The permission check still happens in the route via `authorize()` — both apply.

## Known constraints

- **`academic` vs `academics`** is a genuine trip hazard. Renaming would touch many imports; it has not been
  done, so the cross-references at the top of both READMEs are the mitigation.
- **Warnings are advisory.** Nothing here blocks a save; the surfaces decide what to do with a warning.

## Related

[`../academic/README.md`](../academic/README.md) · [`../drce/README.md`](../drce/README.md) — comment rules and report initials · [`../rbac/README.md`](../rbac/README.md) — permission checks, which are separate · [`docs/guides/SUBJECT_ALLOCATION_ENFORCEMENT.md`](../../../docs/guides/SUBJECT_ALLOCATION_ENFORCEMENT.md)
