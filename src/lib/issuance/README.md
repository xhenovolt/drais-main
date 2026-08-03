# `src/lib/issuance/` — Universal issuance engine

One pipeline for every *"render a DRCE template for a cohort of recipients and archive an audit trail"* use
case: certificates, ID cards, transcripts, awards, passes.

## Why it is universal rather than per-document

Each of those looked like a separate feature. They share the same shape:

```
pick a cohort  →  decide eligibility  →  render a template per recipient
                                      →  archive what was issued, to whom, when
```

Building them separately would have produced four near-copies of eligibility evaluation, four render paths and
four audit trails — three of which would have drifted. The generalisation is the point.

## Two reuse decisions worth knowing

**1. Eligibility uses the DRCE rule language.**

> *"Reuses `src/lib/drce/visibility.ts` as the rule language for eligibility — there is exactly one rule engine
> in DRAIS, not two."*

The same AND/OR/nested/negate tree that decides whether a report-card section renders decides who receives a
certificate. One grammar, one evaluator, one thing for an admin to learn. **Do not introduce a second rule
language here** — extend `VisibilityRule` if it is genuinely insufficient.

The same reuse appears in CAFE's promotion evaluator, for the same reason.

**2. Rendering uses DRCE.**

Issued documents are DRCE templates, so they inherit school branding, bilingual output with RTL, the visual
editor, and the publish workflow — without this module implementing any of it.

## The audit trail is the feature

An issuance record is not bookkeeping. When a former learner presents a certificate years later, the school
must be able to confirm it was issued, to that person, on that date. **Archive first; render second.** A
document that exists in the world with no record of its issuance cannot be verified.

## Working in this folder

- **New document type → a DRCE template plus an eligibility rule.** Not a new pipeline.
- **Never bypass the archive.** Rendering without recording produces unverifiable documents.
- **Cohort selection is tenant-scoped** like everything else — `school_id` from the session.
- **Re-issuing is a new record**, not an edit of the old one. The history of what was issued must stay intact,
  including superseded documents.

## Known constraints

- **Large cohorts are bounded by the render path.** Issuing to a whole school is a batch operation, subject to
  the same serverless timeout limits as report generation — step it or job it.
- **Eligibility is evaluated at issue time**, against the data as it stands then. It is not retroactive.

## Related

[`../drce/README.md`](../drce/README.md) — the template engine and rule language · [`../drce/RENDER_LAYERS.md`](../drce/RENDER_LAYERS.md) · [`../snapshots/README.md`](../snapshots/README.md) — the same freeze-then-render reasoning · [`../cafe/README.md`](../cafe/README.md) — the other reuser of `VisibilityRule`
