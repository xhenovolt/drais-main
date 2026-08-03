# `src/lib/reports/` — Report computation shared between engines

Small but load-bearing: subject contribution policy, grading helpers, nursery handling, and configurable subject ordering. Used by both the snapshot pipeline and DRCE.

## Files

| File | Purpose |
|---|---|
| `canonical-report-engine.ts` | Contribution policies (`compulsory` · `elective` · `optional` · `ignored` · `best-of-n` · `ministry`), grade-for-score, and nursery detection (`isNurseryClassName`, `getNurseryOverallGrade`). |
| `subjectOrder.ts` | The pure ordering resolver. |
| `subjectOrder.server.ts` | DB CRUD for `subject_report_order`. |

## Subject ordering

Raw database-id ordering is an accident of insertion order — a subject added later appears last on every report card forever. This replaces it with explicit, resolvable priority at four specificity tiers:

```
class + result_type   ← most specific, wins first
class
result_type
school-wide default   (class_id = null, result_type_id = null)
      ↓ fallback
alphabetical by name
```

Resolution picks the most specific configured rule **per subject**, falling through the tiers. So a school can set one default order and override it only for the classes or exams where it differs.

## The client/server split

`subjectOrder.ts` (pure) and `subjectOrder.server.ts` (DB) are separate so the resolver stays free of `mysql2` / `@/lib/db` imports and remains safe to import from client code — the admin UI's live preview needs it.

**This is the same split as `reportComments.ts` / `reportComments.server.ts` in DRCE, and it exists for the same reason:** importing `query` pulls `tls` into the client bundle. Follow the pattern rather than merging the two halves.

## Nursery is a separate track

Nursery classes don't use the D1–F9 scale. `isNurseryClassName` and `getNurseryOverallGrade` are consulted by the snapshot adapters and print state so nursery reports don't get aggregates and divisions that mean nothing for them — and so [`snapshots/integrity.ts`](../snapshots/README.md) knows to skip an invariant that is undefined for those grade schemes.

## Working in this folder

- **Keep `subjectOrder.ts` pure.** No `@/lib/db`.
- **Which subjects *count*** toward aggregates is `getContributingAssessmentResults` in [`snapshots/assessment.ts`](../snapshots/README.md) — not here, and never reimplemented ([ADR-0006](../../../docs/adr/0006-contributing-subject-invariant.md)). This folder handles ordering and grading; that one handles contribution.
- **Adding a contribution policy?** It affects report totals across every school. Add tests and run `npm run verify:divisions`.

## Known constraints

- **Ordering rules are per subject, per tier.** A subject with no rule at any tier falls to alphabetical, so a partially configured school gets a mixed order.
- **Nursery detection is name-based.** A class named unconventionally may be misclassified.

## Dependencies

`src/lib/db` (server half only) · `src/lib/drce/assessmentUtils` (grade-point map)

## Related

[`../snapshots/README.md`](../snapshots/README.md) · [`../drce/README.md`](../drce/README.md) · [ADR-0006](../../../docs/adr/0006-contributing-subject-invariant.md) · [`docs/guides/DRCE_TOTALS_AND_AVERAGES.md`](../../../docs/guides/DRCE_TOTALS_AND_AVERAGES.md)
