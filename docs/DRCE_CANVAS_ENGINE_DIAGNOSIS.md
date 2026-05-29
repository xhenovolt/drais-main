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

| Component | Layer | Responsibility | Status |
|---|---|---|---|
| `DRCEEditor` | editor shell | Top bar, history, save, version chip; mounts the canvas + rails. | shipped |
| **`SelectionLayer`** | editor overlay | bbox + 8 resize handles + drag for any selected section. Writes `style.position='absolute'/left/top/width/height`; previewScale-aware; RAF-batched commits. | X2 `0d4616a` / X3 `647c406` |
| **`ContextualToolbar`** | editor overlay | Floats near selection (via `data-drce-section-id`/`data-drce-shape-id` rect + ResizeObserver). Duplicate · copy · paste · move up/down · delete. | X1 `f0a63cf` |
| **`TypographyPopover`** | editor overlay | Double-click text shape → family/size/weight/italic/alignment/colour/background. `fontFamily` carried as an additive untyped extra on the shape. | X1 `f0a63cf` |
| **`selectionStore`** | hook | `useSyncExternalStore`-backed store: `sectionIds`, `shapeIds`, `primary`, `clipboard`. Selection no longer triggers document re-render. | X1 `f0a63cf` |
| `SectionListPanel` | editor rail | Added `table` to palette + labels + icons. | extended X4 `fbfc183` |
| `PropertiesPanel` | editor rail | Switch routes `table` → new `TablePropertiesPanel`. Other panels unchanged. | extended X4 `fbfc183` |
| `DRCEDocumentRenderer` | render | Pure. Wrapped per-section in `React.memo` with reference-equality predicate on `(section, dataCtx, renderCtx, isSelected, callbacks)`. Adds `data-drce-section-id` for overlay measurement. | X3 `647c406` |
| **`TableSection`** | atomic section | Renders `DRCETableSection`. Two-pass cell resolver (literals/bindings, then formulas). Per-cell `mergeRight`/`mergeDown`, totals row, optional contentEditable cells. | X4 `fbfc183` |
| **`TablePropertiesPanel`** | editor rail | Columns editor, `dataSource` binding, static row count, totals config, per-cell editor (value/binding/formula/format/merge/style). | X4 `fbfc183` |
| **`formula` lib** | lib | `src/lib/drce/table/formula.ts` — A1 refs, A1:B5 ranges, `this.column`/`this.row`, SUM/AVG/MIN/MAX/COUNT/IF; bridges to `resolveExpression`. | X4 `fbfc183` |
| `ShapeCanvas` | overlay | Added `data-drce-shape-id`; added `bezier` drag variant for post-creation IN/OUT handle editing (symmetric by default, Alt to break / extrude). | extended X1 `f0a63cf` |

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

## 8. Performance strategy — what shipped

1. **Per-section memoization.** `DRCEDocumentRenderer.tsx` wraps each
   section in a `MemoSection` (`React.memo` with explicit equality on
   `section`, `dataCtx`, `renderCtx`, `isSelected`, and the callback
   refs). Immutable mutation produces a new `section` ref only for the
   touched section; every sibling skips render. (X3 `647c406`)
2. **RAF-batched drag.** `SelectionLayer` accumulates pointer deltas
   into a ref and schedules a single `requestAnimationFrame` per frame
   that commits via `SET_SECTION_STYLE`. Pending RAF is force-flushed
   on `mouseup` so the final position is durable. (X3 `647c406`)
3. **Selection lives outside the document.** `selectionStore.ts` is a
   `useSyncExternalStore`-backed store; click/multi-select/clipboard
   changes do NOT trigger a document re-render. (X1 `f0a63cf`)
4. **Overlay measurement is DOM-anchored, not React-tree-coupled.** The
   contextual toolbar and typography popover read positions from
   `data-drce-section-id` / `data-drce-shape-id` via `getBoundingClientRect`
   + `ResizeObserver`. They re-render independently of the document tree.
5. **Two-pass cell evaluation.** `TableSection` resolves all literal /
   binding cells first, then formula cells with the populated grid as
   input — single linear pass per render rather than recursive resolution.
   (X4 `fbfc183`)
6. **ShapeCanvas drag preview is local SVG state**; the document mutation
   fires once on `mouseup`. (pre-X1, unchanged.)

Not yet shipped: per-cell formula dependency graph (currently every render
of a table re-evaluates every formula; fine for the row counts DRCE actually
sees, but the obvious next optimisation when row counts grow).

## 9. Migration strategy — old DRCE templates → new canvas

The brief specifically asks. Honest answer: **most existing documents
need no migration.** What's new is opt-in.

| Existing template feature | Action required |
|---|---|
| Flow-based sections | None. Renderer keeps treating absent `frame` as flow. |
| `ResultsTableSection` | None. `DRCETableSection` ships in parallel (X4 `fbfc183`); use it for new documents that need formulas / merge / arbitrary `dataSource`. Legacy results table keeps rendering byte-identical. |
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

## 10. Phased rebuild — what shipped

All ten phases A–J landed. Commit hashes are the source of truth.

| Step | Status | Commit | Notes |
|---|---|---|---|
| **A. Selection store** (`useSyncExternalStore`, `selectedIds: Set<string>`, clipboard) | ✅ shipped | `f0a63cf` (X1) | `src/components/drce/editor/selectionStore.ts` |
| **B. `SelectionLayer` + section drag/8-handle resize** | ✅ shipped | `0d4616a` (X2) | Writes `style.position='absolute'/left/top/width/height`; flow sections untouched. |
| **C. `ContextualToolbar`** | ✅ shipped | `f0a63cf` (X1) | Floats over selection via `data-drce-section-id`/`data-drce-shape-id` rect + ResizeObserver. |
| **D. Keyboard + clipboard** | ✅ shipped | `f0a63cf` (X1) | Del / Cmd+C / Cmd+V / Cmd+D / arrow nudge wired to selection store. |
| **E. `TypographyPopover`** | ✅ shipped | `f0a63cf` (X1) | Double-click text shape → family/size/weight/italic/align/color/bg. |
| **F. Bezier handle editing** | ✅ shipped | `f0a63cf` (X1) | IN/OUT handles on selected paths; Alt-drag breaks symmetry / extrudes new handle from anchor. |
| **G. Performance pass** | ✅ shipped | `647c406` (X3) | `React.memo` per section with reference-equality predicate; RAF-batched drag commits. |
| **H. New `DRCETableSection`** | ✅ shipped | `fbfc183` (X4) | Two-pass cell resolver, merged cells (`mergeRight`/`mergeDown`), totals row, contentEditable cells. Legacy `ResultsTableSection` unchanged. |
| **I. Formula evaluator** | ✅ shipped | `fbfc183` (X4) | `src/lib/drce/table/formula.ts` — A1 refs, A1:B5 ranges, `this.column`/`this.row`, SUM/AVG/MIN/MAX/COUNT/IF. |
| **J. `dataSource` binding for table** | ✅ shipped | `fbfc183` (X4) | `section.dataSource` resolves any context path (`subjects`, `results`, custom arrays) via `getByPath`. |

Hard guarantees held throughout: snapshot `meta.dataHash` unchanged for
existing reports; flow-rendered sections untouched; render pipeline still
a pure function of `(document, dataCtx, renderCtx)`.

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
