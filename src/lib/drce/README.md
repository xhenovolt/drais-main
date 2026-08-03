# `src/lib/drce/` — DRAIS Report Composition Engine

The engine schools use to **design** report cards, certificates and ID cards, and the engine DRAIS uses to **render** them. A DRCE document is data (`schema_json` in `dvcf_documents`), not code — schools build layouts in a visual editor and DRAIS prints them without a deploy.

> **Read [`RENDER_LAYERS.md`](RENDER_LAYERS.md) before changing anything that renders.** It is the binding contract: five layers, five hard invariants, and one documented exception. This README is the orientation map; that file is the law.

## Responsibilities

Own the **document model** (`DRCEDocument`), the **pure functions** that transform it (mutations, inheritance, overrides, visibility, expressions, formulas), and the **print renderer**. Everything here is deliberately pure — no React, no DOM, no I/O in the render path — so the same document plus the same data always produces the same bytes.

Data comes from `src/lib/snapshots/`. React components live in `src/components/drce/`. This folder is the layer between them.

## The one thing to understand first

**A report is a pure function of (document, data context, render context).**

```
DRCEDocument          ← layout, authored by the school, stored as JSON
DRCEDataContext       ← one student's frozen snapshot rows
DRCERenderContext     ← school branding frozen at generation time, language
        │
        ▼
   same output, every time
```

Every design constraint in this folder follows from that sentence. It is why `computed/builtins.ts` bans `Date.now()`, why `overrides.ts` transforms the document tree instead of the data, and why the expression grammar is closed rather than an eval sandbox.

## Where things live

**Document model**

| File | Purpose |
|---|---|
| `schema.ts` | Every type. 24 section types, shapes, themes, watermarks, columns, bindings. Schema version `drce/v1`. The largest file here and the one to read first. |
| `ids.ts` | `newId()` — UUID-backed, collision-free. Replaced a `Date.now()` scheme that collided on rapid clicks. |
| `defaults.ts` | Built-in documents as typed constants (`DRAIS_DEFAULT_DOCUMENT`, `ARABIC_CLONE_DOCUMENT`) plus the UCE grade scale. Fallback when the DB is unavailable. |
| `starters.ts` | Seed documents for the "+ New Document" gallery. Pure values — IDs are minted at pick time so two simultaneous opens never collide. |
| `kinds.ts` | Document-kind catalog (report card, certificate, ID card…). **Metadata only — the renderer never branches on kind.** Free-text in storage so schools can add their own without a migration. |
| `pages.ts` | Multi-page helpers. Sections may live at `document.sections` (legacy) or inside any page; the traversal helpers hide the difference from callers. |

**Composition**

| File | Purpose |
|---|---|
| `mutations.ts` | `applyMutation()` — the single funnel every editor edit passes through, which is what makes undo/redo sound. Recurses into containers at any depth. |
| `inheritance.ts` | Template inheritance (child section ids replace parent ones; new ids append) + `block_ref` inlining. Runs at **load** time so the renderer still sees one flat document. |
| `blocks.ts` | Shared block library (`drce_blocks`). School-owned blocks are school-scoped; `NULL` school = global. The only file here that touches the DB. |
| `overrides.ts` | Per-student, snapshot-bound render overrides. Transforms the **document**, never the snapshot or academic data. See RENDER_LAYERS layer 4. |
| `versions.ts` | Document version history. Restoring is itself a save, so restores are undoable. School-scoped by JOIN on `dvcf_documents` — the version table has no `school_id` by design. |
| `workflow.ts` / `workflow-server.ts` | Template lifecycle: draft → pending_approval → approved → published → archived, with reject as the single backwards arrow. |
| `draftStore.ts` | localStorage crash recovery between server saves. Not a substitute for saving; no-ops when localStorage is unavailable. |

**Binding & expressions**

| File | Purpose |
|---|---|
| `bindingResolver.ts` | Dot-path resolution: `"result.grade"` → value. The primitive everything else builds on. |
| `tokenResolver.ts` | Legacy `{path}` placeholder substitution. |
| `computed/resolveExpression.ts` | The real expression language, a strict **superset** of the legacy syntax: computed fields, formatter pipes, `if/then/else`. Deliberately small and closed — no arithmetic, no sub-expressions — so it stays pure and sandbox-free. |
| `computed/registry.ts` · `builtins.ts` | Computed fields as pure functions of the data context. Register one here and the variable picker, print renderer and resolver all pick it up. |
| `computed/formatters.ts` | Pipes: `date`, `number`, `upper`, `coalesce`, `truncate`. Unknown formatters pass the value through. |
| `computed/aggregations.ts` | `sum/avg/count/min/max/passed/failed` over context collections. Only registered names are callable. |
| `table/formula.ts` | Spreadsheet formulas for `table` sections — a real recursive-descent parser, not regex dispatch. Errors surface as `#ERROR!` / `#REF!` / `#CYCLE!` / `#DIV/0!` rather than failing silently. |

**Evaluation & academics**

| File | Purpose |
|---|---|
| `visibility.ts` | Conditional visibility rule tree, evaluated per student at render time. One document, different output per learner — no template duplication. |
| `commentEngine.ts` | Rule-driven Class Teacher / DOS / Headteacher comments. Reuses `visibility.ts`'s evaluator against a flatter context. **This is the documented exception to snapshot immutability — read the RENDER_LAYERS section on it before touching.** |
| `overallComments.server.ts` | DB CRUD for comment rules. Split from `commentEngine.ts` so the pure resolver stays client-importable. |
| `reportComments.ts` / `.server.ts` | Per-result-row comments. Same client/server split, same reason. |
| `totalsCalculator.ts` | Totals, averages, and the consolidated academic-standing summary. |
| `assessmentUtils.ts` | Aggregates and divisions. Defers to `getContributingAssessmentResults` — **do not reimplement which subjects count** (see [ADR-0006](../../../docs/adr/0006-contributing-subject-invariant.md)). |
| `subjectClassification.ts` | Elective vs core vs religious classification, shared by subject filters and grouped table layouts. |

**Presentation**

| File | Purpose |
|---|---|
| `styleResolver.ts` | Style cascade: theme defaults → section style → node style, most specific wins. |
| `section-registry.ts` | Section-type plugin descriptors. **Imports no React** (`Render` is typed `unknown` and cast at the call site) so `/lib` stays safe to import from route handlers. |
| `print-renderer.ts` | Server-side HTML via `renderToStaticMarkup`. Lives in `/lib`, not `/components`, to stay out of the client bundle. |
| `registry.ts` | Template catalog. Two orthogonal axes: **category** (what the user picks) and **renderer** (`drce` vs `emergency_html`). Both renderers are permanent, not transitional. |
| `builtin-resolver.ts` | Resolves built-in string template ids to documents, so built-ins and school-authored documents load through one code path. |
| `arabic.ts` · `reportTranslations.ts` | RTL handling and the EN/AR label dictionary. **Every report string comes from here** — see [i18n rules](../../../docs/localization/PHASE0_AUDIT.md). |
| `idCardConverter.ts` | Converts legacy `id_card_templates` rows into DRCE documents. Non-destructive: the source row is kept, and the two coexist. |

## Working in this folder

- **Purity is the contract, not a preference.** No I/O, no `Date.now()`, no fetch in anything the renderer calls. Time-dependent values must arrive through `snapshot.meta`. Breaking this makes reprints non-reproducible, which is a correctness bug in a document parents keep.
- **Route mutations through `applyMutation`.** Editing a document tree directly works right up until someone presses undo.
- **Client-importable modules stay free of `@/lib/db`.** Importing `query` pulls `tls` into the client bundle. That is why `commentEngine.ts` and `reportComments.ts` each have a `.server.ts` twin — follow the pattern rather than merging them back.
- **New section type?** Add to the `DRCESectionType` union in `schema.ts`, register a descriptor in `section-registry.ts`, and add the component under `src/components/drce/sections/`. Don't add a branch to the renderer.
- **New computed value?** One entry in `computed/builtins.ts`. Don't extend the expression grammar — its smallness is what keeps it safe.
- **Changing anything that affects marks, aggregates or divisions?** Run `npm run verify:divisions` and the tests below. See [`docs/audits/DRCE_REPORT_ENGINE_HARDENING.md`](../../../docs/audits/DRCE_REPORT_ENGINE_HARDENING.md) for what a wrong subject set costs.

## Tests

`npm run test:drce` — see [`__tests__/README.md`](__tests__/README.md). Covers formula evaluation (including CAFE), visibility rules, mutations, comment resolution, ranking, totals/averages, subject classification, and an i18n hash invariant.

## Known constraints

- **`emergency_html` templates cannot honour overrides.** Their string-substitution engine has no document tree to transform. This is a permanent property of that renderer, not a gap to close.
- **Overall comments can change between reprints.** The single deliberate exception to immutability, fully argued in RENDER_LAYERS. Parent-portal and public verify-token renders always show the frozen generation-time value, because they have no staff session with which to fetch rules.
- **`schema.ts` is ~1,500 lines and grows with every section type.** That is inherent to a closed discriminated union; splitting it has been considered and rejected because the union must stay exhaustively checkable.
- **The static HTML files under `backup/` are load-bearing.** They serve the SnapshotPreviewer emergency iframe and the legacy secular-emergency-report routes. Deleting them breaks both.

## Dependencies

`src/lib/snapshots` (data + assessment) · `src/lib/db` (blocks, versions, comment rules only) · `src/lib/theology-subject-classifier` · `react-dom/server` (print only)

## Related

[`RENDER_LAYERS.md`](RENDER_LAYERS.md) — the contract · [ADR-0005](../../../docs/adr/0005-report-snapshot-immutability.md) snapshot immutability · [ADR-0006](../../../docs/adr/0006-contributing-subject-invariant.md) contributing subjects · [ADR-0007](../../../docs/adr/0007-overall-comment-render-time-exception.md) the comment exception · [`docs/architecture/DRCE_ARCHITECTURE.md`](../../../docs/architecture/DRCE_ARCHITECTURE.md) · [`docs/guides/DRCE_TOTALS_AND_AVERAGES.md`](../../../docs/guides/DRCE_TOTALS_AND_AVERAGES.md)
