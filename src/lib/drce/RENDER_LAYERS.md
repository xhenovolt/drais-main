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

## Phase 3.3 (planned)

- Author DRCEDocument JSON for `emergency-secular`, `emergency-theology`,
  `legacy-rpt` so they render through the same five-layer pipeline.
- Print route consults the registry; DRCE-native templates skip the
  emergency_html branch entirely.

## Phase 3.4 (planned)

- Section-type registry replaces the `switch (section.type)` in
  `DRCEDocumentRenderer`.
- Sunset `emergency_html` renderer once 3.3 reaches parity.
