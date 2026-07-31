# DRCE render-layer contract

Authoritative description of how a snapshot becomes a printed report. Every
new feature that touches rendering must respect this layering — diverging
breaks deterministic output and cross-tenant safety guarantees.

## Layers, in evaluation order

```
┌────────────────────────────────────────────────┐
│ 1. Base DRCEDocument                           │
│    Source of truth for layout. Comes from      │
│    dvcf_documents (DB) or BUILT_IN_TEMPLATES   │
│    (code). Never mutated post-load.            │
├────────────────────────────────────────────────┤
│ 2. Snapshot branding                           │
│    Frozen at generation time in                │
│    snapshot.meta.branding. Single source for   │
│    school name / logo / motto / address. No    │
│    runtime tenant lookup. Bound via            │
│    DRCERenderContext.school.                   │
├────────────────────────────────────────────────┤
│ 3. Snapshot data                               │
│    Per-student rows shaped by                  │
│    snapshotToDRCEDataContext. Reads only the   │
│    snapshot payload — never the live          │
│    results / marks tables.                     │
├────────────────────────────────────────────────┤
│ 4. Override layer  (Phase 3.1)                 │
│    applyOverrides(doc, studentOverrides) over  │
│    the document tree, plus a parallel filter   │
│    on the data context for hide_subject. NEVER │
│    mutates the snapshot or source data.        │
├────────────────────────────────────────────────┤
│ 5. Print rendering                             │
│    DRCEDocumentRenderer in editor / preview;   │
│    /print route in print mode. Both consume    │
│    the output of (4) — they must not introduce │
│    new branching that bypasses earlier layers. │
└────────────────────────────────────────────────┘
```

## Hard invariants

1. **Source academic data is immutable through render.** Layers 2–5 only
   read or filter; they never write back to `report_results`,
   `student_subjects`, or any other live academic table.
2. **Snapshot payload is immutable.** Once `report_snapshots.snapshot_json`
   is written, every render of that snapshot reproduces the same bytes
   under the same overrides.
3. **Overrides are snapshot-bound.** Cascade-deleted on snapshot flush
   via the `fk_overrides_snapshot` FK. Applying an override never
   touches another snapshot.
4. **Tenant boundary lives in the storage layer.** Every override read
   joins through `report_snapshots` and filters on `school_id`. The
   render layers themselves are tenant-blind by design — tenant safety
   is provided by the inputs they receive, not by checks they perform.
5. **Render is a pure function of (document, dataCtx, renderCtx).** No
   I/O, no fetch, no `Date.now()` outside the deterministic snapshot
   meta.

## Phase 3.1 implementation notes

- `applyOverrides` lives in `src/lib/drce/overrides.ts`. It transforms
  the document and stashes a parallel hint (`__hiddenSubjectIds`) for
  the data adapter so per-student row filtering does not require
  document mutations.
- `snapshotToDRCEDataContext` accepts an optional `hiddenSubjectIds`
  parameter and filters both `subjects` and `results` arrays. The
  snapshot itself is read-only.
- Persistence is in `src/lib/snapshots/overrides.ts`. School scoping
  enforced via JOIN on every read and write.
- API surface: `GET/POST/DELETE /api/snapshots/[id]/overrides` and
  `DELETE /api/snapshots/[id]/overrides/[overrideId]`.

## Phase 3.2 (shipped)

- `OverridesPanel` mounted next to the DRCE preview in
  `SnapshotPreviewer`. Three groups: document sections (snapshot-wide
  hide), per-student subjects (hide on the current learner only), and
  active-overrides list with per-row remove plus a "reset student"
  bulk action.
- All writes go through the Phase 3.1 CRUD API. No optimistic update —
  every mutation refetches via `reloadOverrides()` so the panel always
  reflects canonical server state and reconciles concurrent edits from
  other tabs.
- Engine implementations for `text_replace` and `spacing_patch` remain
  reserved in the ENUM and discriminated union; UI surface lands when
  needed.

## Phase 3.3 (shipped)

- Three new built-in registry entries with `renderer: 'drce'`:
  `drce-emergency-secular`, `drce-emergency-theology`, `drce-legacy-rpt`.
  Each maps to an authored `DRCEDocument` constant in
  `src/lib/drce/builtin-resolver.ts` (`EMERGENCY_SECULAR_DOCUMENT` is new;
  `ARABIC_CLONE_DOCUMENT` and `DRAIS_DEFAULT_DOCUMENT` reused from
  `defaults.ts`).
- `/api/dvcf/documents/[id]` consults the resolver before falling back to
  the numeric DB lookup, so SnapshotPreviewer can fetch built-in
  templates with the same code path it uses for school-authored ones.
- The override layer now applies to the emergency variants when rendered
  in DRCE mode. The static-HTML `emergency_html` entries remain alongside
  for the existing print path; the two coexist during the transition.

## Phase 3.4 (shipped)

- `src/lib/drce/print-renderer.ts` — `renderStudentToDRCEHtml` uses
  `react-dom/server`'s `renderToStaticMarkup` to render each student's
  card from a DRCEDocument. Per-student overrides applied inside the
  helper; branding sourced from `snapshot.meta.branding`. `wrapDRCEPrintDocument`
  produces the full HTML shell.
- `/print` route now attempts DRCE resolution before falling back to
  `emergency_html`:
    1. `resolveBuiltInDocument(templateId)` — built-in DRCE templates
       (`drce-emergency-secular`, `drce-emergency-theology`, `drce-legacy-rpt`)
    2. Numeric id → `dvcf_documents` DB lookup (school-authored DRCE)
    3. `resolveEmergencyTemplateFile(templateId)` — static HTML fallback
  If none match, returns 400 with a clear message.
- Overrides are fully applied to DRCE prints (per-student, snapshot-wide).
  Emergency_html prints remain override-agnostic — their string-substitution
  engine cannot honour DRCE override semantics.

## Renderer strategy (permanent, not transitional)

Both renderers are first-class production options with different tradeoffs:

| Renderer | Category | Tradeoff |
|---|---|---|
| `emergency_html` | emergency / arabic / legacy_rpt | Lightweight, fast, no per-report override support |
| `drce` | drce / standard / custom | Full override system, school branding, visual editor |

Schools choose per-snapshot which renderer to use via the `?template=` param
or the SnapshotPreviewer dropdown. The static HTML files under `backup/` are
retained — they serve both the SnapshotPreviewer emergency-mode iframe and
the legacy `/academics/secular-emergency-reports` routes. Deleting them would
break both.

## Overall-comment resolution — documented exception (2026-07)

Class Teacher / DOS / Headteacher comments (`src/lib/drce/commentEngine.ts`)
are the ONE field on a report that deliberately does NOT follow hard
invariants #2 and #5 above. Everything else on a report stays exactly as
frozen at generation time; comments do not.

**Why:** comment rules can now be scoped to a specific template
(`report_overall_comment_rules.template_id`, nullable = applies everywhere)
so a school running several report-card designs can give each one different
comment logic without duplicating or reconfiguring rules every time they
switch templates. Snapshots are generated once, template-unaware, and
printed under whichever template is active at the time — so honouring a
per-template scope requires knowing the template at PRINT time, not just at
generation time.

**What this means concretely:**
- At generation time (`src/lib/snapshots/generator.ts`), comments are still
  resolved once using the FULL rule set (template-unaware) and frozen into
  the snapshot exactly as before — this frozen value is the fallback.
- At render/print time (`src/lib/snapshots/print-state.ts`'s
  `buildSnapshotRenderState`), IF the caller supplies `overallCommentRules`
  (rules scoped to the actual template being rendered, fetched fresh by the
  page), comments are RE-resolved against those rules, using aggregate/
  division refreshed through that same template's own `aggregateConfig`
  (the same computation the `assessment` section already does at render
  time). If none match, it falls back to the frozen value from generation.
- **Accepted tradeoff:** reprinting the same report card can show different
  overall-comment wording if the school's comment bank (or which template is
  configured as active) changes between prints. No other field is affected —
  marks, grades, positions, aggregates-as-displayed, branding, and every
  other frozen value remain byte-for-byte identical across reprints.
- Parent-portal and public verify-token render paths do not fetch comment
  rules (no staff session to authenticate the fetch) — those always show the
  frozen generation-time value, same as before this existed.

## Future work (optional)

- Section-type registry to replace the `switch (section.type)` in
  `DRCEDocumentRenderer` — pure refactor, no user-visible change.
- Qualifications + subject specializations on staff profiles (Phase H).
- Allocation normalization UI (term picker, history view) — database is
  Phase-D-ready; UI surface ships in follow-up.
