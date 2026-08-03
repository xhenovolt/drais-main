# ADR-0006: Aggregates and divisions derive from one canonical subject set, enforced by an integrity check

- **Status:** Accepted
- **Date:** 2026-07 (from the Albayan division-mismatch postmortem)
- **Affects:** `src/lib/snapshots/integrity.ts`, `src/lib/reports/canonical-report-engine.ts`, `getContributingAssessmentResults`

## Problem

Report cards at Albayan showed an **aggregate and a division that contradicted each other**. The aggregate was computed from one set of subjects; the division was computed from a different set. Both numbers were individually plausible, printed side by side on an official document, and wrong together.

Ugandan aggregate/division grading is unforgiving of this: the division is a direct function of the aggregate against fixed thresholds. If they disagree, at least one is wrong, and a parent reading the report cannot tell which.

## Context

Not every subject counts toward the aggregate. ICT, IRE, and electives are taught and graded and appear on the report, but **must never contribute** to the aggregate or division. Which subjects count depends on subject type and school configuration.

The rule was implemented independently in more than one place. That is the actual defect — not a typo, but *duplicated logic that drifted*. One call site was updated to handle a subject-type case; the other was not. Nothing failed loudly, because each computation succeeded on its own terms.

Compounding it, schools run different grading schemes: D1–F9 grade points (where aggregates and divisions are defined), nursery letter grades, Arabic word grades, and legacy A–E schemes (where they are **not**).

## Decision

**One canonical helper — `getContributingAssessmentResults` — is the single source of truth for which results count.** Aggregates and divisions must both derive from its output. No parallel implementation of the filter is permitted.

**And that is backed by an automated integrity check** (`src/lib/snapshots/integrity.ts`), because a convention alone is exactly what failed. The check verifies that every aggregate/division pair stored in or derivable from a snapshot was computed from the same contributing subject set with the canonical thresholds, comparing generation-time audit metadata against stored per-student values.

Two design points in the checker are deliberate:

- **The checks are pure and read-only. Callers decide whether a violation is fatal.** Generation can hard-fail; a background audit can report. The checker does not impose the policy.
- **Grade schemes outside the D1–F9 grade-point map are skipped.** Nursery letters, Arabic word grades, and legacy A–E schemes are not "passing" — the invariant is genuinely **undefined** for them, and silently pretending to validate would be worse than declining to.

There is also a standalone verifier, `npm run verify:divisions`, which runs against production data.

## Alternatives considered

**Fix the two implementations to agree.** The immediate fix, and insufficient. They agreed before too, until one changed. Without a check, the next divergence is silent and reaches parents again.

**Compute the division from the aggregate at render time only.** Guarantees internal consistency, but moves grading logic into the renderer, violating render purity ([ADR-0005](0005-report-snapshot-immutability.md)), and still doesn't validate that the aggregate itself used the right subjects.

**Encode contributing-subject status as a database column.** Considered. Rejected because it depends on subject type *and* per-school configuration, so the column would need maintaining on every configuration change — replacing drifting logic with drifting data.

**Type-level enforcement.** A branded "contributing results" type would prevent passing the wrong set. Attractive; not sufficient alone, since the filter itself could still be wrong, and it wouldn't validate already-generated snapshots. Worth adding as an additional layer.

## Trade-offs

- **The check runs over snapshot data and costs time** during generation.
- **Skipping non-D1–F9 schemes means those schools get no coverage** from this invariant. Honest, but it is a real gap — a nursery report with a bad aggregate would not be caught here.
- **It guards coherence, not correctness.** If `getContributingAssessmentResults` itself has the wrong rule, the check happily confirms that both numbers used the same wrong set. It prevents *divergence*, not a shared mistake.
- Centralizing on one helper makes it a chokepoint — a change there affects every school.

## Consequences

- Aggregate and division cannot silently disagree on a generated report.
- The rule has exactly one implementation, so a change to it applies everywhere at once.
- Generation-time audit metadata is retained, which is what makes after-the-fact verification possible.
- `verify:divisions` can be run against production as a standing regression check.

## Migration notes

Introduced as a regression guard after the postmortem. Snapshots generated before it may contain incoherent pairs; the verifier identifies them, and remediation is regeneration.

## Related systems

- `src/lib/snapshots/integrity.ts` — the checker
- `src/lib/reports/canonical-report-engine.ts` — thresholds, grade-point map, division computation
- `src/lib/snapshots/assessment.ts` — `getContributingAssessmentResults`
- `npm run verify:divisions` → `scripts/db/verify-snapshot-divisions.mjs`
- [`../guides/DRCE_TOTALS_AND_AVERAGES.md`](../guides/DRCE_TOTALS_AND_AVERAGES.md)

## Future considerations

The undefined-for-other-schemes gap is the main open item: either define an equivalent invariant for the other grading schemes, or make it explicit in the UI that those reports are not covered by this guarantee.
