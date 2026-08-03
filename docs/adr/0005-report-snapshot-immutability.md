# ADR-0005: Report cards render from immutable snapshots, not live data

- **Status:** Accepted
- **Affects:** `src/lib/snapshots/`, `src/lib/drce/`, `report_snapshots`

## Problem

A report card is a document a school hands to a parent. Once issued, it is a record — and it must not change.

Rendering directly from live tables breaks that in ways that are obvious in hindsight and easy to miss up front. Reprint a term-two report in term three and the learner's class has changed, so the class position is recomputed against a different cohort. A teacher corrects one mark and every previously-issued report silently disagrees with the paper copies parents already hold. The school's logo is updated and last year's reports retroactively acquire the new branding.

Worse, the discrepancy surfaces at the worst moment: a parent brings a printed report to a meeting and the screen shows different numbers.

## Context

Report generation is a batch, end-of-term operation with real ceremony around it — marks are entered, checked, approved, then reports are produced for a whole class or school at once. Positions and aggregates are inherently **cohort-relative**: a learner's rank only means anything against the specific set of learners and marks that existed at generation time.

Reports are also rendered repeatedly after issue: reprints for lost copies, PDFs for the parent portal, verification links from a QR code on the printed page. Each of those must reproduce the original document exactly.

## Decision

**Generate into an immutable snapshot; render deterministically from that snapshot.**

The pipeline is: `DB marks → report_snapshots (JSON) → DRCE renderer → print/PDF`.

Everything the document depends on is frozen into the snapshot at generation time — marks, computed aggregates and divisions, positions, and the school branding (`snapshot.meta.branding`), so a later logo or address change cannot alter an issued report.

The render contract is specified in [`src/lib/drce/RENDER_LAYERS.md`](../../src/lib/drce/RENDER_LAYERS.md), which defines five ordered layers (base document → frozen branding → snapshot data → overrides → print) and two hard invariants:

1. **The snapshot payload is immutable.** Once `report_snapshots.snapshot_json` is written, every render of that snapshot reproduces the same bytes under the same overrides.
2. **Render is a pure function of (document, dataCtx, renderCtx).** No I/O, no fetch, no `Date.now()` outside deterministic snapshot metadata.

Per-student overrides (hiding a subject, a spacing patch) are a **separate layer applied over** the snapshot — they never mutate it, and they are snapshot-bound so they cascade-delete with it.

`RENDER_LAYERS.md` is treated as a binding contract, not a description. Any feature that touches rendering must respect the layering.

## Alternatives considered

**Render from live data.** Simplest, and wrong for all the reasons above. A report card is not a dashboard.

**Snapshot only the marks, recompute everything else at render.** Tempting — smaller snapshots. Rejected because positions and aggregates are cohort-relative: recomputing them later against a changed cohort produces different, equally "correct-looking" numbers. Freezing marks alone does not freeze the document.

**Store a rendered PDF as the artifact.** Genuinely immutable, and considered. Rejected because it forecloses too much: no re-rendering in a different template or language, no per-student overrides after the fact, no structured data for the parent portal, and a large binary per learner per term. The snapshot preserves *data* immutability while keeping presentation flexible.

**Version live rows instead (temporal tables / audit history).** Solves mark history but not cohort-relative computation, and makes every read reconstruct a point in time. Far more complex for the same guarantee.

## Trade-offs

- **Storage.** A JSON snapshot per generation run, retained indefinitely.
- **Regeneration is an explicit operation.** If marks are corrected after generation, someone must decide to regenerate — the system will not quietly fix it. This is intended (it is the whole point) but it is a workflow burden and a common source of "why is the report still wrong?" confusion.
- **Two sources of truth exist by design** — live tables and snapshots — and engineers must know which one a given screen reads.
- **The purity invariant constrains the renderer.** Convenient things (fetching a fresh value, formatting with the current date) are forbidden.

## Consequences

- An issued report reproduces byte-identically on reprint.
- QR verification links work indefinitely, because the verifying render reads the same frozen snapshot.
- Templates can be redesigned without altering already-issued reports.
- Integrity checks ([ADR-0006](0006-contributing-subject-invariant.md)) can run against snapshots as a regression guard.

## Migration notes

Documented in `RENDER_LAYERS.md` phases 3.1–3.4 (override layer, overrides panel, built-in DRCE templates, DRCE print renderer). The legacy `emergency_html` string-substitution renderer still coexists with the DRCE renderer as a permanent, deliberate option — it is lighter and faster but cannot honour override semantics. Both are first-class; the choice is per-snapshot.

## Related systems

- [`src/lib/drce/RENDER_LAYERS.md`](../../src/lib/drce/RENDER_LAYERS.md) — the binding contract
- `src/lib/snapshots/generator.ts`, `print-state.ts`
- [ADR-0006](0006-contributing-subject-invariant.md) — the integrity invariant guarding generation
- [ADR-0007](0007-overall-comment-render-time-exception.md) — the one deliberate exception to invariant #2

## Future considerations

Snapshots are retained indefinitely with no archival policy. Old academic years are the obvious candidate, but note that discarding a snapshot destroys the ability to reproduce those reports at all — that is a records-retention decision, not purely a storage one.
