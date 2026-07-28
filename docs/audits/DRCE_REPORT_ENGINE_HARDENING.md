# DRCE Report Engine Hardening — Phase 0 Audit

**Status:** Phase 0 (audit only — no behavioural changes shipped in this document).
**Scope:** Report Customization Engine (DRCE) + Report Generation/Render/Print/PDF pipeline.
**Goal:** DRCE as the single source of truth; accurate totals; intelligent, configurable
comments; professional signatures; validation; and preview/print/PDF/snapshot parity.

All findings below are grounded in specific files and lines in the current tree.

---

## 0. Pipeline map (as-built)

```
DRCEDocument (layout source of truth)
  ├─ School-authored:  dvcf_documents (DB)         ← /api/dvcf/documents, /api/report-templates
  └─ Built-in:         src/lib/drce/defaults.ts, src/lib/drce/builtin-resolver.ts
        │
        ▼
Snapshot generation  (freezes branding + per-student academic rows + comments)
   report_snapshots.snapshot_json         (immutable once written)
        │
        ├──────────────► TWO parallel data adapters ◄───────────────┐
        ▼                                                            ▼
 snapshotToDRCEDataContext                             snapshotToTemplateMap
 src/lib/snapshots/adapter/toDRCEDataContext.ts        src/lib/snapshots/adapter/toTemplateMap.ts
   (feeds the DRCE renderer)                             (feeds the emergency_html string-substitution renderer)
        │                                                            │
        ▼                                                            ▼
 applyOverrides (Phase 3.1)                              (no override support)
        │                                                            │
        ▼                                                            ▼
 DRCEDocumentRenderer  ── shared ──►  print-renderer.ts    renderEmergencyTemplate.ts
 (editor / preview)     renderToStaticMarkup (/print, PDF)  (string replace of {{placeholders}})
```

**Key structural fact (good news):** the `drce` renderer is a *single* engine.
`src/lib/drce/print-renderer.ts:47-56` renders the very same
`DRCEDocumentRenderer` component (via `react-dom/server` `renderToStaticMarkup`)
that the editor/preview use. So for DRCE templates, **preview, browser-print and
PDF are byte-identical by construction** — they cannot diverge in section logic.

**Key structural risk (root of most issues):** there are **two** renderers and
**two** data adapters. The legacy `emergency_html` path
(`renderEmergencyTemplate.ts` + `toTemplateMap.ts`) is a **string-substitution**
engine with **no** totals logic, **no** signature logic, and **no** override
support. Any school whose active template resolves to `emergency_html` gets a
report that structurally cannot honour DRCE totals/signatures/overrides.

---

## 1. DRCE Architecture Audit

| Concern | Finding | Evidence |
|---|---|---|
| Section vocabulary | Rich & mature. `results_table` (with `totalsConfig`), `comments` (item bank), `signature_block` (full signatory model), `assessment` (aggregate/division config), grade_table, etc. | `src/lib/drce/schema.ts:512-734` |
| Section dispatch | Clean plugin registry — `getSectionPlugin(section.type)`; each type registered once in `builtins.tsx`. No giant switch in the renderer. | `DRCEDocumentRenderer.tsx:52`, `sections/builtins.tsx:56-292` |
| Totals config | Fully modelled: enabled/labels/showTotalObtained/Possible/Percentage/Average/GrandGrade/sumColumnIds/rowStyle. Editable in Properties panel. | `schema.ts:548-576`, `editor/PropertiesPanel.tsx:1266-1298` |
| Signature config | Fully modelled: per-signatory role/name/image(static or bound)/date/line styling. | `schema.ts:671-721` |
| Comment config | **Weak.** `DRCECommentItem = { label, binding, visible, order }` — a static dot-path binding only. **No conditional/rule capability.** | `schema.ts` (DRCECommentItem) |

**Verdict:** the schema is *not* the bottleneck for totals or signatures. It **is**
the bottleneck for intelligent comments (no rule model exists).

---

## 2. Report Rendering Audit

| Path | Renders totals? | Renders signatures? | Renders comments? | Overrides? |
|---|---|---|---|---|
| `drce` (DRCEDocumentRenderer / print-renderer) | **Yes** — `ResultsTableSection.tsx` + `totalsCalculator.ts` | **Yes** — `SignatureSection.tsx`, registered `signature_block` | Yes (static binding) | Yes |
| `emergency_html` (renderEmergencyTemplate) | **No** — grep for total/signature returns nothing | **No** | Yes (placeholder substitution only) | No |

**Duplicate renderer file:** `src/components/drce/sections/ResultsTableSection.js`
is a **stale transpiled twin** of `ResultsTableSection.tsx` (contains `__assign`,
`_e !== void 0` downlevel artifacts). `builtins.tsx:27` imports it extension-less
(`'./ResultsTableSection'`). Under the current bundler resolution this *currently*
picks the `.tsx`, but the `.js` is a latent shadow hazard and dead, drift-prone
code. **Patch:** delete the `.js` twin (mirrors the P1 removal of the stale
`academics/reports/page.js`).

---

## 3. Snapshot Dependency Audit

- **Branding** is frozen in `snapshot.meta.branding` and bound via
  `DRCERenderContext.school` — correct (no runtime tenant lookup). `RENDER_LAYERS.md:16-22`.
- **Academic rows / subjects / totals inputs** are read only from the snapshot
  payload, never the live results tables — correct and deterministic.
- **Comments are frozen into the snapshot** as `student.comments.{classTeacher,dos,headTeacher}`
  (`snapshots/types.ts:181`) and as per-subject `remarks`. This is the crux of
  Issue 2 (§4): whatever comment text exists at generation time is what prints.
- **Two adapters read the same snapshot differently** — `toDRCEDataContext.ts`
  vs `toTemplateMap.ts`. Both call the same `displaySubjectComment()` helper, so
  subject comments agree; but overall comments, totals and signatures only exist
  in the DRCE adapter/renderer. This is the divergence surface.

---

## 4. Intelligent Comment Engine Design  *(root cause + design)*

**Root cause (confirmed):** `src/lib/snapshots/grader.ts`
- `defaultComments(language)` (`grader.ts:114`) returns **fixed identical strings**
  for the three overall comments — e.g. `classTeacher: 'Excellent work, keep it up'`,
  `dos: 'Thank you for this effort, continue'`, `headTeacher: 'Promising grades, continue'`.
  Every student with no manually-typed overall comment gets these **regardless of
  performance** — a failing learner's headteacher line reads *"Promising grades, continue."*
- `subjectComment(score)` (`grader.ts:75`) *is* score-adaptive but crude (6 fixed
  bands) and **not school-configurable**.

**Design (minor release):**
1. **Comment-rule model in DRCE** (new). Extend `DRCECommentItem` (or add a sibling
   `DRCECommentRuleBank`) with an ordered rule list:
   `{ when: <predicate over metrics>, text, textAr }`, where metrics include
   `percentage, average, aggregate, division, grade, subjectMin/Max, improvementTrend,
   attendanceRate, behaviour, promotionStatus, custom flags`.
2. **Configurable thresholds per school** — persisted with the template (DRCE =
   source of truth), not hardcoded. Ship sensible defaults matching the brief's
   bands (90–100 Outstanding … <40 Requires intervention) as a *seed*, fully editable.
3. **Resolver** — a pure function `resolveComment(bank, metrics, language)` that
   returns the first matching rule's text; falls back to a configured default (never
   a hardcoded phrase). Roles supported: headteacher / class-teacher / DOS / registrar
   / custom, plus categories (positive, encouraging, warning, promotion, retention,
   remedial, leadership, attendance, behaviour).
4. **Snapshot integration** — at generation, if no human comment is present, populate
   `student.comments.*` from the rule engine using the frozen metrics (keeps snapshot
   self-contained and deterministic). Manual teacher comments always win.
5. **Determinism** — rule evaluation is pure over snapshot metrics; `dataHash`
   invariance preserved (same inputs → same output).

**Non-negotiable:** no hardcoded phrases in the engine — every phrase originates
from an editable DRCE comment bank.

---

## 5. Signature Framework Design

**Finding:** the renderer and schema are complete (`SignatureSection.tsx`,
`schema.ts:671-721`), but **default report-card templates ship without a
`signature_block`** — `grep -c signature_block src/lib/drce/defaults.ts` = **0**;
only the transcript builtin has one (`builtin-resolver.ts:246`). So schools see no
signature area not because the engine can't render it, but because the default
documents don't include it, and the `emergency_html` path has no signature concept.

**Design:**
1. **Patch:** add a configurable `signature_block` to the built-in default report
   documents (`defaults.ts`) — Headteacher + Class Teacher by default, each toggleable.
2. **Minor:** signature framework polish — role presets (Headteacher, Class Teacher,
   DOS, Academic Registrar, Bursar, Parent, Candidate, custom), per-block enable/disable,
   printed name + position + date line + stamp placeholder, optional uploaded scanned
   signature via `imageBinding`, digital-signature slot reserved for future.
3. **Emergency path:** either (a) map a `[[signatures]]` placeholder in the emergency
   templates, or (b) recommend migrating those schools to the DRCE renderer (preferred —
   see §9). Document the limitation explicitly.

---

## 6. Totals Rendering Audit  *(root cause)*

**Totals ARE computed and rendered in the DRCE path** — `ResultsTableSection.tsx:121-137,259+`
via `src/lib/drce/totalsCalculator.ts`, with `totalsEnabled` defaulting to **true**.
So the flagship symptom ("Total component present, value blank") has three candidate
causes, in likelihood order:

1. **Fragile column auto-detection (primary).** `ResultsTableSection.tsx:123-125`:
   when `totalsConfig.sumColumnIds` is empty, it sums **only columns whose `id`
   contains the substring `"score"` or `"total"`**. A table whose mark columns are
   named `eot`, `bot`, `mot`, `exam`, `marks`, `final` yields an **empty**
   `sumColumnIds` → empty `totalColumns` → per-column totals render **blank** even
   though the row (and its label) appears. **This is the most probable "totals not
   displaying" bug.**
   **Patch:** resolve summable columns from DRCE column metadata (numeric/mark-bound
   columns) rather than a substring guess on the id; fall back to *all numeric
   columns* if none are explicitly configured.
2. **Emergency_html template (structural).** If the school's active template is
   `emergency_html`, there is no totals engine at all. **Fix:** §9 migration / explicit
   validation warning.
3. **Grand-total field mismatch.** The grand `totalObtained` sums `result.total`
   (`ResultsTableSection.tsx:131`); if the snapshot rows don't populate `total`, the
   grand row is 0. Verify the adapter always sets `result.total`.

**Also:** the stale `.js` twin (§2) is a second-order risk for this exact section.

---

## 7. Validation Engine Design

**Finding:** **no pre-render validation exists** (grep for validate* across
`src/lib/drce`, `src/lib/snapshots`, `src/app/api/snapshots` returns nothing).
Reports render whatever they can and silently drop the rest.

**Design (minor):** a pure `validateReport(document, dataCtx)` run before render /
at snapshot preview, returning structured findings:
- All configured bindings resolve (comments, student_info fields, signatures).
- Totals are calculable (≥1 summable column resolves; subject totals present).
- Required signatories have a name or an explicit "leave blank for signing" flag.
- Required placeholders populated; unresolved bindings surfaced as warnings, not blanks.
Surface results in the SnapshotPreviewer and block/soft-warn on generate. Never
silently emit an incomplete report.

---

## 8. Founder Dependence Audit

| Hidden default / hardcode | Location | Fix tier |
|---|---|---|
| Overall comments hardcoded, performance-blind | `grader.ts:114` `defaultComments()` | Minor (§4) |
| Subject comment bands hardcoded, not school-configurable | `grader.ts:75` `subjectComment()` | Minor (§4) |
| Totals column set guessed by id substring | `ResultsTableSection.tsx:123-125` | Patch (§6) |
| Default templates omit signatures | `defaults.ts` (0 signature blocks) | Patch (§5) |
| No validation → silent incomplete reports | (absent) | Minor (§7) |
| Duplicate/stale renderer file | `ResultsTableSection.js` | Patch (§2) |
| Two divergent render/data paths | emergency_html vs drce | Roadmap (§9) |

DRCE is *mostly* the source of truth for layout/branding/totals/signatures already;
the leaks are **comments (hardcoded)**, **totals column resolution (heuristic)**, and
the **emergency_html divergence**.

---

## 9. Recommended Patch vs Minor Roadmap

### Patch releases (bugs / consistency — no new subsystems)
- **P-A Totals column resolution.** Replace the `"score"/"total"` substring guess
  with numeric/mark-bound column detection; sum all numeric columns when unconfigured.
  *(Fixes the headline "totals blank" bug.)*
- **P-B Remove stale `ResultsTableSection.js`** twin (verify `.tsx` canonical first).
- **P-C Default signatures.** Add toggleable `signature_block` (Headteacher + Class
  Teacher) to the built-in default report documents.
- **P-D Grand-total field guard.** Ensure the adapter always populates `result.total`;
  guard the grand row against missing values.

### Minor releases (new subsystems)
- **M-A Intelligent Comment Engine** (§4) — rule model in DRCE, configurable thresholds,
  pure resolver, snapshot integration, seed banks. Replaces `defaultComments()`.
- **M-B Signature Framework** (§5) — role presets, per-block enable/disable, stamp +
  uploaded signature, editor UI.
- **M-C Report Validation Engine** (§7) — `validateReport()` + preview surfacing.
- **M-D Renderer convergence** (§0/§2) — migration path off `emergency_html` for schools
  that need totals/signatures/overrides, or a documented feature-parity boundary.

### Success-criteria traceability
✓ totals always render → P-A + P-D + M-C · ✓ intelligent comments → M-A ·
✓ configurable comment banks → M-A · ✓ professional signatures → P-C + M-B ·
✓ preview/print/PDF parity → already true for `drce` (§0); emergency_html addressed by M-D ·
✓ DRCE single source of truth → P-A + M-A remove the last hardcodes ·
✓ no founder intervention → §8 fully closed after the above.

---

## Recommended first slice

Ship the **patch bundle P-A → P-D** first (highest trust-per-line: fixes the visible
"totals blank" bug, removes the stale twin, puts signatures on every default report),
then the **Intelligent Comment Engine (M-A)** as the flagship minor, then M-B/M-C, with
M-D as the strategic convergence. Each lands with its own build + audit note, per the
LTS cadence.
