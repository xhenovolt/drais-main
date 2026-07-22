# DRAIS Report Composition Engine (DRCE)
## Full System Audit, Gap Analysis & Redesign Architecture
      
---   
   
## PHASE 1 — DEEP SYSTEM ANALYSIS

---

### 1.1 ID Card Generator — Reference System Reverse Engineering

#### What It Is

The ID Card Generator (`src/app/students/id-cards/page.tsx`) is the most powerful visual composition tool currently in DRAIS. It transforms a single flat config object into a pixel-accurate, print-safe ISO ID-1 card in real time.

#### Layout Architecture

The system uses a **single flat configuration object** (`IDCardConfig`, 26 keys) as its sole source of truth. Every visual property — background color, accent color, text color, font size, border radius, field visibility, footer text, watermark flag — is a first-class key in this object.

```
IDCardConfig (flat, 26 keys)
├── bgColor / accentColor / textColor / labelColor
├── footerBgColor / footerTextColor
├── fontSize / fontWeight / fontFamily
├── borderRadius / borderWidth / borderColor
├── showDob / showGender / showClass / showAdmissionNo
├── showSignatureLine / showFooter / footerText
├── schoolLogoUrl
└── showWatermark / watermarkText
```

There are **no nested sections** in the schema. It is completely flat. This is the key to its simplicity and speed.

#### Rendering Pipeline

```
IDCardConfig (state) ──► IDCardPreview (React component)
                                │
                    ┌───────────▼────────────┐
                    │  Inline CSS computed    │
                    │  from config props      │
                    │  mm-unit card layout    │
                    │  ISO ID-1: 85.6×54mm    │
                    └───────────┬────────────┘
                                │
                    sessionStorage(config + ids)
                                │
                    /id-cards/print ──► N cards, @media print safe
```

Every single field change triggers a synchronous React re-render — no debounce, no intermediate state. The `set(key, value)` helper is a generic keyed updater:

```typescript
const set = <K extends keyof IDCardConfig>(key: K, value: IDCardConfig[K]) => {
  setConfig(prev => ({ ...prev, [key]: value }));
};
```

This is architecturally clean: `IDCardPreview` is a **pure function of `(config, student, meta)`**.

#### Template System

The DB table `id_card_templates` stores `config_json` (one active per school). On load, the active config is fetched and merged with `DEFAULT_ID_CARD_CONFIG` to fill any gaps. On save, the merged config is persisted. There is no versioning.

**Template = config snapshot. Loading = merge with defaults. Saving = full replace.**

#### Editing Model

The editor has **4 collapsible sections**: Colours | Typography | Fields | Images.

Every control directly mutates `config`:
- Color pickers → set 6 color keys
- Range sliders → set fontSize, fontWeight, borderRadius
- Toggle rows → set boolean show* keys
- Text input → footerText

The **8 preset palettes** are a one-click shortcut that simultaneously sets 4 color keys. This is the `applyPalette()` function.

#### What Makes It Powerful

1. **Flat schema** — no nesting means every property is directly editable without traversal logic
2. **Pure rendering component** — `IDCardPreview` has zero internal state; it is a pure function of props
3. **Synchronous live update** — no debouncing, no batching; edit → render is instantaneous
4. **Print pipeline** — sessionStorage bridge decouples editor from print page; print page reads config and renders N cards with `@media print`
5. **Single source of truth** — `DEFAULT_ID_CARD_CONFIG` in `src/lib/idCardConfig.ts` is the canonical reference for all defaults

#### What It Cannot Do

- Add/remove fields dynamically (field list is hardcoded)
- Reorder sections
- Manage multiple students per template (solved via separate print page)
- Multi-page layouts
- Section-specific watermarking

---

### 1.2 Reports Kitchen — Problem System Deconstruction

#### What It Is

The Reports Kitchen (`src/app/reports/kitchen/page.tsx`) is a **template management dashboard**, not a report editor. It shows a grid of template cards, allows switching the active template, duplicating templates, and changing the accent color — nothing else.

#### Template Structure

`ReportTemplate.layout_json` is typed as `ReportLayoutJSON` — a deeply nested object with ~15 top-level sections:

```
ReportLayoutJSON (deeply nested, ~15 sections, ~80 properties)
├── page { background, boxShadow, padding, borderRadius, fontSize, fontFamily }
├── header { layout, paddingBottom, opacity, borderBottom }
├── banner { backgroundColor, color, fontSize, fontWeight, padding, … }
├── ribbon { background, color, fontWeight, fontSize, … }
├── studentInfoBox { border, borderRadius, padding, … }
├── studentInfoContainer { flexDirection, borderBottom, fontSize }
├── studentValue { color, fontStyle, fontWeight }
├── table { fontSize, borderCollapse,
│     th: { background, border, padding, textAlign, color }
│     td: { border, padding, textAlign, color } }
├── assessmentBox { border, borderRadius, padding }
├── comments { borderTop, paddingTop, marginTop,
│     ribbon: { background, color, borderRadius, padding }
│     text: { color, fontStyle, borderBottom } }
├── gradeTable { th: {…}, td: {…} }
└── pageBorder { enabled, color, width, radius, style }
   (+ V2 embryonic: sections?: SectionConfig[] — not wired to editor)
```

This schema has **~80 editable properties** none of which are exposed in the UI.

#### What The Kitchen Can Actually Do

| Action | Available |
|--------|-----------|
| View template mini-preview | ✅ |
| Switch active template | ✅ |
| Duplicate a template | ✅ |
| Delete a custom template | ✅ |
| Change banner accent color | ✅ (live, debounced save) |
| Change any other color | ❌ |
| Change any font size | ❌ |
| Rename column headers | ❌ |
| Add/remove table columns | ❌ |
| Reorder sections | ❌ |
| Toggle section visibility | ❌ |
| Edit student info fields | ❌ |
| Add watermark | ❌ |
| Preview full-size before activating | ✅ (click thumbnail expands) |
| JSON editor (escape hatch) | ❌ (no UI) |

**The user can change exactly 1 of ~80 properties.**

#### Architectural Weaknesses (Exact)

**W1: No editor component exists.**
The `ReportLayoutJSON` schema is richly defined but there is no UI to mutate it beyond the single accent color picker. The schema was designed in anticipation of a full editor that was never built.

**W2: Template = dead JSON blob.**
When a user creates a new template, the code literally copies `base.layout_json` and saves it verbatim:
```typescript
const base = templates.find(t => t.id === 1) || templates[0];
body: JSON.stringify({ name, layout_json: base.layout_json })
```
The new template is not a derived object or schema instance — it is a raw JSON clone. There is no schema version field, no migration path.

**W3: `RptTemplatePreview` is hardcoded static HTML.**
The Northgate Classic preview is a React component with completely hardcoded student data, fixed column names (`['Subject', 'EOT', 'Total', 'Grade', 'Comment', 'Initials']`), and fixed SVG ribbons. Changing `layout_json` has zero effect on this component — only `accentColor` is wired. The preview is **theatrical**, not functional.

**W4: Table columns are hardcoded in `TemplatePreview`.**
```typescript
{['SUBJECT', 'MT', 'EOT', 'GRADE', 'COMMENT', 'INIT'].map(h => ...)}
```
Column headers are string literals. There is no schema key that drives them. You cannot rename, reorder, add, or remove columns without changing TypeScript source code.

**W5: Section ordering is declared but not rendered.**
`ReportLayoutJSON.sections?: SectionConfig[]` and `DEFAULT_SECTIONS` and `SECTION_REGISTRY` exist in `reportTemplates.ts` — but `TemplatePreview` ignores them. Sections are always rendered in the hardcoded JSX order. The V2 section system was designed but never connected.

**W6: No diff/patch system.**
When saving an accent color change, the code reconstructs the entire `layout_json`:
```typescript
const updated = {
  ...template.layout_json,
  banner: { ...template.layout_json.banner, backgroundColor: color },
};
await fetch(`/api/report-templates/${id}`, {
  body: JSON.stringify({ name, description, layout_json: updated }),
});
```
Every property-level change triggers a full document PUT. There is no patch semantics, no audit trail, no undo.

**W7: No watermark layer.**
`IDCardConfig` has `showWatermark` and `watermarkText`. `ReportLayoutJSON` has no watermark concept at all.

**W8: No per-section style isolation.**
Every style property in `ReportLayoutJSON` applies globally to that section type. You cannot have two differently styled ribbons. You cannot override table header color for one table but not another.

**W9: `TemplateRenderer.tsx` is for dashboards, not report cards.**
`src/components/reports/TemplateRenderer.tsx` renders bar charts, pie charts, and KPI cards using Recharts. It is a completely different system (analytics dashboards) and is falsely named — it has nothing to do with the report template system used in the Kitchen.

---

## PHASE 2 — GAP ANALYSIS

### Feature Parity Table

| Capability | ID Card Generator | Reports Kitchen |
|------------|:-----------------:|:---------------:|
| Live preview (instant re-render) | ✅ Full | ✅ Accent color only |
| Flat editable config | ✅ 26 props | ❌ 1 prop exposed |
| Color control | ✅ 6 colors + presets | ✅ 1 color (banner) |
| Typography control | ✅ Size + weight | ❌ None |
| Field visibility toggles | ✅ 6 toggles | ❌ None |
| Layout presets | ✅ 8 palettes | ❌ None |
| Add/remove fields | ❌ | ❌ |
| Column definition (table) | N/A | ❌ Hardcoded |
| Section reordering | N/A | ❌ Designed, not wired |
| Section visibility toggle | N/A | ❌ Designed, not wired |
| Watermark | ✅ Toggle + text | ❌ Not designed |
| Print pipeline | ✅ Dedicated page | ✅ Northgate only |
| Template versioning | ❌ | ❌ |
| Undo/redo | ❌ | ❌ |
| JSON escape hatch | ❌ | ❌ |
| Per-component style override | ❌ | ❌ |
| Data binding model | ✅ Props | ✅ Partial (fixed binding) |
| Multi-template management | ❌ | ✅ Grid + activate |

### Architecture Mismatch

| Layer | ID Card | Reports Kitchen |
|-------|---------|-----------------|
| Schema | Flat key-value (26 keys) | Nested object (~80 props) |
| Editor | Full control panel | Accent color only |
| Renderer | Pure functional component | Mixed JSX with hardcoded structure |
| State | Single useState, generic setter | Multiple useStates, no generic mutation |
| Save | Full replace | Full replace |
| Print | Dedicated route via sessionStorage | Custom per-template (Northgate only) |
| Versioning | None | None |

### Critical Gap: The Missing Abstraction Layer

The ID Card system works because its schema is **flat and directly maps to UI controls**. One key → one input → one rendered property.

The Reports Kitchen schema is **deeply nested but unmapped** — there is no UI-to-schema binding for any property except `banner.backgroundColor`. The schema exists purely for the `TemplatePreview` rendering function, with no round-trip editing path.

What is missing is a **schema-to-controls mapping layer** — a registry that declares: "this path in the schema maps to this type of control with these constraints."

---

## PHASE 3 — TARGET ARCHITECTURE: DRAIS Report Composition Engine (DRCE)

### 3.1 Core Concept

**Reports are not templates. Reports are living schema-driven document objects.**

A DRCE document is a JSON tree where:
- The document has metadata (school, academic year, term, type)
- The document has an ordered array of **sections**
- Each section has a **type**, **style block**, and **content descriptor**
- Tables have an ordered array of **column definitions**
- Every node is independently addressable by path
- Every node's style can be overridden independently

### 3.2 The DRCE Schema

```json
{
  "$schema": "drce/v1",
  "meta": {
    "id": "uuid",
    "name": "Northgate End of Term Report",
    "school_id": 42,
    "version": 1,
    "created_at": "2026-04-19T00:00:00Z",
    "updated_at": "2026-04-19T00:00:00Z",
    "report_type": "end_of_term",
    "is_default": false
  },
  "theme": {
    "primaryColor":    "#0000FF",
    "secondaryColor":  "#B22222",
    "accentColor":     "#999999",
    "fontFamily":      "Arial, sans-serif",
    "baseFontSize":    12,
    "pagePadding":     "16px 18px",
    "pageBackground":  "#ffffff",
    "pageBorder": {
      "enabled": false,
      "color":   "#cccccc",
      "width":   1,
      "style":   "solid",
      "radius":  0
    }
  },
  "watermark": {
    "enabled":    false,
    "type":       "text",
    "content":    "CONFIDENTIAL",
    "imageUrl":   null,
    "opacity":    0.08,
    "position":   "center",
    "rotation":   -30,
    "fontSize":   72,
    "color":      "#000000",
    "scope":      "page"
  },
  "sections": [
    {
      "id":      "section-header",
      "type":    "header",
      "visible": true,
      "order":   0,
      "style": {
        "layout":       "three-column",
        "paddingBottom": 10,
        "borderBottom": "1px solid #eee"
      }
    },
    {
      "id":      "section-banner",
      "type":    "banner",
      "visible": true,
      "order":   1,
      "content": {
        "text": "{reportTitle}"
      },
      "style": {
        "backgroundColor": "#0000FF",
        "color":           "#ffffff",
        "fontSize":        16,
        "fontWeight":      "bold",
        "textAlign":       "center",
        "padding":         "8px",
        "letterSpacing":   "0.1em",
        "textTransform":   "uppercase",
        "borderRadius":    0
      }
    },
    {
      "id":      "section-student-info",
      "type":    "student_info",
      "visible": true,
      "order":   2,
      "fields": [
        { "id": "f-name",      "label": "Name",        "binding": "student.fullName",   "visible": true, "order": 0 },
        { "id": "f-gender",    "label": "Sex",         "binding": "student.gender",     "visible": true, "order": 1 },
        { "id": "f-class",     "label": "Class",       "binding": "student.className",  "visible": true, "order": 2 },
        { "id": "f-stream",    "label": "Stream",      "binding": "student.streamName", "visible": true, "order": 3 },
        { "id": "f-admno",     "label": "Student No.", "binding": "student.admissionNo","visible": true, "order": 4 },
        { "id": "f-term",      "label": "Term",        "binding": "meta.term",          "visible": true, "order": 5 }
      ],
      "style": {
        "border":       "1px dashed #999",
        "borderRadius": 0,
        "padding":      "8px",
        "background":   "#ffffff",
        "labelColor":   "#555555",
        "valueColor":   "#B22222",
        "valueFontWeight": "bold",
        "valueFontSize":   14
      }
    },
    {
      "id":      "section-ribbon-1",
      "type":    "ribbon",
      "visible": true,
      "order":   3,
      "content": {
        "text": "Principal Subjects Comprising the General Assessment",
        "shape": "arrow-down"
      },
      "style": {
        "background":    "#999999",
        "color":         "#000000",
        "fontWeight":    "bold",
        "fontSize":      12,
        "padding":       "4px 0",
        "textAlign":     "center"
      }
    },
    {
      "id":      "section-results-table",
      "type":    "results_table",
      "visible": true,
      "order":   4,
      "columns": [
        { "id": "col-subject",  "header": "Subject",  "binding": "result.subjectName",  "width": "25%", "visible": true, "order": 0, "align": "left"   },
        { "id": "col-eot",      "header": "EOT",      "binding": "result.endTermScore", "width": "8%",  "visible": true, "order": 1, "align": "center" },
        { "id": "col-total",    "header": "Total",    "binding": "result.total",        "width": "8%",  "visible": true, "order": 2, "align": "center" },
        { "id": "col-grade",    "header": "Grade",    "binding": "result.grade",        "width": "8%",  "visible": true, "order": 3, "align": "center", "style": { "color": "#B22222" } },
        { "id": "col-comment",  "header": "Comment",  "binding": "result.comment",      "width": "35%", "visible": true, "order": 4, "align": "left",   "style": { "fontStyle": "italic", "color": "#0000FF" } },
        { "id": "col-initials", "header": "Initials", "binding": "result.initials",     "width": "8%",  "visible": true, "order": 5, "align": "center", "style": { "color": "#0000FF", "fontWeight": "bold" } }
      ],
      "style": {
        "headerBackground": "#f2f2f2",
        "headerBorder":     "1px solid #333",
        "rowBorder":        "1px solid #333",
        "headerFontSize":   11,
        "rowFontSize":      11,
        "headerTextTransform": "uppercase",
        "padding":          4
      }
    },
    {
      "id":      "section-assessment",
      "type":    "assessment",
      "visible": true,
      "order":   5,
      "fields": [
        { "id": "a-class-pos",  "label": "Class Position",  "binding": "assessment.classPosition",  "visible": true },
        { "id": "a-stream-pos", "label": "Stream Position", "binding": "assessment.streamPosition", "visible": true },
        { "id": "a-aggregates", "label": "Aggregates",      "binding": "assessment.aggregates",     "visible": true },
        { "id": "a-division",   "label": "Division",        "binding": "assessment.division",       "visible": true }
      ],
      "style": {}
    },
    {
      "id":      "section-comments",
      "type":    "comments",
      "visible": true,
      "order":   6,
      "items": [
        { "id": "c-class",   "label": "Class teacher comment:", "binding": "comments.classTeacher",  "visible": true, "order": 0 },
        { "id": "c-dos",     "label": "DOS Comment:",           "binding": "comments.dos",           "visible": true, "order": 1 },
        { "id": "c-head",    "label": "Headteacher comment:",   "binding": "comments.headTeacher",   "visible": true, "order": 2 }
      ],
      "style": {
        "ribbonBackground": "#dddddd",
        "ribbonColor":      "#000000",
        "textColor":        "#0000FF",
        "textFontStyle":    "italic"
      }
    },
    {
      "id":      "section-grade-table",
      "type":    "grade_table",
      "visible": true,
      "order":   7,
      "style": {
        "headerBackground": "#f2f2f2",
        "border":           "1px solid #000"
      }
    }
  ]
}
```

### 3.3 Schema Design Principles

**P1: Everything is a section node with a type, order, visible, style, and content descriptor.**

**P2: Tables own their column definitions** — `columns` array on `results_table` sections drives all rendering. Adding a `midTerm` column is adding one entry to this array.

**P3: Style inheritance**: `theme.*` → section `style.*` → column `style.*`. More specific = higher priority.

**P4: Bindings are dot-path strings** resolved at render time against a data context:
```
"binding": "result.subjectName"  →  context.result.subjectName
"binding": "student.className"   →  context.student.className
"binding": "meta.term"           →  context.meta.term
```

**P5: Content text fields support `{token}` substitution**: `"text": "{reportTitle}"` → resolved from meta.

**P6: Every node has a stable `id`** used by the mutation system (undo/redo, diff).

---

### 3.4 Editing Engine Design

#### The Three-Panel Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: document name | theme picker | undo/redo | save/print  │
├──────────────┬─────────────────────────────┬────────────────────┤
│              │                             │                    │
│  STRUCTURE   │     LIVE PREVIEW            │  PROPERTY PANEL    │
│  PANEL       │     (full A4)               │  (context-aware)   │
│              │                             │                    │
│  Sections    │  ┌─── rendered document ──┐ │  (shows controls   │
│  ordered     │  │ [Header]               │ │   for the          │
│  list with   │  │ [Banner ▶ selected]    │ │   currently        │
│  drag handle │  │ [Student Info]         │ │   selected node)   │
│              │  │ [Ribbon]               │ │                    │
│  + Add       │  │ [Table]                │ │                    │
│    section   │  │   col1 col2 col3 ←drag │ │                    │
│              │  │ [Assessment]           │ │                    │
│  Eye toggle  │  │ [Comments]             │ │                    │
│  per section │  │ [Grade Table]          │ │                    │
│              │  └────────────────────────┘ │                    │
└──────────────┴─────────────────────────────┴────────────────────┘
```

#### Structure Panel

- Ordered list of all section nodes
- Drag handle (dnd-kit) for reorder
- Eye icon to toggle `visible`
- Trash icon to delete (with undo)
- `+ Add Section` button opens a picker modal showing all available section types
- Clicking a section item selects it → Property Panel updates

#### Property Panel — Context-Aware Controls

The Property Panel renders **different control sets** depending on what is selected:

```
Selected: theme          → Color pickers (6) + font family + base size + page border
Selected: banner         → Background color + text color + font size + font weight + padding + letter spacing + alignment + border radius
Selected: results_table  → Column list (drag to reorder, rename inline, toggle visible, add/remove) + table style controls
Selected: column node    → Header text (inline edit) + width + alignment + per-cell color overrides
Selected: comments       → Comment item list (add/remove/reorder/rename label) + ribbon style + text color
Selected: watermark      → Toggle + type (text/image) + content + opacity slider + position + rotation
```

The property panel is a **registry of control renderers** — each section type declares its editor:

```typescript
const SECTION_EDITORS: Record<SectionType, React.ComponentType<SectionEditorProps>> = {
  header:        HeaderEditor,
  banner:        BannerEditor,
  student_info:  StudentInfoEditor,
  ribbon:        RibbonEditor,
  results_table: ResultsTableEditor,
  assessment:    AssessmentEditor,
  comments:      CommentsEditor,
  grade_table:   GradeTableEditor,
};
```

#### Inline Editing in Preview

- **Click a column header in the preview** → focus inline text input
- **Click banner text** → inline text edit
- **Drag a column separator** → resize column width
- **Drag a section drag-handle** → reorder sections
- All changes go through the document mutation system

#### Column Management (Critical)

The `ResultsTableEditor` exposes:
```
┌──────────────────────────────────────────────────────────┐
│ Table Columns                                    [+Add]  │
│ ── ┌────────────┐  Left  25%  🎨  👁  🗑           │
│ ·· │ Subject    │                                        │
│ ── ├────────────┤  Center 8% 🎨  👁  🗑           │
│ ·· │ EOT        │                                        │
│ ── ├────────────┤  Center 8% 🎨  👁  🗑           │
│ ·· │ Total      │                                        │
│    └────────────┘                                        │
│                                                          │
│  Table Style                                             │
│  Header bg: [____]  Row border: [____]                   │
│  Header size: [12px]  Row size: [11px]                   │
└──────────────────────────────────────────────────────────┘
```

Each column row:
- Drag handle (reorder)
- Header name (inline editable `<input>`)
- Alignment picker (left/center/right)
- Width input
- Color button
- Visibility eye toggle
- Delete (disabled if only 1 column remains)

`+ Add` opens a column picker showing available `binding` paths from the data model:
```
result.subjectName    result.midTermScore   result.endTermScore
result.grade          result.comment        result.initials
result.teacherName    (custom field)
```

---

### 3.5 State Management Model

#### Document State Tree

```typescript
interface DRCEDocumentState {
  /** The live document being edited */
  document: DRCEDocument;
  /** Which node is selected (null = nothing selected) */
  selectedNodeId: string | null;
  /** Selection type: 'section' | 'column' | 'field' | 'theme' | 'watermark' */
  selectionType: DRCESelectionType | null;
  /** Undo/redo stacks */
  undoStack: DRCEDocument[];
  redoStack: DRCEDocument[];
  /** Whether unsaved changes exist */
  isDirty: boolean;
  /** Save/load state */
  isSaving: boolean;
  isLoading: boolean;
}
```

#### Mutation System

All mutations go through a single `applyMutation(mutation: DRCEMutation)` function:

```typescript
type DRCEMutation =
  | { type: 'SET_THEME';         path: string; value: any }
  | { type: 'SET_SECTION_STYLE'; sectionId: string; path: string; value: any }
  | { type: 'SET_SECTION_CONTENT'; sectionId: string; path: string; value: any }
  | { type: 'TOGGLE_SECTION';    sectionId: string }
  | { type: 'REORDER_SECTIONS';  ids: string[] }
  | { type: 'ADD_SECTION';       section: DRCESection; afterId: string | null }
  | { type: 'DELETE_SECTION';    sectionId: string }
  | { type: 'ADD_COLUMN';        sectionId: string; column: DRCEColumn }
  | { type: 'DELETE_COLUMN';     sectionId: string; columnId: string }
  | { type: 'REORDER_COLUMNS';   sectionId: string; ids: string[] }
  | { type: 'SET_COLUMN_PROP';   sectionId: string; columnId: string; path: string; value: any }
  | { type: 'ADD_FIELD';         sectionId: string; field: DRCEField }
  | { type: 'DELETE_FIELD';      sectionId: string; fieldId: string }
  | { type: 'REORDER_FIELDS';    sectionId: string; ids: string[] }
  | { type: 'SET_WATERMARK';     path: string; value: any };
```

The mutation processor:
1. Pushes current document to `undoStack` (max 50 entries)
2. Applies the mutation immutably using `produce` (immer)
3. Clears `redoStack`
4. Sets `isDirty = true`
5. The reducer returns new state → React re-renders → preview updates

#### Undo/Redo

```
Ctrl+Z → pop from undoStack → push current to redoStack → set as document
Ctrl+Y → pop from redoStack → push current to undoStack → set as document
```

Full document snapshots, max 50. For large documents (many sections), consider structural sharing.

#### Debounced Persistence

A `useEffect` watches `document` + `isDirty`. When dirty, schedules a 1.5s debounced PUT to the API. On explicit Save (Cmd+S or button), cancels debounce and saves immediately.

---

### 3.6 Rendering Engine

#### Architecture Separation

```
┌──────────────────────────────────────────────────────────────┐
│                   DRCE Rendering Pipeline                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  DATA LAYER          LAYOUT LAYER         STYLE LAYER        │
│  ─────────────       ──────────────       ──────────────     │
│  DRCEDataContext      section.type         theme + section   │
│  ├ student.*          + section.order      .style (merged)   │
│  ├ results[]          = section           resolved to       │
│  ├ assessment.*       component           inline CSS         │
│  ├ comments.*                             at render time     │
│  └ meta.*             column[].order                         │
│                       = column order                         │
│                                                              │
│  Resolution:          Resolution:         Resolution:        │
│  binding →            section[] sorted    StyleResolver      │
│  context path         by .order           theme.X ← sect.X  │
│  evaluated at         visible filtered    ← col.X            │
│  render               → component tree                       │
└──────────────────────────────────────────────────────────────┘
```

#### Section Component Registry

```typescript
// Each section type maps to a renderer component
const SECTION_RENDERERS: Record<SectionType, React.ComponentType<SectionRenderProps>> = {
  header:        HeaderSection,
  banner:        BannerSection,
  student_info:  StudentInfoSection,
  ribbon:        RibbonSection,
  results_table: ResultsTableSection,
  assessment:    AssessmentSection,
  comments:      CommentsSection,
  grade_table:   GradeTableSection,
};

// The document renderer
function DRCEDocumentRenderer({ document, context, interactive }: Props) {
  const visibleSections = [...document.sections]
    .filter(s => s.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <DRCEDataContext.Provider value={context}>
      <DRCEThemeContext.Provider value={document.theme}>
        <div style={resolvePageStyle(document.theme)}>
          {document.watermark.enabled && <WatermarkLayer config={document.watermark} />}
          {visibleSections.map(section => {
            const Renderer = SECTION_RENDERERS[section.type];
            return (
              <Renderer
                key={section.id}
                section={section}
                interactive={interactive}
                onSelect={interactive ? () => onSelect(section.id) : undefined}
              />
            );
          })}
        </div>
      </DRCEThemeContext.Provider>
    </DRCEDataContext.Provider>
  );
}
```

#### Column Rendering (ResultsTableSection)

```typescript
function ResultsTableSection({ section, context }: SectionRenderProps) {
  const visibleCols = [...section.columns]
    .filter(c => c.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <table style={resolveTableStyle(section.style)}>
      <thead>
        <tr>
          {visibleCols.map(col => (
            <th key={col.id} style={resolveColHeaderStyle(col, section.style)}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {context.results.map((row, i) => (
          <tr key={i}>
            {visibleCols.map(col => (
              <td key={col.id} style={resolveColCellStyle(col, section.style)}>
                {resolveBinding(col.binding, { result: row, student: context.student })}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

#### Style Resolver

```typescript
function resolveStyle(theme: DRCETheme, sectionStyle?: Partial<DRCESectionStyle>, nodeStyle?: Partial<any>): React.CSSProperties {
  // Merge in order: theme defaults → section overrides → node overrides
  return {
    fontFamily:   nodeStyle?.fontFamily  ?? sectionStyle?.fontFamily  ?? theme.fontFamily,
    fontSize:     nodeStyle?.fontSize    ?? sectionStyle?.fontSize    ?? theme.baseFontSize,
    color:        nodeStyle?.color       ?? sectionStyle?.color,
    background:   nodeStyle?.background  ?? sectionStyle?.background,
    // …etc
  };
}
```

#### Print Export

The `DRCEDocumentRenderer` with `interactive=false` is fully print-safe. A dedicated print route:
```
/reports/print/[documentId]?student_id=X&term_id=Y&year_id=Z
```
Fetches the active document schema + student data → renders → triggers `window.print()`.

For bulk printing:
```
/reports/print/bulk?document_id=X&class_id=Y&term_id=Z
```
Renders one document per student, each in a `page-break-after: always` container.

---

## PHASE 4 — SYSTEM UNIFICATION: DRAIS Visual Composition Framework (DVCF)

### Unification Vision

Both the ID Card and the Report Document are **visual composition documents**. They differ in:
- Canvas size (ID-1 card vs A4 page)
- Section complexity (card = flat single zone; report = multi-section document)
- Data context (card = one student; report = student + results + assessment)

They share the same conceptual architecture:
- A **schema** drives visual output
- A **live preview** reflects changes instantly
- A **print pipeline** produces print-safe output
- A **persistence layer** stores the schema per school

### Shared Abstraction

```
DVCF (DRAIS Visual Composition Framework)
├── Shared Schema Language:  dvcf/schema/v1
│   ├── DRCEDocument  (multi-section, A4)   — reports
│   └── DVCFCard      (single zone, ID-1)   — ID cards
├── Shared Rendering Engine:
│   ├── StyleResolver  (theme → section → node cascade)
│   ├── BindingResolver (dot-path data resolution)
│   └── PrintRenderer   (@media print safe)
├── Shared Styling System:
│   ├── ThemeContext    (primaryColor, fontFamily, baseFontSize)
│   ├── PresetPalettes  (8 presets — already exist for ID cards)
│   └── StylePicker     (color pickers, sliders, font selectors)
└── Shared Component Library:
    ├── ColorRow
    ├── ToggleRow
    ├── SliderRow
    ├── InlineEditableText
    ├── DragSortableList
    └── SectionEditor (base class)
```

### Shared DB Schema

```sql
CREATE TABLE dvcf_documents (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  school_id    INT          NULL,        -- NULL = global
  document_type ENUM('report_card', 'id_card', 'transcript') NOT NULL,
  name         VARCHAR(100) NOT NULL,
  description  VARCHAR(255),
  schema_json  LONGTEXT     NOT NULL,    -- DRCEDocument | DVCFCard
  schema_version INT        NOT NULL DEFAULT 1,
  is_default   TINYINT(1)   NOT NULL DEFAULT 0,
  template_key VARCHAR(50)  NULL,        -- 'northgate_official', 'drais_default', etc.
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_school_type (school_id, document_type),
  KEY idx_default    (is_default)
);

-- Per-school active document selection
-- (replaces both id_card_templates.is_active and school_settings active_report_template_id)
CREATE TABLE dvcf_active_documents (
  school_id     INT  NOT NULL,
  document_type ENUM('report_card', 'id_card', 'transcript') NOT NULL,
  document_id   INT  NOT NULL,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (school_id, document_type)
);
```

### Migration Strategy

1. Existing `report_templates` rows → converted to `dvcf_documents` with `document_type='report_card'`, schema migrated by a one-time transform script
2. Existing `id_card_templates` rows → converted to `dvcf_documents` with `document_type='id_card'`, `IDCardConfig` wrapped in DVCF card schema
3. Old API routes (`/api/report-templates/*`, `/api/id-card-templates`) kept as proxies during transition, forwarding to new `/api/dvcf/*` routes
4. `is_active` on `id_card_templates` → entry in `dvcf_active_documents`

---

## PHASE 5 — IMPLEMENTATION ROADMAP

### Phase A: Schema & Foundation (Weeks 1–2)

**Deliverables:**
1. `src/lib/drce/schema.ts` — All DRCE TypeScript types (`DRCEDocument`, `DRCESection`, `DRCEColumn`, `DRCEField`, `DRCETheme`, `DRCEWatermark`, `DRCEMutation`)
2. `src/lib/drce/defaults.ts` — Built-in templates as typed DRCE documents (replace current `DEFAULT_TEMPLATE_JSON`)
3. `src/lib/drce/styleResolver.ts` — Theme → section → node style cascade
4. `src/lib/drce/bindingResolver.ts` — `"student.className"` → `ctx.student.className`
5. Database migration: `dvcf_documents` + `dvcf_active_documents` tables
6. API routes: `GET/POST /api/dvcf/documents`, `PUT/DELETE /api/dvcf/documents/[id]`, `GET/POST /api/dvcf/active`

**Risk:** Existing `layout_json` shape must be migrated. Write a `migrateReportTemplate(old: ReportLayoutJSON): DRCEDocument` transform. Keep old tables alongside new until migration is confirmed.

---

### Phase B: Rendering Engine (Week 3)

**Deliverables:**
1. `src/components/drce/DRCEDocumentRenderer.tsx` — Schema-driven renderer
2. Section renderers: `HeaderSection`, `BannerSection`, `StudentInfoSection`, `RibbonSection`, `ResultsTableSection`, `AssessmentSection`, `CommentsSection`, `GradeTableSection`
3. `WatermarkLayer.tsx` — Text and image watermark overlay
4. Print route: `/reports/print/[docId]` — single student, server-render safe
5. Bulk print route: `/reports/print/bulk` — class-level batch

**Validation:** Render all 3 existing built-in templates via new engine, confirm visual parity.

**Risk:** The Northgate "Classic" template (`northgate_rpt_clone`) uses custom SVG polygon ribbons. Map these to a `ribbon.shape: "arrow-down"` property and implement SVG rendering in `RibbonSection`. Do not break the existing Northgate route during this phase.

---

### Phase C: Document State & Mutation System (Week 4)

**Deliverables:**
1. `src/lib/drce/mutations.ts` — Typed mutation union + `applyMutation()` pure function
2. `src/hooks/useDRCEEditor.ts` — React hook wrapping state + dispatch + undo/redo
3. `src/lib/drce/undoStack.ts` — Immutable stack implementation (max 50 snapshots)
4. Unit tests for all mutation types

**Risk:** Undo history consumes memory for large documents. Implement structural sharing (or limit to 20 snapshots with a warning).

---

### Phase D: Visual Editor UI (Weeks 5–7)

**Deliverables:**
1. New route: `src/app/reports/kitchen/editor/[docId]/page.tsx` — Full 3-panel editor
2. `StructurePanel.tsx` — Drag-sortable section list, visibility toggles, add/delete
3. `PropertyPanel.tsx` — Context-aware controls router
4. Section editors (8 components, one per type)
5. `ResultsTableEditor.tsx` — Column list with inline rename, drag reorder, add/remove
6. `ThemeEditor.tsx` — Color pickers, presets, font selector
7. `WatermarkEditor.tsx` — Full watermark configuration
8. Inline editing in preview (click banner → edit text, click column header → rename)
9. Keyboard shortcuts: Ctrl+Z/Y (undo/redo), Ctrl+S (save)
10. Update Kitchen dashboard to link to new editor per template

**Risk:** Drag-and-drop requires `dnd-kit` (already likely in deps). Inline editing in the preview needs careful event isolation — clicks that trigger selection must not bubble to parent handlers.

---

### Phase E: ID Card Migration & Unification (Week 8)

**Deliverables:**
1. `src/lib/drce/idCardAdapter.ts` — `IDCardConfig → DVCFCard` converter
2. Update `/students/id-cards` editor to use DVCF-compatible state management (keep existing IDCardPreview component, just source from DVCF schema)
3. `dvcf_active_documents` manages active ID card template
4. Deprecate `id_card_templates` table (keep for 2 release cycles)
5. Shared `PresetPalettes` component used by both editors

---

### Phase F: Migration & Backward Compatibility (Week 9)

**Deliverables:**
1. Migration script: `scripts/migrate-templates-to-drce.ts` — converts existing `report_templates` + `id_card_templates` → `dvcf_documents`
2. Proxy API routes: `/api/report-templates/*` → `/api/dvcf/*` (HTTP 301 after 1 cycle)
3. `/reports/northgate` route: updated to read from DVCF active document
4. Deprecation warnings for old Kitchen URL (`/reports/kitchen` → redirect to new editor)
5. Documentation for school administrators

---

## CRITICAL FAILURE RISKS

### R1: Preview Fidelity Regression
**Risk:** The new schema-driven renderer produces visually different output than the hardcoded Northgate templates, which schools rely on for official printing.  
**Mitigation:** Run the old and new renderer side-by-side for each template in a test harness, capturing screenshots and diffing pixel-by-pixel using Playwright.

### R2: Northgate Official Template Lock-In
**Risk:** `NorthgateReport.tsx` and `NorthgateClassicTemplate.tsx` are monolithic hardcoded React components. They are used for actual report generation at Northgate school. Any DRCE migration must not break these.  
**Mitigation:** Keep `template_key = 'northgate_official'` and `'northgate_rpt_clone'` as escape hatches in the renderer — if `template_key` is set, use the legacy component. Only remove after explicit school sign-off.

### R3: Performance — Large Class Bulk Print
**Risk:** Rendering 40 students × full DRCE document tree at once may be slow.  
**Mitigation:** Render students lazily in the print pipeline. Consider server-side rendering or puppeteer-based PDF generation for bulk exports.

### R4: Schema Evolution Breaking Old Templates
**Risk:** Adding new required fields to `DRCEDocument` breaks deserialization of templates saved under the previous schema.  
**Mitigation:** Always use `schema_version` + a `migrateDocument(doc, fromVersion, toVersion)` chain. New fields must always have defaults. Old schemas always deserialize successfully.

### R5: Inline Editing UX Complexity
**Risk:** Click-to-edit column headers in a live preview is technically complex and fragile. Click events on the preview can conflict with scroll/selection.  
**Mitigation:** Gate inline editing behind a `editMode` flag. In edit mode, the preview shows edit handles. In preview mode, it is read-only. This removes ambiguity.

### R6: Dual Database Schema Maintenance
**Risk:** Running old + new tables in parallel increases maintenance burden.  
**Mitigation:** Set a hard sunset date for old tables: 60 days after DRCE deployment, run the migration and drop old tables.

---

## Architecture Diagram — DRCE Component Map

```
src/
├── lib/drce/
│   ├── schema.ts          ← All TypeScript types
│   ├── defaults.ts        ← Built-in document templates
│   ├── mutations.ts        ← Mutation types + applyMutation()
│   ├── styleResolver.ts   ← Theme cascade → inline CSS
│   ├── bindingResolver.ts ← "student.name" → value
│   ├── undoStack.ts       ← Immutable undo/redo stack
│   └── idCardAdapter.ts   ← IDCardConfig ↔ DVCFCard
│
├── components/drce/
│   ├── DRCEDocumentRenderer.tsx    ← Root renderer
│   ├── WatermarkLayer.tsx
│   ├── sections/
│   │   ├── HeaderSection.tsx
│   │   ├── BannerSection.tsx
│   │   ├── StudentInfoSection.tsx
│   │   ├── RibbonSection.tsx
│   │   ├── ResultsTableSection.tsx
│   │   ├── AssessmentSection.tsx
│   │   ├── CommentsSection.tsx
│   │   └── GradeTableSection.tsx
│   └── editors/
│       ├── PropertyPanel.tsx       ← Context-aware router
│       ├── StructurePanel.tsx      ← Drag-sortable section list
│       ├── ThemeEditor.tsx
│       ├── WatermarkEditor.tsx
│       ├── BannerEditor.tsx
│       ├── StudentInfoEditor.tsx
│       ├── ResultsTableEditor.tsx  ← Column management
│       ├── CommentsEditor.tsx
│       └── [other section editors]
│
├── hooks/
│   └── useDRCEEditor.ts   ← State + dispatch + undo/redo
│
└── app/
    ├── reports/kitchen/
    │   ├── page.tsx              ← Updated dashboard (links to editor)
    │   └── editor/[docId]/
    │       └── page.tsx          ← NEW: 3-panel visual editor
    └── api/dvcf/
        ├── documents/route.ts    ← GET list, POST create
        ├── documents/[id]/route.ts  ← GET, PUT, DELETE
        └── active/route.ts       ← GET/POST active per type
```

---

## Summary: Why DRCE Succeeds Where Reports Kitchen Fails

| Root Cause of Current Failure | DRCE Solution |
|-------------------------------|---------------|
| Schema richly defined but no editor wired to it | Registry-based editor: every schema path has a UI control |
| Table columns are hardcoded JSX strings | `columns[]` array in schema, `ResultsTableEditor` manages them |
| Section ordering designed but not rendered | `sections[].order` drives render, `StructurePanel` drives order |
| Preview is theatrical (static), not functional | `DRCEDocumentRenderer` is a pure function of schema; preview = production |
| Accent color is the only editable property | `ThemeEditor` + per-section style + per-column style = full control |
| No undo/redo | `undoStack` with Immer-based immutable mutations |
| No watermark system | First-class `watermark` node in schema, `WatermarkLayer` renderer |
| Templates are dead JSON clones | Living schema objects with version field and migration chain |
| Northgate template bypasses schema entirely | `template_key` escape hatch preserved during transition; eventually migrated |
| ID Card and Reports are two separate systems | Unified DVCF framework; shared palette, style engine, print pipeline |
