# `src/lib/cafe/` — Configurable Assessment Framework Engine

Competency-based assessment. A subject's mark stops being one number and becomes several **components** — Theory 80%, Practical rubric 1–5, Generic skills as descriptors — each with its own scoring model.

Traditional numeric assessment continues to work unchanged; CAFE is opt-in per school.

## Academic modes

A school sits in one of three modes (`school_academic_settings.academic_mode`):

| Mode | Meaning |
|---|---|
| `traditional` | The existing numeric pipeline. Default. |
| `competency` | Component-based throughout. |
| `hybrid` | Both, per subject/class. |

Settings are **auto-created on first read** with `mode='traditional'`, so every school has a row without a backfill migration and no code path has to handle "this school hasn't been configured".

## The model

```
framework            per-school bundle of components
  └─ component       each with its OWN scoring_model
                     numeric (0..max) · scale (configured values)
                     · letter · descriptor (free text)

assignment           framework → (class, term, [subject])
        ↓
student_component_results     one cell per student × component × (class, subject, term)
        ↓
grade_code resolved at WRITE time from grade_mappings and persisted
```

Resolving the grade code on write rather than on read is deliberate: reads happen on every report render and every analytics query, writes happen once.

## Two visibility rules, and they differ

- **Scoring models**: a school sees **global** models (`school_id IS NULL`) **plus** its own. Only its own are editable.
- **Frameworks**: a school sees **only its own**. There is no global catalog — every framework is an explicit school decision.

A shared scoring scale is a technical primitive; a shared assessment framework would be a curriculum opinion, and DRAIS doesn't hold one.

## Reuse: no new rule grammar

`promotion.ts` evaluates promotion eligibility using the **existing `VisibilityRule` type** from [`drce/visibility.ts`](../drce/visibility.ts) — the same AND/OR/nested/negate tree the report engine already uses. The rule lives in `school_academic_settings.promotion_rule_json`, a column provisioned in the Phase 1 migration.

One rule language, one evaluator, one thing for a school admin to learn. The evaluator is pure — no I/O, no `Date.now()` — so promotion decisions are reproducible against a snapshot.

## Files

| File | Purpose |
|---|---|
| `types.ts` | Type contracts, no behaviour. External (UI/API) types are camelCase; SQL row shapes are snake_case and live next to their service. |
| `settings.ts` | Per-school academic mode + defaults. Auto-creates. |
| `scoring.ts` | Scoring models and grade mappings. Validation lives here, not in routes. |
| `frameworks.ts` | Frameworks and their components. |
| `resolver.ts` | Framework ↔ (class, term, subject) assignment. |
| `component-entry.ts` | The **write** path. Per-cell upsert plus bulk helpers for the entry grid. Validation is scoring-model-aware: numeric accepts 0..max, scale accepts only configured values, descriptor accepts any string. |
| `component-results.ts` | The **read** path. Feeds the snapshot generator, the entry UI and analytics. |
| `skills-projects.ts` | Student-level generic skills and project portfolio. Bulk-load helpers feed the snapshot adapter so the DRCE bindings `student.genericSkills` and `student.projects` populate at render time. |
| `promotion.ts` | The promotion evaluator (above). |

## Working in this folder

- **Validate in the service, not the route.** A second entry point would otherwise skip it.
- **Keep the write/read split** (`component-entry.ts` / `component-results.ts`). Reads are hot; writes are where validation and grade resolution belong.
- **Don't introduce a second rule language.** Extend `VisibilityRule` if promotion needs more.
- **Traditional mode must keep working untouched.** CAFE is additive; a change that requires a framework to render a report card is a regression for every existing school.

## Related report-card surface

DRCE gained six section types for this: `competency_table`, `descriptor_grid`, `aoi_breakdown`, `skills_block`, `project_outcomes`, `narrative_block`. See [`../drce/README.md`](../drce/README.md).

## Tests

Formula coverage for CAFE lives in the DRCE suite: `npm run test:drce` (`formula-cafe.test.mjs`).

## Known constraints

- **Persisted `grade_code` goes stale if a grade mapping changes** after entry. Re-entry or a backfill is needed; there is no automatic recompute.
- **No global framework catalog**, so a school starts from scratch (deliberate, but it is real setup work).
- **Mixed-model frameworks complicate aggregation** — a descriptor component has no number to average.

## Dependencies

`src/lib/db` · `src/lib/drce/visibility` (rule language) · `src/lib/snapshots` (adapter integration)

## Related

[`../drce/README.md`](../drce/README.md) · [`../snapshots/README.md`](../snapshots/README.md) · [ADR-0006](../../../docs/adr/0006-contributing-subject-invariant.md)
