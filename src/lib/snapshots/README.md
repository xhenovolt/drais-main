# `src/lib/snapshots/` — Report snapshots

The immutable, deterministic **data** half of the report-card pipeline. `src/lib/drce/` owns layout; this folder owns what goes into it.

## Responsibilities

Read the live academic database **once**, at generation time, and freeze the result as a self-contained JSON document. Every render path afterwards — preview, print, PDF, parent portal, public verify — reads only that frozen document.

## Why snapshots exist at all

A report card is a document a school hands to a parent and a student keeps for years. If reprinting it a term later produced different marks — because a teacher fixed a typo, a student changed class, or a subject was reallocated — the printed copy and the reprint would disagree, and there would be no way to say which was right.

So generation and rendering are separated by a hard boundary:

```
  live DB  ──generate──▶  report_snapshots.snapshot_json  ──render──▶  report
  (mutable)               (immutable, hashed)                          (reproducible)
```

The invariant is enforced by construction, not by convention: **nothing in the render path can reach the live results tables**, because the renderer is only ever handed a snapshot. See [ADR-0005](../../../docs/adr/0005-report-snapshot-immutability.md).

## Determinism is the whole design

`meta.dataHash` is a SHA-256 over the key-sorted `classes` array. Two generations from unchanged data must produce identical bytes, so throughout this folder:

- **No `Date.now()` or `Math.random()`** anywhere whose output reaches `snapshot.classes`.
- **All iteration is over pre-sorted arrays** — never `Object.keys()` on unsorted data.
- **Ranking ties break on a fixed chain**: total → average → lastName → firstName → studentDbId.
- **`canonicalStringify`** produces identical bytes for identical inputs.

If you add a field to a snapshot, ask where its ordering comes from before you ask anything else.

## Pipeline

```
generator.ts
  1. acquire single-flight slot        uk_inflight UNIQUE on (school, term, year, type)
  2. fetch school + term + result-type metadata
  3. pull ALL results in one pre-sorted query          queries.ts
  4. group class → student, normalize Arabic→Western   normalizers.ts
  5. rank per class                                    ranker.ts
  6. apply grading scale + comments                    grader.ts, drce/commentEngine
  7. hash canonical bytes, persist                     normalizers.ts, storage.ts
```

## Where things live

**Generation**

| File | Purpose |
|---|---|
| `types.ts` | The canonical schema. A superset of the three legacy emergency JSON variants. Scores are always Western `number \| null`; language-specific display strings are precomputed alongside. |
| `generator.ts` | The orchestrator. Read its header comment before editing — the determinism invariants are stated there. |
| `queries.ts` | The only SQL that generation runs. School-scoped, parameterized, pre-sorted. **Render paths never call these.** |
| `normalizers.ts` | Arabic↔Western numerals, `canonicalStringify`, hashing. Pure. |
| `ranker.ts` | Per-class ranking. Students with no marks keep 0 and sort last but stay present — the snapshot must reflect who has no marks rather than hide them. |
| `grader.ts` | Grading scale (UCE by default, shared from `drce/defaults.ts`) and language-aware remarks. |
| `assessment.ts` | `getContributingAssessmentResults` — **the single source of truth for which subjects count** toward aggregates and divisions. ICT, IRE and electives never do. Never reimplement this ([ADR-0006](../../../docs/adr/0006-contributing-subject-invariant.md)). |
| `teacher-initials.ts` | Initials resolution and cleanup (rejects `"null"`, `"none"`, `"n/a"` strings that exist in real data). |

**Storage & lifecycle**

| File | Purpose |
|---|---|
| `storage.ts` | Snapshot bytes in `report_snapshots.snapshot_json` (LONGTEXT). **No filesystem dependency** — required for serverless hosts. |
| `lifecycle.ts` | The state machine: `generating` → `ready` / `failed` / `cancelled` / `stale`. Every terminal state has `NULL` inflight_lock, so the unique index blocks only a *second concurrent generation* — never regeneration over history. |
| `overrides.ts` | SQL boundary for `report_card_overrides`. Every read joins through `report_snapshots` to enforce school scoping; the FK cascades on snapshot deletion. |
| `integrity.ts` | Regression guard from the 2026-07 division-mismatch postmortem: verifies every aggregate/division pair came from the same contributing subject set with canonical thresholds. Pure and read-only — callers decide whether a violation is fatal. Skips grade schemes outside D1–F9 (nursery letters, Arabic word grades, legacy A–E), where the invariant is undefined. |

**Rendering**

| File | Purpose |
|---|---|
| `print-state.ts` | `buildSnapshotRenderState` — assembles snapshot + overrides + comment rules into what a renderer consumes. This is where the [overall-comment render-time exception](../drce/RENDER_LAYERS.md) is implemented. |
| `build-print-html.ts` | Shared snapshot → HTML builder. Both `/print` (browser printing) and `/pdf` (puppeteer) call it, so the two can never drift. No `NextRequest`/`Response` coupling. |
| `running-header.ts` | Puppeteer header/footer templates. Separate module because puppeteer's `headerTemplate` has strict rules — all CSS must be inlined, text has zero default size, and `.pageNumber`/`.totalPages` only resolve with `displayHeaderFooter: true`. |
| `active-template.ts` | Which template id a given render should use, given mode + selection + fallbacks. Pure, and unit-tested — it used to be scattered inline. |
| `adapter/toDRCEDataContext.ts` | Snapshot student → `DRCEDataContext`. Snapshots store one score per subject, so it maps to `endTermScore` with `midTermScore` null, matching legacy behaviour. |
| `adapter/toTemplateMap.ts` | Snapshot → flat placeholder map for `emergency_html` templates. |
| `adapter/renderEmergencyTemplate.ts` | The `{{key}}` / `{{#subjects}}` string-replace renderer. Byte-compatible with the three legacy emergency routes. |

**Verification**

| File | Purpose |
|---|---|
| `verify-token.ts` | HMAC-SHA256 anti-forgery tokens behind the QR code on printed reports. Anyone can decode the payload; only the server can mint a valid signature. **Deliberately not time-bounded** — a parent checking a report years later should still get a valid view. Revocation is by key rotation. Signs with `SESSION_COOKIE_SECRET`. |

## Working in this folder

- **Adding a field to the snapshot?** Decide its sort order, add it to `types.ts`, and check whether it changes `dataHash` for existing data. It will — old snapshots keep their old hash and that is correct; don't backfill.
- **Never query live academic tables from a render path.** If a render needs something the snapshot lacks, add it to generation. The one sanctioned exception (overall-comment rules) is argued in full in [ADR-0007](../../../docs/adr/0007-overall-comment-render-time-exception.md) — treat it as a precedent to cite, not a pattern to copy.
- **Changing aggregates, divisions or the subject set?** Run `npm run test:snapshots` **and** `npm run verify:divisions`. The 2026-07 postmortem exists because these diverged once.
- **New render target?** Build on `build-print-html.ts` rather than assembling HTML again. The reason `/print` and `/pdf` agree is that they share it.

## Tests

`npm run test:snapshots` — integrity invariants, active-template resolution, print-state assembly. `npm run verify:divisions` runs `scripts/db/verify-snapshot-divisions.mjs` against real snapshots.

## Known constraints

- **`snapshot_json` is a LONGTEXT column.** A very large school's snapshot is a large row; there is no chunking. This is a known scaling ceiling.
- **Generation is single-flight per (school, term, year, type).** A second concurrent request is rejected rather than queued, and an abandoned run only clears when the staleness sweep runs.
- **Regeneration does not invalidate printed copies.** By design — but it means a school that regenerates after fixing marks has two legitimate documents in circulation. The verify token identifies which snapshot a printed copy came from.
- **`midTermScore` is always null** in the DRCE data context. Snapshots normalize to one score per subject; a template binding `result.midTermScore` renders empty.

## Dependencies

`src/lib/db` · `src/lib/drce` (defaults, grading scale, overrides, comment engine, assessment utils) · `src/lib/theology-subject-classifier` · `src/lib/reports/canonical-report-engine` (nursery handling) · `node:crypto`

## Related

[ADR-0005](../../../docs/adr/0005-report-snapshot-immutability.md) · [ADR-0006](../../../docs/adr/0006-contributing-subject-invariant.md) · [ADR-0007](../../../docs/adr/0007-overall-comment-render-time-exception.md) · [`../drce/RENDER_LAYERS.md`](../drce/RENDER_LAYERS.md) · [`../drce/README.md`](../drce/README.md) · [`docs/audits/DRCE_REPORT_ENGINE_HARDENING.md`](../../../docs/audits/DRCE_REPORT_ENGINE_HARDENING.md)
