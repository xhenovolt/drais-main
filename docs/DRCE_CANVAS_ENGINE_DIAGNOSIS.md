# DRCE — Canvas Engine Diagnosis & Rebuild Plan

> **Phase 1 deliverable.** Read-only audit. No code shipped in this round.
> Successor turns implement against the gaps identified here.

## 0. Honest framing

The brief reads as if DRCE is being rebuilt from scratch. The reality after
the 14 DRCE commits already shipped is more nuanced — most of the
"composition engine" infrastructure exists; the real gaps are concentrated
in the **interaction layer**, the **table engine**, and a few specific
editor surfaces. This document maps the existing system honestly so we
don't rebuild what we already have.

## 1. Inventory — what already exists

| Brief requirement | Status | Source (commit / file) |
|---|---|---|
| **Document schema tree** | ✅ Built | [src/lib/drce/schema.ts](../src/lib/drce/schema.ts) — `DRCEDocument { sections[] }`, container nesting via `children[]` (Phase C — `8620cf6`/`d2cf5a3`/`2488af1`) |
| **Atomic plugin registry** | ✅ Built | [src/lib/drce/section-registry.ts](../src/lib/drce/section-registry.ts) — adding a new section type is one `registerSection()` call (Phase D — `f913f36`) |
| **Layout containers** (stack / row / grid / absolute) | ✅ Built | `DRCEContainerSection` + `ContainerSection.tsx` (Phase C.1/C.2) |
| **Universal data binding** | ✅ Built | Computed registry + unified `resolveExpression` with paths, computeds, formatter pipes, conditionals, aggregations (`sum`, `avg`, `count`, `passed` …) — [src/lib/drce/computed/](../src/lib/drce/computed/) (Phase A+B+G) |
| **Calendar inference for `{next_term_begins}`** | ✅ Built | [src/lib/calendar/index.ts](../src/lib/calendar/index.ts) + snapshot wire-up (Phase B + `a77bfbc`) |
| **Render pipeline separation** | ✅ Built | `DRCEDocument` → `DRCEDataContext` (adapter) → `DRCEDocumentRenderer` — pure, deterministic. Documented in [src/lib/drce/RENDER_LAYERS.md](../src/lib/drce/RENDER_LAYERS.md) |
| **Path/vector engine** | ✅ Built | `DRCEPathShape` with anchor + bezier-handle nodes; Pen Tool; Custom Polygon (commit `dce1fe7`) |
| **8-handle resize on every shape** | ✅ Built | Including paths (proportional node scaling) — commit `82774ae` |
| **Smart alignment guides** | ✅ Built | Pink dashed guides; edges + centres snap within 5px to siblings (commit `82774ae`) |
| **Post-creation path node editing** | ✅ Built (anchors only) | Emerald square handles per anchor on selected paths (commit `82774ae`) |
| **Section plugin registry** | ✅ Built | New section types register from any module; renderer is one lookup |
| **Template inheritance + shared blocks** | ✅ Built | Phase H — `7bfaf29` |
| **Version history (per-save snapshots + restore)** | ✅ Built | Phase F — `1d1e691` |
| **Selection state (single)** | ✅ Built | `selectedId` (section) + `selectedShapeId` (shape) in `DRCEEditor.tsx` |
| **Override layer** (per-student) | ✅ Built | `src/lib/drce/overrides.ts` (Phase 3.1 historical) |
| **Footer / header / comment-rule reuse via block_ref** | ✅ Built | Phase H |
| **Live expression preview API** | ✅ Built | `POST /api/drce/expression/evaluate` returns catalogue + value |
| **Block-library admin** | ✅ Built | `/admin/drce/blocks` |
| **Categorized shape palette (Basic/Polygons/Banners/Vectors) + search** | ✅ Built | Commit `98f32e1` |

## 2. Gaps — where DRCE is genuinely rigid today

Numbered so each can be tracked to a remediation in §5.

### G1. Disjoint interaction layers (sections vs shapes)

The editor has **two interaction models that don't compose**:

- **Sections** render via document flow inside containers. Selection works
  (click to select, properties panel opens). Drag-to-reposition, resize
  handles, copy/paste, keyboard delete — **none of these work for
  sections**.
- **Shapes** render on an SVG overlay (`ShapeCanvas.tsx`). They have full
  drag, 8-handle resize, smart guides, keyboard delete, multi-position
  primitives.

A school can't select a banner and drag it sideways. Can't resize a comments
section with handles. Can't `Cmd+C` / `Cmd+V` a section.

### G2. No multi-select

`selectedId` and `selectedShapeId` are singletons. No `Set<id>`. No
marquee drag-rect to select a group. Can't bulk-style, bulk-delete, or
bulk-align several sections.

### G3. Table = static iterator, not spreadsheet

`ResultsTableSection.tsx` iterates `ctx.results[]` and renders rows. What
works:

- Column config (`columns[].binding` resolves once per cell)
- Per-cell inline edit (only for initials override — `contentEditable`)
- Totals row (`totalsConfig.sumColumnIds`)

What does NOT work — and what the brief calls out as critical:

- **No per-cell binding override** (`columns[c].binding` is the source for
  every row's column c; you can't say "row 3 of column Math uses a
  different binding")
- **No in-cell formulas** (the expression language has `sum(results,"score")`
  but you can't author `{=SUM(B2:B12)}` in a single cell)
- **No add/remove row from the editor UI** (data rows come from `results[]`)
- **No add/remove column from the UI** (columns are JSON-edited or
  Properties-Panel-edited; no in-grid "+ column")
- **No merge/split cells**
- **No column reorder via drag** (only via the properties panel)
- **No row-level total or computed columns**

### G4. Sections lack `x / y / w / h`

Section flow is positional through containers + order. To freely place a
section at (x=200, y=300), the only path today is wrap it in a Container
with `layout: 'absolute'` and set the section's pass-through `style.position
= 'absolute'`. There's no first-class `position` on a section, no drag
handle on the canvas, no resize on a section directly.

**Architectural tension:** absolute-positioning every section would break
the deterministic-flow rendering contract that gives byte-identical PDF
output. Section flow is correct for *print*. The fix is editor-side: the
editor offers free positioning visually, persisting it through container
`layout: 'absolute'` (which exists). The renderer remains pure.

### G5. Editor mutation = full re-render

`useDRCEEditor` holds the document in `useState`. Every mutation produces a
new `DRCEDocument` reference; the entire `DRCEDocumentRenderer` re-renders.
Sections aren't memoised; the renderer's section loop has no `React.memo`
boundary. Drag events (currently shapes only) call `onUpdateShape` on every
`mousemove`, triggering a full document render on every pixel.

This is the brief's "performance bottleneck." Concretely:

- Drag a shape across the canvas → 30–60 `setState({...doc, shapes: [...]})`
  per second → full `DRCEDocumentRenderer` re-render each time.
- No `requestAnimationFrame` batching.
- No "dirty region" — every paint redraws every section.

### G6. No floating contextual toolbar

Editing happens exclusively in the right-hand `PropertiesPanel`. There's no
floating toolbar near the selection for common verbs (duplicate / delete /
align / send-to-back / quick style).

### G7. No inline typography popover

Double-clicking a text shape enters textarea edit mode. There are no
inline font / size / colour / weight / line-height controls hovering over
the text — those live in the right panel only.

### G8. Bezier handles only manipulable during draw

In commit 2's Pen Tool, click-and-drag extrudes a symmetric bezier IN/OUT
handle. After commit, the path is selected and **only anchor handles
appear** (commit 3 — emerald squares). The IN/OUT bezier control handles
are not draggable post-creation. To re-curve a finished path you must
delete and redraw.

### G9. No copy / paste / duplicate

`Cmd+C` / `Cmd+V` / `Cmd+D` do nothing on sections or shapes. Duplicate
exists only as a hypothetical action; not wired.

### G10. No keyboard delete for sections

Delete / Backspace deletes shapes (commit 2 keyboard handler). Sections
require the properties panel's "Delete Section" button.

### G11. Snapshot data shape is closed for table extensions

The table reads from `ctx.results[]`. To allow tables that show *any*
collection (e.g. `subjects[]`, or a custom binding to a JSON array on the
snapshot), the table needs a `dataSource` binding, not just a hardcoded
results iteration.

### G12. No undo/redo across sessions

`useDRCEEditor` provides in-session undo/redo. Version history (Phase F)
provides per-save snapshots. Between those two there's no
"named-checkpoint" or "undo across reload" within a single edit pass.

## 3. Root-cause map

Each gap mapped to its underlying cause:

| Gap | Root cause |
|---|---|
| G1 (disjoint interaction) | Shapes and sections were built at different times; the shape SVG overlay grew its own drag/resize state machine while sections inherited a flow-only model from earlier templates. Never unified. |
| G2 (no multi-select) | `selectedId` was a single-id scalar from day 1; no upgrade since. |
| G3 (static table) | `ResultsTableSection` is one rendering component, not a `DataGrid` primitive. The schema (`DRCEColumn { id, header, binding, width }`) was designed for fixed-column report cards, not Excel-grade editing. |
| G4 (no section x/y) | The original schema put positioning under `Container.layout: 'absolute'` rather than on every section. The decision is correct for *print* determinism but blocks free canvas placement at section level. |
| G5 (full re-render) | `useState`-driven document object + no `React.memo` boundary around sections + no RAF batching. Architectural shortcut from before the editor became interactive. |
| G6, G7 (no floating UI) | The Properties Panel was built first; floating overlays were never added. |
| G8 (bezier post-create) | Pen tool ships drag-to-bezier for the in-progress draft; post-commit handle UI was queued for commit 4 and not yet shipped. |
| G9, G10 (no copy/keyboard) | Keyboard handler in `DRCEEditor.tsx` covers shapes only; no clipboard wire-up for either layer. |
| G11 (closed table data) | Table assumes one source (snapshot results); never generalised. |
| G12 (no cross-session undo) | Version-history is per-save; the editor's in-memory undo stack drops on reload. |

## 4. Architecture diagram (text form, current state)

```
                         DRCE — current state (post Phase H + path engine)
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  DATA SOURCES                                                                       │
│    • report_snapshots (frozen academic data, `meta.dataHash`)                       │
│    • dvcf_documents   (DRCEDocument JSON)                                           │
│    • drce_document_versions (per-save snapshots, Phase F)                           │
│    • drce_blocks      (shared block library, Phase H)                               │
│    • terms / academic_years (calendar inference source, Phase B)                    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  DOCUMENT SCHEMA                  (src/lib/drce/schema.ts)                          │
│  DRCEDocument = {                                                                   │
│    meta, theme, watermark,                                                          │
│    sections:    DRCESection[]   ← flow tree, supports nested Container              │
│    shapes:      DRCEShape[]     ← OVERLAY layer, absolute positioned                │
│    commentRules, teacherMappings                                                    │
│  }                                                                                  │
│                                                                                     │
│  Section variants (closed-but-pluggable via section-registry):                      │
│    header · banner · student_info · ribbon · results_table · assessment             │
│    comments · grade_table · spacer · divider · next_term_begins                     │
│    container · shape · header_block · block_ref                                     │
│                                                                                     │
│  Shape variants:                                                                    │
│    rect · ellipse · line · arrow · text · triangle · diamond · pentagon ·           │
│    hexagon · star · path (anchor + bezier nodes, Phase F-vector)                    │
└─────────────────────────────────────────────────────────────────────────────────────┘
                  │ load + resolveInheritance + resolveBlockRefs (Phase H)
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  EDITOR LAYER     (src/components/drce/editor/)                                     │
│                                                                                     │
│   ┌──────────────────┐  ┌──────────────────────┐  ┌─────────────────────────┐       │
│   │ SectionListPanel │  │ DRCEDocumentRenderer │  │ PropertiesPanel         │       │
│   │ (left rail —     │  │ (centre — flow,      │  │ (right panel —          │       │
│   │  nested w/ drop  │  │  re-renders ENTIRE   │  │  per-section editor +   │       │
│   │  zones; commit 3 │  │  doc on any mutation)│  │  Theme/Mark/Rules tabs) │       │
│   │  drag-into-      │  │                      │  │                         │       │
│   │  container)      │  │                      │  │                         │       │
│   └──────────────────┘  └──────────────────────┘  └─────────────────────────┘       │
│                                  │                                                   │
│                                  ▼ overlay                                           │
│                         ┌──────────────────────┐                                     │
│                         │ ShapeCanvas (SVG)    │                                     │
│                         │ + ShapeCanvas drag/  │                                     │
│                         │   resize/snap/guides │                                     │
│                         │   for SHAPES ONLY    │                                     │
│                         └──────────────────────┘                                     │
│                                                                                     │
│  State (useDRCEEditor):                                                             │
│   document · isDirty · undo/redo stack · selectedId · selectedShapeId · activeTool  │
└─────────────────────────────────────────────────────────────────────────────────────┘
                  │ save (PUT /api/dvcf/documents/[id]) → snapshotVersion (Phase F)
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  RENDER PIPELINE (deterministic, pure)                                              │
│                                                                                     │
│   snapshotToDRCEDataContext → ctx (student/subjects/results/meta/calendar)          │
│   applyOverrides            → doc with per-student structural overrides             │
│   DRCEDocumentRenderer      → same component, server-side via                       │
│                               renderToStaticMarkup for /print                       │
│                                                                                     │
│   Expressions resolved via resolveExpression — paths · computeds ·                  │
│   formatter pipes · if/then/else · aggregations (sum/avg/count/...)                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## 5. Target architecture — what changes

Driven by the gaps. The boxes in **bold** are NEW or rebuilt; everything
else stays.

```
                         DRCE — target state
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  DATA SOURCES (unchanged)                                                           │
└─────────────────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  DOCUMENT SCHEMA                                                                    │
│   • Section gains optional `frame: { x, y, w, h }` for editor free positioning.     │
│     Renderer keeps treating absent frame as flow (print determinism preserved).     │
│   • New DRCETableSection (atomic grid primitive; not the current ResultsTableSection│
│     which becomes a thin preset of DRCETableSection).                               │
│   • Cells: { binding?, value?, formula?, style?, mergeRight?, mergeDown? }          │
│   • dataSource: optional binding to any array (`{subjects}`, custom array, etc.)    │
│   • Sections gain `locked: boolean`.                                                │
└─────────────────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  EDITOR LAYER                                                                       │
│                                                                                     │
│   ┌──────────────────┐  ┌──────────────────────────────────┐  ┌─────────────────┐   │
│   │ SectionListPanel │  │ CanvasWorkspace ★ NEW            │  │ PropertiesPanel │   │
│   │ (unchanged)      │  │ Unifies sections + shapes under  │  │ (still right    │   │
│   │                  │  │ ONE interaction layer:           │  │  rail; floating │   │
│   │                  │  │ • multi-select (Set<id>)         │  │  toolbar near   │   │
│   │                  │  │ • drag/resize handles on EVERY   │  │  selection      │   │
│   │                  │  │   selected element (section or   │  │  duplicates     │   │
│   │                  │  │   shape)                         │  │  common verbs)  │   │
│   │                  │  │ • keyboard: Del / Cmd+C / Cmd+V  │  │                 │   │
│   │                  │  │   / Cmd+D / arrow-key nudge      │  │                 │   │
│   │                  │  │ • smart guides (already built)   │  │                 │   │
│   │                  │  │ • RAF-batched drag updates       │  │                 │   │
│   │                  │  │                                  │  │                 │   │
│   │                  │  │  Composed of:                    │  │                 │   │
│   │                  │  │   • DRCEDocumentRenderer (memo'd │  │                 │   │
│   │                  │  │     per section)                 │  │                 │   │
│   │                  │  │   • ShapeCanvas (unchanged)      │  │                 │   │
│   │                  │  │   • SelectionLayer ★ NEW         │  │                 │   │
│   │                  │  │     bbox + handles for ANY       │  │                 │   │
│   │                  │  │     selected element             │  │                 │   │
│   │                  │  │   • ContextualToolbar ★ NEW      │  │                 │   │
│   │                  │  │   • TypographyPopover  ★ NEW     │  │                 │   │
│   │                  │  └──────────────────────────────────┘  └─────────────────┘   │
│                                                                                     │
│  State (useDRCEEditor extended):                                                    │
│   document · isDirty · undo/redo · selectedIds: Set<string> ★ · clipboard ★ ·       │
│   activeTool · interactionMode (idle | dragging | resizing | editing-text)          │
└─────────────────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  TABLE ENGINE ★ NEW (src/lib/drce/table/)                                           │
│                                                                                     │
│   DataGrid primitive:                                                               │
│     rows[] (dynamic — from dataSource binding OR explicit rows)                     │
│     columns[] (id, header, width, binding?, format?)                                │
│     cells: Map<rowId+colId, Cell>  (sparse — only cells with overrides stored)      │
│     mergeMap: { rowId+colId → { right: n, down: n } }                               │
│                                                                                     │
│   Formula evaluator (reuses resolveExpression):                                     │
│     {=SUM(B2:B12)} → expands to sum(rowsInRange, "B") → resolveExpression call      │
│     {=AVG(this.column)} {=IF(score >= 50, "Pass", "Fail")}                          │
│     Recalculation: dirty propagation on cell change; topological order              │
│                                                                                     │
│   Editor UX:                                                                        │
│     in-grid: +row / +column / merge / split / column-drag-reorder                   │
│     per-cell click → focus → type to edit (formula or value)                        │
└─────────────────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  RENDER PIPELINE (unchanged, pure)                                                  │
│   Same `DRCEDocumentRenderer` for editor preview AND /print.                        │
│   Pure function of (document, dataCtx, renderCtx) — no I/O.                         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## 6. Component model breakdown (target)

| Component | Layer | Responsibility |
|---|---|---|
| `DRCEEditor` | editor shell | Top bar, history, save, version chip; mounts everything. |
| **`CanvasWorkspace`** ★ | editor canvas | Hosts the renderer, ShapeCanvas, SelectionLayer, ContextualToolbar, TypographyPopover. Owns multi-select, drag, keyboard, RAF batching. |
| **`SelectionLayer`** ★ | editor overlay | Renders bbox + 8 handles for *any* selected element (section or shape). Drives drag/resize uniformly. |
| **`ContextualToolbar`** ★ | editor overlay | Floats near selection. Duplicate · Delete · Align · Send-to-back / front · quick style. Tracks selection position via DOMRect + ResizeObserver. |
| **`TypographyPopover`** ★ | editor overlay | On double-click of text element: font/size/colour/weight/line-height/alignment/spacing. Native inputs, applies via mutations. |
| `SectionListPanel` | editor rail | Unchanged. |
| `PropertiesPanel` | editor rail | Unchanged but no longer the *only* path to common verbs. |
| `DRCEDocumentRenderer` | render | Pure render. New: wrapped per-section in `React.memo` keyed on `(section, theme, dataCtx slice for that section)`. |
| **`DataGrid`** ★ | atomic block | Spreadsheet primitive used by `DRCETableSection`. Internal: cell focus, formula bar, range select, merge. |
| `FormulaEvaluator` ★ | lib | Parses `=…` formulas, references (`A1`, `Math:Score`), ranges (`B2:B12`), aggregates; bridges to `resolveExpression`. |
| `ShapeCanvas` | overlay | Unchanged except: emits its bbox + drag to `CanvasWorkspace` so SelectionLayer can render across both layers. |
| `useDRCEEditor` | hook | Extended: `selectedIds: Set<string>`, `clipboard`, `interactionMode`, `pushCheckpoint(label)` for named cross-session undo. |

## 7. Data flow

```
USER ACTION                  STATE LAYER                       RENDER
───────────────────────────  ─────────────────────────────     ─────────────────────────
click section/shape      →   selectedIds: Set<id> updated   →  SelectionLayer paints bbox
                                                                ContextualToolbar appears
drag selected element    →   RAF-batched delta accumulator  →  Only the dragged element's
                             every 16ms → setDoc                memo recomputes; others
                                                                skip via React.memo eq
keystroke (Del)          →   filterSectionsDeep / removeShape→ full doc render (rare)
double-click text        →   interactionMode = 'text-edit'  →  TypographyPopover anchors;
                                                                inline contentEditable
formula change in cell   →   FormulaEvaluator runs           →  DataGrid recomputes only
                             dirty propagation               →  affected cells + totals
save                     →   PUT /api/dvcf/documents/[id]   →  snapshotVersion (Phase F)
                                                                refresh version chip
```

## 8. Performance strategy

The brief calls performance out explicitly. Concrete plan:

1. **Per-section memoization.** Wrap each section's render output in
   `React.memo` keyed on `(section, theme, languageSliceOf(dataCtx))`. The
   wrapper checks reference equality on `section` — since mutations are
   immutable, an untouched section passes equality and skips.
2. **RAF-batched drag.** During a drag, the cursor delta accumulates in a
   ref; a single `requestAnimationFrame` callback applies the accumulated
   delta to the document state. Stops the 60-Hz `setState` flood.
3. **Dirty-region paint.** SelectionLayer + ContextualToolbar are positioned
   via CSS transform on a single `<div>` that's the only thing changing
   during a drag. The renderer below doesn't re-mount; sections only paint
   if their props change.
4. **Selection state lives in a separate Zustand-style store** (or
   `useSyncExternalStore`) so selection changes don't trigger document
   re-render. Today selection lives in the same component that holds the
   document; any selection change re-renders the entire DRCEEditor.
5. **Formula evaluation memoised per cell** with a dependency graph: change
   B2 → only B2 + its dependents recompute, not the whole table.
6. **ShapeCanvas already uses local SVG state for drag preview** (commit 2);
   final `onUpdateShape` is called once on `mouseup`. Will extend the same
   pattern to sections in CanvasWorkspace.

## 9. Migration strategy — old DRCE templates → new canvas

The brief specifically asks. Honest answer: **most existing documents
need no migration.** What's new is opt-in.

| Existing template feature | Action required |
|---|---|
| Flow-based sections | None. Renderer keeps treating absent `frame` as flow. |
| `ResultsTableSection` | None today. Optional re-author as `DRCETableSection` to unlock formulas / merge / per-cell binding. Compatibility wrapper renders the old config as the new grid. |
| Header slot map (`DRCEHeaderSection`) | None. Phase E already provides `header_block` for new headers; the slot map keeps rendering as a preset. |
| Shapes on the overlay (legacy `document.shapes[]`) | None. `shape` sections from Phase C.2 are the new path; the overlay layer continues to render the legacy array. |
| `block_ref` already present | None. Inheritance + blocks (Phase H) work as-is. |
| Snapshot data | None. `meta.dataHash` unchanged by any of this. |

A small one-shot migration utility (CLI script, opt-in per document) can
auto-convert:
- legacy `DRCEHeaderSection` → a Container with `header_block` children
- legacy `DRCEResultsTableSection` → the new `DRCETableSection` with its
  config rehydrated as columns / cell bindings
- legacy `document.shapes[]` → `shape` sections inside an absolute
  Container at the bottom of the section list

These are *additive cleanups*, not requirements. v1 documents render
forever.

## 10. Phased rebuild — what to ship and in what order

The brief's "Phase 2 + commit 4 features" decompose into this safe sequence:

| Step | Lands | Risk | Hard guarantees still hold? |
|---|---|---|---|
| **A. State refactor — multi-select + selection store** | `selectedIds: Set<string>` everywhere; selection store decoupled from document state. | LOW | Yes. |
| **B. `SelectionLayer` + section drag/resize (with `frame` opt-in)** | Click any section → bbox handles; drag to free-position (writes `style.position/left/top` so the renderer keeps flowing the un-framed ones). | MED | Yes — un-framed sections still flow; print determinism intact. |
| **C. `ContextualToolbar`** | Duplicate · Delete · Align · Layer · quick style. Tracks selection rect. | LOW | Yes. |
| **D. Keyboard + clipboard** | Del / Cmd+C / Cmd+V / Cmd+D / arrow-nudge for sections and shapes. | LOW | Yes. |
| **E. `TypographyPopover`** | Double-click text → inline font/size/colour/weight/line-height/alignment. | LOW | Yes. |
| **F. Bezier handle editing on selected paths** | Drag IN/OUT control handles after creation; smooth/sharp toggle per node. | LOW | Yes. |
| **G. Performance pass** | `React.memo` per section; RAF-batched drag; selection in external store; dirty-region overlay. | MED | Yes. |
| **H. `DataGrid` primitive + new `DRCETableSection`** | Spreadsheet behaviour: in-grid +row/+col/merge/split, per-cell binding & value, formula bar, range select. | HIGH | Yes — legacy `ResultsTableSection` keeps rendering until per-school migration. |
| **I. Formula evaluator** | `=SUM(B2:B12)`, `=AVG(this.column)`, `=IF(score >= 50, "Pass", "Fail")` — built on `resolveExpression`. | MED | Yes (pure). |
| **J. `dataSource` binding for table** | Tables can iterate any array (`{subjects}`, custom bindings) not just `results`. | LOW | Yes (additive field). |

**A→G is the "commit 4 + canvas engine" payload** the brief actually
asks for. **H+I+J is a separate later workstream** because a spreadsheet
engine is its own project (1–2 weeks of focused work) and the user has
not asked to drop everything for it yet.

## 11. What I'm NOT proposing

To keep the diagnosis honest:

- I'm **not proposing absolute-position-by-default for sections**. Print
  determinism requires flow rendering; the `frame` field is opt-in.
- I'm **not proposing rewriting the schema, render pipeline, or override
  system**. They work, are documented, and are the load-bearing pieces
  the brief's "render pipeline separation" requirement asks for —
  already met.
- I'm **not proposing replacing `ResultsTableSection` immediately**. A
  parallel `DRCETableSection` (Step H above) lets schools migrate when
  they want formulas; legacy keeps rendering byte-identical.
- I'm **not promising a full Figma-grade canvas**. We can get to the
  "shapes + sections behave the same way under unified selection +
  drag + resize + clipboard + RAF" bar. Things like layer panel,
  blend modes, infinite zoom + pan with virtualisation are explicitly
  out of scope unless asked.

## 12. Open decisions I need from the operator before coding

1. **Multi-select**: shift-click only, or shift-click AND marquee
   drag-rect? (Marquee is more UX work; shift-click is half a day.)
2. **Snap-to-grid**: should free-positioned sections snap to an integer
   px grid (default), or to an alignment guide system (already built —
   commit 3)? Both?
3. **Step H (DataGrid)** — when do you want this? It's a 1–2 week
   workstream and warrants its own go/no-go.
4. **`xhenovolt/drais-main` push noise** — should I delete the
   `xhenovolt` push URL on `origin` so `git push origin` only pushes to
   `xhenvolt-code/drais-main` (the mirror) and stops emitting the
   `fatal: could not read Password` line when `gh auth` isn't logged in?
   (Tangential to DRCE, but it's been noise for many commits.)
