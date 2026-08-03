# ADR-0007: Overall comments are the one deliberate exception to render purity

- **Status:** Accepted
- **Affects:** `src/lib/drce/commentEngine.ts`, `src/lib/snapshots/print-state.ts`, `report_overall_comment_rules`

## Problem

Schools run more than one report-card template — a standard design, a leavers' design, a theology-stream design. They want the Class Teacher / DOS / Headteacher comment logic to **differ per template**, without duplicating the entire rule set and re-editing it every time they switch.

That requires knowing **which template** is being rendered when comments are resolved. But snapshots are generated once, template-unaware, and printed later under whichever template is chosen at print time. The information needed to honour a per-template rule does not exist at generation time.

This runs directly into [ADR-0005](0005-report-snapshot-immutability.md)'s hard invariants: the snapshot payload is immutable, and render is a pure function with no I/O.

## Context

Comment rules live in `report_overall_comment_rules` and are evaluated against a learner's performance (division, aggregate, position, attendance) using a condition tree. Rules can now carry an optional `template_id`: `NULL` means "applies to every template", a set value means "only when rendering that specific template".

The alternative to a render-time resolution is to resolve at generation time using whichever template is nominated for that run — which works, but means switching templates requires regenerating every snapshot, and a school that prints the same term under two designs gets whichever comments the generation run happened to bake in.

This was an explicit product decision, taken with the trade-off stated plainly.

## Decision

**Comments are resolved twice, deliberately.**

1. **At generation time** — using the full rule set, template-unaware, frozen into the snapshot exactly like every other field. This is the fallback baseline.
2. **At render/print time** — in `buildSnapshotRenderState`, using only the rules scoped to the template *actually being rendered* (`template_id IS NULL OR template_id = ?`), with the frozen generation-time value as the fallback when no scoped rule matches.

The render-time resolution also refreshes aggregate/division through the same per-template `aggregateConfig` the assessment section uses, so comment conditions match what the template actually **prints** rather than a generic value.

**This is a documented exception, not an oversight.** It is recorded in `RENDER_LAYERS.md` under "Overall-comment resolution", in the file header of `commentEngine.ts`, and in the migration that introduced `template_id`.

**Scope of the exception is deliberately minimal:** it applies to exactly three comment fields. Marks, grades, positions, aggregates-as-displayed, branding, and every other snapshot field remain fully frozen and byte-reproducible.

**The accepted cost, stated plainly:** reprinting the same report card can produce different overall-comment wording if the school edits its comment bank between prints.

Parent-portal and public verify-token render paths do **not** fetch comment rules — they have no staff session to authenticate the fetch — so they always show the frozen generation-time value. Those paths remain fully deterministic.

## Alternatives considered

**Resolve at generation time using the target template.** The alternative that preserves the invariant completely, and it was explicitly offered. Rejected by the product owner: it means switching templates requires regenerating, which is heavier than schools want for what they perceive as a text change.

**Store per-template comments in the snapshot at generation.** Would freeze comments for *all* templates up front, preserving immutability. Rejected as impractical — it requires evaluating every rule set for every template on every generation, and it goes stale the moment a rule is edited anyway.

**Don't support per-template comments.** The status quo. Rejected because the requirement is real: schools genuinely run multiple designs with different tones.

**Break the invariant everywhere and render live.** Never considered seriously — it discards the entire guarantee of [ADR-0005](0005-report-snapshot-immutability.md) to solve a narrow problem.

## Trade-offs

- **The core immutability guarantee now has an asterisk.** "An issued report reproduces exactly" is true for everything except three comment fields. Anyone relying on byte-reproducibility must know this.
- **Render performs I/O** on the staff path — a database fetch for comment rules — so that path is no longer pure.
- **Two resolutions of the same thing** means an engineer must know which one produced a given comment.
- **Behaviour differs by render path.** Staff prints resolve live; parent-portal and verification prints use the frozen value. The same report can legitimately show different comment text depending on who renders it — the sharpest edge of this decision, and worth remembering during support investigations.

## Consequences

- Schools can run multiple templates with genuinely different comment logic, without duplicating rules.
- `RENDER_LAYERS.md`'s invariants must always be read together with its exception section — the invariants alone no longer tell the whole truth.
- Any future exception request should be measured against this one: narrow scope, explicit documentation in the contract itself, and a stated accepted cost.

## Migration notes

`template_id` was added as a nullable column, so all pre-existing rules default to "applies to every template" and behaviour is unchanged for schools that never scope a rule.

## Related systems

- [`src/lib/drce/RENDER_LAYERS.md`](../../src/lib/drce/RENDER_LAYERS.md) — "Overall-comment resolution" section
- `src/lib/drce/commentEngine.ts`, `src/lib/drce/overallComments.server.ts`
- `src/lib/snapshots/print-state.ts` — where render-time resolution happens
- [ADR-0005](0005-report-snapshot-immutability.md) — the invariant this excepts

## Future considerations

If schools begin relying on comment reproducibility for disputes, revisit: an option to "lock" comments on an issued report would restore determinism per-snapshot without removing the feature.
