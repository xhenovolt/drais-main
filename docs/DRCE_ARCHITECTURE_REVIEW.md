# DRCE — Architectural Review & Rebuild Roadmap

> Investigation-only. Captures the root causes of DRCE's rigidity and proposes a
> phased rebuild. No code changes proposed here. The render-layer determinism
> contract in [src/lib/drce/RENDER_LAYERS.md](../src/lib/drce/RENDER_LAYERS.md)
> is non-negotiable across every option below — any rebuild must preserve
> byte-identical regeneration of existing snapshots.

---

## 1. What was investigated

| Layer | Source of truth |
|---|---|
| DB storage | `dvcf_documents` (one row = one whole DRCEDocument JSON blob in `schema_json LONGTEXT`) |
| Schema | [src/lib/drce/schema.ts](../src/lib/drce/schema.ts) (721 lines) — `DRCEDocument = { meta, theme, watermark, sections[], shapes[], commentRules?, teacherMappings? }` |
| Registry | [src/lib/drce/registry.ts](../src/lib/drce/registry.ts) (closed `TemplateCategory` ENUM + closed renderer set: `drce` \| `emergency_html`) |
| Mutations | [src/lib/drce/mutations.ts](../src/lib/drce/mutations.ts) — closed switch over 24 mutation actions |
| Binding | [src/lib/drce/bindingResolver.ts](../src/lib/drce/bindingResolver.ts) (dot-path) + [tokenResolver.ts](../src/lib/drce/tokenResolver.ts) (`{path}` token) — **two resolvers**, hardcoded roots, no extension point |
| Renderer | [DRCEDocumentRenderer.tsx](../src/components/drce/DRCEDocumentRenderer.tsx) — `switch (section.type)` over 11 fixed cases |
| Sections | 11 hardcoded React components under `src/components/drce/sections/` |
| Shapes | One SVG overlay (`ShapeCanvas.tsx`, 572 lines) — 5 shape types, geometry-only |
| Print | [print-renderer.ts](../src/lib/drce/print-renderer.ts) — `renderToStaticMarkup` of the same renderer |
| Term inference | None. `nextTermBegins` is a string field on the snapshot, baked at generation in `snapshots/grader.ts:buildDefaultConfig` |

---

## 2. Root causes — why DRCE feels rigid

### 2.1 The document model has two disjoint composition systems

```
sections[]  →  typed, semantic, data-bound, FLOW-stacked (no x/y)
shapes[]    →  dumb, untyped, ABSOLUTELY positioned (x/y/w/h)
```

These layers do not compose:

- A shape cannot **contain** a section (no nesting). You can't draw an arrow
  shape around a results table, because the shape can't host children.
- A section cannot be **placed** inside a shape, group, or 2-column container.
- Two sections cannot live **side by side** — sections render top-to-bottom in
  `order`. There is no flex/grid row primitive in the document tree.
- Shapes are **geometry-only**: `DRCETextShape.content` is a literal string;
  `{student.name}` inside a shape would print literally. Shapes carry no data.

Consequence: any layout that needs "a shape that holds a table" or "two
columns of fields" hits a hard wall. There is no concept of a *layout
container* with arbitrary children.

### 2.2 Sections are a closed enum

`DRCESectionType` is one of 11 string literals. Adding a new section type
requires editing **seven** locations in lockstep:

1. `schema.ts` — union + discriminated interface + style type
2. `mutations.ts` — handlers for any mutation that touches it
3. `defaults.ts` / `builtin-resolver.ts` — default instances
4. `DRCEDocumentRenderer.tsx` — `switch` case
5. `sections/<Name>Section.tsx` — renderer component
6. `editor/SectionListPanel.tsx` — palette entry + icon + default object
7. `editor/PropertiesPanel.tsx` — per-type property editor

There is **no registry pattern** that lets a feature (or a school) plug in a
new section type. Every "block" of a report is a first-class TypeScript
identity. This is the deepest source of the rigidity the user feels — DRCE is
*configurable*, not *composable*.

### 2.3 Header (and others) are component-slot maps, not trees

`DRCEHeaderStyle` accepts a `layout: 'three-column' | 'centered' | 'left-logo'
| 'flex-grid' | 'custom'` plus seven typed slots (`logoStyle`, `nameStyle`,
`arabicNameStyle`, `addressStyle`, `contactStyle`, `centreNoStyle`,
`registrationNoStyle`) with toggle flags. Schools can:

- Re-style each slot.
- Show/hide each slot.
- Pick one of four layouts.

Schools **cannot**:

- Add a *new* component to the header (e.g. founder's photo, verification QR,
  motto in three languages, KCSE registration sub-header).
- Reorder slots independently of the layout.
- Group two slots into a sub-container with its own border/background.

The header is a slot map, not a tree. So is `student_info` (a list of fixed
field types). This explains why "schools cannot fully define report identity"
above a styling level.

### 2.4 Placeholders are two resolvers with two hardcoded roots

There are **two** resolution paths:

- `resolveBinding('result.grade', ctx, row)` — used by table columns / form
  fields. Root: `{ student, subjects, assessment, comments, meta, result }`.
- `resolveToken('Issued for {student.fullName}', ctx)` — used by Banner /
  ribbon / arbitrary text. Root: `{ student, assessment, comments, meta }`
  (note: **omits** `result` and `subjects`).

Issues:

- **Two roots that disagree.** `{result.grade}` works as a column binding but
  silently prints literally in a banner. Same `{subjects[0].name}` works
  nowhere.
- **No extension point.** To add `{school.address}` (already present in
  `meta`), `{custom_school_field}`, or `{subject_position_math}`, the
  resolver root must be edited in code.
- **No expressions.** No `{if attendance > 80}Outstanding{/if}`, no
  `{format(fee_balance, "UGX,##0")}`, no `{round(avg, 1)}`.
- **No computed registry.** There is no place to register a named computed
  field that derives from snapshot data + context.

This is why "schools cannot freely attach dynamic data" — the binding language
is two hardcoded keyword paths.

### 2.5 `next_term_begins` is a section type, not a computed field

The value flows like this:

```
snapshot generation
  → buildDefaultConfig(nextTermBegins)  // string passed in by caller
  → snapshot.config.nextTermBegins      // baked into the snapshot
  → dataCtx.meta.nextTermBegins         // read at render
  → <NextTermBeginsSection nextTermBegins=... />
```

There is no academic-calendar inference. Nobody looks at `terms` /
`academic_years` to compute "the term after Term 2 of 2026 is Term 3 of 2026;
the term after Term 3 of 2026 is Term 1 of 2027." The string the caller
provided wins. The section's `content.customDate` can override per-document
but is also user-typed.

This is exactly the user's "primitive" complaint. The fix is not a bigger
text field — it's a **computed-field registry** that observes the academic
calendar and produces a value DRCE can bind to.

### 2.6 Custom shapes "collapse into rectangles" — they don't, but the polygon set is finite

The shape canvas supports `rect | ellipse | line | arrow | text | triangle |
diamond | pentagon | hexagon | star`. That's the universe. There is no:

- Free-form path / bezier authoring.
- SVG import (paste a `<path d="..."/>` and use it).
- Ribbon-as-shape (the ribbon section computes its own SVG from typed style
  knobs — chevron depth, tail depth, etc. — and only the section can be a
  ribbon).
- Shape grouping or shape-with-children.

So a school's *bespoke* crest swoosh or curved divider cannot be authored. It
either becomes a polygon preset or is uploaded as an image. The "collapses
into a rectangle" symptom usually means the user added a `rect` thinking it
would acquire a custom outline; it stayed a rect because that's all `rect`
can be.

### 2.7 Storage is a single LONGTEXT blob — no row-level granularity

`dvcf_documents.schema_json` is the **whole** document. Implications:

- No partial updates: every mutation re-writes the full blob.
- No per-section history: undo lives in the editor session only; once saved,
  prior versions are gone.
- No referential integrity from sections/shapes to anything else.
- No way to share a "block" (header config, comment-rule set) between
  templates — copy-paste only.
- `version: integer` exists but there is no `dvcf_document_versions` history
  table. Rollback = pray.

### 2.8 Editor and renderer share rendering, but shapes drift

Both the editor preview and `/print` use `DRCEDocumentRenderer`. Shapes are
overlaid via `ShapeCanvas` positioned absolutely over the document area. The
section flow's height depends on:

- Font metrics in the runtime (browser vs. Node's `renderToStaticMarkup` →
  identical at the React level, but the *visual* layout depends on the
  printing engine).
- Override-driven hidden subjects shrinking a results table.
- Snapshot data length (long student names, long teacher comments).

Because shapes are absolute and sections are flow, **shapes never reflow with
sections**. Saving changes section heights → shapes appear to "drift." This
is structural, not a bug to patch.

### 2.9 No expression / scripting layer

- `commentRules` is the only conditional logic — score range → comment text.
  It's hardcoded to one input (average score) and three outputs (class
  teacher / DOS / head teacher comments).
- There are no conditionals at the section, column, or token level.
- No formatters: dates render as strings the caller provided; numbers render
  raw.
- No subject-position binding — it's pre-computed at snapshot time and
  baked. Recomputing or selecting "position within stream only" requires
  regenerating the snapshot.

### 2.10 The "next_term_begins" / "this term ends" knowledge gap is institutional

DRAIS already has the entities (`academic_years`, `terms`) and computes term
boundaries for attendance and admissions. The DRCE pipeline doesn't consume
them. The fix isn't in DRCE alone — it's an **academic-calendar service**
exposing inference (`nextTerm(currentTerm) → Term`, `yearRollover(term) →
boolean`) consumed by both DRCE *and* by other modules (deadlines,
admissions, fee schedules). Building it inside DRCE re-couples the engine to
the calendar.

---

## 3. What rigidity each root cause produces (cross-reference)

| User-reported symptom | Root cause |
|---|---|
| "Custom ribbons/arrows/shapes collapse into rectangles" | §2.1, §2.6 |
| "Layouts cannot be freely composed" | §2.1, §2.2 |
| "Schools cannot reposition header structures" | §2.3 |
| "Bilingual/multi-column headers difficult" | §2.3 |
| "Placeholders are shallow/static" | §2.4, §2.5 |
| "Report structures assume predefined layouts" | §2.1, §2.2 |
| "Drag-and-drop freedom is limited" | §2.1 (flow sections + overlay shapes don't compose) |
| "Customizations visually change after save/render" | §2.8 (shapes drift relative to flow) |
| "Reports tightly coupled to DB assumptions" | §2.4 (closed resolver roots) |
| "Academic computed logic is primitive" | §2.9, §2.10 |

---

## 4. What to keep (and not rewrite)

These pieces work and should be preserved through any rebuild:

1. **Render-layer determinism** ([RENDER_LAYERS.md](../src/lib/drce/RENDER_LAYERS.md)).
   The five-layer purity model is correct. Any rebuild slots into layer 1
   (document) and layer 5 (renderer); layers 2–4 (snapshot, data, overrides)
   stay.
2. **Override system** — snapshot-bound, school-scoped, additive. Keep
   verbatim.
3. **Snapshot-as-source-of-truth** — academic data immutable through render.
4. **Print renderer = same component as preview.** No second pipeline.
5. **`dvcf_documents` row-per-template** — the granularity is right; only the
   blob inside needs to change.
6. **Override + emergency-html dual rendering** — emergency HTML stays the
   compatibility floor. New work lives in DRCE; emergency is a frozen
   fallback.

---

## 5. Rebuild roadmap — phased, additive, backward-compatible

Every phase ships an incremental capability without breaking existing
templates. `$schema: 'drce/v1'` continues to render through the existing
renderer; new capabilities live behind `$schema: 'drce/v2'` opt-in until
parity is reached.

### Phase A — Computed-field registry (lowest risk, highest immediate value)

**Goal:** make "next term begins" and friends *correct* without changing the
document model.

- New module `src/lib/drce/computed/`:
  - `registry`: a map of `name → (ctx) => string | number | Date`.
  - Built-in entries: `next_term_begins`, `this_term_ends`, `attendance_pct`,
    `subject_position_<id>`, `fee_balance`, `grade_for(score)`, etc.
- New unified resolver `resolveExpression(expr, ctx)` replaces both
  `resolveBinding` and `resolveToken`. Expression grammar:
  ```
  {student.fullName}            # path
  {next_term_begins}            # computed
  {next_term_begins | date:"D MMM YYYY"}   # formatter pipe
  {if attendance_pct > 80 then "Outstanding" else "Keep working"}
  ```
- Computed fields are **pure** functions of `ctx`. They never query the DB.
  Inputs that need the calendar are precomputed into `ctx.meta.calendar` at
  snapshot generation (see Phase B).
- Old `{path}` tokens continue to work; the new resolver is a strict
  superset.

**Risk:** LOW. Additive resolver, no schema change.
**Snapshot determinism:** preserved — computed fields are deterministic in
`ctx`.
**Compatibility:** every existing document continues to render unchanged.

### Phase B — Academic-calendar service

**Goal:** kill the "primitive next-term" complaint at the source, and serve
the rest of DRAIS too.

- `src/lib/calendar/`: pure inference functions over `academic_years` /
  `terms`:
  - `nextTerm(termId): Term | null`
  - `prevTerm(termId): Term | null`
  - `termBoundaries(termId): { startDate, endDate }`
  - `inferNextTermStart(termId, schoolOverrides?): Date | null`
- Snapshot generator calls these and writes the result into
  `snapshot.meta.calendar = { currentTerm, nextTerm, nextTermStartsAt,
  thisTermEndsAt, yearRollover }`.
- DRCE expressions resolve `{next_term_begins}` via the computed registry,
  reading from `meta.calendar`.
- Other modules (deadlines, admissions, fee schedules) consume the same
  service. **One source of academic truth.**

**Risk:** LOW. Read-only inference. Existing `nextTermBegins` string field
on snapshots stays as a fallback.

### Phase C — Layout containers (the composition pivot)

**Goal:** end the flow-vs-overlay split. Introduce one tree, not two layers.

- Introduce `DRCEContainer` — a generic section that holds an ordered list of
  children (sections OR other containers). Layout modes: `stack` (vertical
  flow, today's behavior), `row` (horizontal flex), `grid` (CSS grid with
  template-areas), `absolute` (free positioning of children).
- Migrate the existing 11 section types to be children of a top-level
  `stack` container. **Existing documents render identically** — the top
  level is implicitly a `stack`.
- `shapes[]` becomes the `absolute` mode of a container. A shape is no
  longer a separate layer; it is a child node. Shapes can now host children
  (`<container layout="absolute"><results_table/></container>` ⇒ a table
  inside a free-positioned box).
- Editor: drag-drop is now tree-based (drop into a container). The split
  between "section list" and "shape canvas" disappears.

**Risk:** HIGH (the deepest rebuild). Snapshot determinism preserved by an
explicit migration step: old `{sections[], shapes[]}` documents are
transformed at load time into a `root: Container` tree. Old saves continue
to land in the old shape; new saves use the new shape behind `$schema:
'drce/v2'`.

**Migration:** code-only at first. Schools opt their templates into v2 by
re-saving in the editor; v1 keeps working.

### Phase D — Section plugin registry

**Goal:** schools, or future Xhenvolt modules (tahfiz, finance), can register
new section types without editing the 7 lockstep files.

- Section interface:
  ```ts
  interface DRCESectionPlugin {
    type:        string;              // 'tahfiz_juz_progress'
    label:       string;
    icon:        string;
    defaultProps: () => unknown;
    Render:      (props, ctx) => JSX.Element;
    PropertiesPanel: (props, onChange) => JSX.Element;
    serialize:   (props) => unknown;
    deserialize: (raw) => unknown;
  }
  registerSection(plugin: DRCESectionPlugin)
  ```
- `renderSection` becomes `registry.get(section.type).Render(section, ctx)`.
- The 11 existing types are migrated to plugins, no behaviour change.
- Tahfiz module ships its own sections (juz progress, hifdh chain) without
  touching the engine.

**Risk:** MEDIUM. Mostly mechanical refactor. Snapshot determinism preserved.

### Phase E — Header → composable block

**Goal:** retire the slot map. The header becomes a Container whose children
are individual blocks (logo, school name, motto, QR, registration row,
multi-language name, …) — each itself a section plugin.

- Old `DRCEHeaderSection` becomes a *preset* — a container with a known set
  of children for backward compatibility.
- New documents author headers freely: any number of children, arbitrary
  layout (`row` / `grid` / `absolute`), per-child style.
- Bilingual / multi-column headers become trivial (two columns in a `row`
  container).

**Risk:** MEDIUM. Mostly a refactor of one section type; depends on C+D.

### Phase F — Storage with row-level granularity

**Goal:** no more single LONGTEXT blob.

- New tables:
  ```
  drce_documents      (id, school_id, name, meta_json, theme_json, ...)
  drce_nodes          (id, document_id, parent_id, order, type, props_json)
  drce_document_versions (id, document_id, version, author, created_at, snapshot_json)
  ```
- A document is one root row + N node rows. Mutations target individual
  nodes. Versions are first-class — every save snapshots the tree.
- Render assembles the tree at load time; cached in memory after first
  build.
- Backward compat: `dvcf_documents` keeps working as a read-only fallback;
  new saves go to `drce_documents`. A one-shot migration converts existing
  v1 blobs into the new tables.

**Risk:** MEDIUM. Touches storage, but additive — both stores coexist.

### Phase G — Expression / scripting layer

**Goal:** real conditionals, formatters, computed cells.

- Extend Phase A's expression grammar with:
  - `if … then … else …`
  - Formatters as pipes: `| date:"D MMM YYYY"`, `| number:"#,##0.00"`,
    `| upper`, `| coalesce:"—"`.
  - Aggregations: `sum(results, "score")`, `count(subjects, "passed")`.
- Tooling: a sandboxed expression preview pane in the editor.
- Determinism: expressions are pure. No side effects, no I/O.

**Risk:** MEDIUM. Big surface, but isolated to the resolver.

### Phase H — Template inheritance & shared blocks

**Goal:** schools build a base template; per-class / per-term children
inherit + override.

- `drce_documents.parent_id` — child documents merge over parent at load.
- Block library: a `drce_blocks` table of reusable container subtrees
  (headers, footers, comment rule sets) referenced by `block_ref` nodes.
- Editor surfaces both ("derived from base" badge, "uses shared block
  X" indicator).

**Risk:** MEDIUM. Depends on F.

---

## 6. Execution order

```
A (computed registry) ─┐
                       ├─► everything below depends on a unified resolver
B (calendar service) ──┘

D (section plugins) ─► E (header rebuild)

C (containers / v2 schema) ─► F (storage v2) ─► H (inheritance)

G (expression layer) sits on top of A; can ship any time after A
```

Recommended sequence to ship value while managing risk:

1. **A + B** together — closes the "primitive next term" complaint and
   unifies placeholders. Two phases, both LOW risk.
2. **D** — refactor existing sections into plugins. No new feature; sets up
   E and external module sections.
3. **C** — the composition pivot. The hardest single phase. Ship behind
   `drce/v2` so old templates are untouched.
4. **E** — first big user-visible win on C+D (header freedom).
5. **F** — storage cutover after C/D/E have soaked.
6. **G** — expressions / conditionals.
7. **H** — inheritance / shared blocks.

---

## 7. Compatibility & determinism guarantees

These hold for every phase:

- Existing `$schema: 'drce/v1'` documents render byte-identically after any
  phase ships. Verified by the existing snapshot-regeneration hash test
  (see RENDER_LAYERS.md §"Hard invariants" #2).
- Existing `report_snapshots` rows render byte-identically — no phase
  modifies snapshot generation except B (adding `meta.calendar`), which is
  additive and behind a snapshot version bump.
- Override semantics unchanged. The override layer continues to apply to
  the document tree regardless of v1 or v2 shape.
- Emergency HTML templates unchanged. They are the floor; DRCE evolves
  above them.

---

## 8. What we are NOT doing

- **No more rigid templates.** Every "Northgate emergency" / "Albayan
  emergency" style addition is hardcoded today and should be retired in
  favor of containers + blocks, not multiplied.
- **No hardcoding of new placeholders.** Once Phase A ships, new
  computeds register; the resolver does not change.
- **No bypassing the render layer contract.** No `Date.now()` in render,
  no DB reads, no tenant lookups. The determinism guarantee is the
  product.
- **No second editor.** The existing editor evolves; we don't fork a
  separate "DRCE 2" editor.
- **No second rendering pipeline.** Print and preview use the same
  renderer, forever.

---

## 9. Open questions the operator must answer before A ships

1. **Calendar precedence.** When a school has a manual `nextTermBegins`
   string AND the calendar service computes a different date, which wins?
   Recommendation: school override wins (explicit > inferred), but the
   inferred value is exposed under `{next_term_begins_inferred}` so
   schools can compare.
2. **Expression language scope.** Should the expression language allow
   *arbitrary* arithmetic, or only the formatter/conditional set listed in
   Phase G? Recommendation: start with the closed set; arbitrary
   arithmetic is a security and determinism risk (sandboxing required).
3. **Document versions cap.** How many historic versions per template do
   we keep (Phase F)? Recommendation: last 50 + every "published" version
   indefinitely.
4. **Block sharing scope.** Are shared blocks per-school or
   cross-tenant? Recommendation: per-school only at first; cross-tenant
   sharing is a JETON-platform concern, not DRAIS.

---

## 10. Verdict

DRCE today is configurable. It is not composable. The two-layer split
(typed flow sections + dumb overlay shapes), the closed section enum, the
two inconsistent resolvers, the absence of a computed-field registry, and
the lack of academic-calendar inference are the load-bearing causes — not
UI polish issues.

The rebuild is **achievable incrementally without breaking determinism**.
The order that maximizes value per risk is **A → B → D → C → E → F → G →
H**. Total work is large; the first two phases (A + B) deliver the most
visible "primitive next term" / "shallow placeholders" fixes for the
least architectural cost and unlock the rest.
