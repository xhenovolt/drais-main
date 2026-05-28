// ============================================================================
// src/lib/drce/schema.ts
// DRAIS Report Composition Engine (DRCE) — Full TypeScript type definitions
// Schema version: drce/v1
// ============================================================================

// ─── Section Types ───────────────────────────────────────────────────────────

export type DRCESectionType =
  | 'header'
  | 'banner'
  | 'student_info'
  | 'ribbon'
  | 'results_table'
  | 'assessment'
  | 'comments'
  | 'grade_table'
  | 'spacer'
  | 'divider'
  | 'next_term_begins'
  | 'container'    // Phase C — composition primitive holding child sections
  | 'shape'        // Phase C.2 — shape as section so it can live INSIDE a container
  | 'header_block' // Phase E — one header element (logo, name, motto, QR …)
  | 'block_ref';   // Phase H — reference to a shared block in drce_blocks

// ─── Theme ───────────────────────────────────────────────────────────────────

export interface DRCEPageBorder {
  enabled: boolean;
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted' | 'double';
  radius: number;
}

export type DRCEPageSize = 'a4' | 'a5' | 'a3' | 'letter' | 'legal';
export type DRCEOrientation = 'portrait' | 'landscape';

export interface DRCETheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  baseFontSize: number;
  pagePadding: string;
  pageBackground: string;
  pageBorder: DRCEPageBorder;
  pageSize: DRCEPageSize;
  orientation: DRCEOrientation;
}

// ─── Watermark ───────────────────────────────────────────────────────────────

export type DRCEWatermarkType = 'text' | 'image' | 'qrcode';
export type DRCEWatermarkPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type DRCEWatermarkScope = 'page' | 'results_area';

export interface DRCEWatermark {
  enabled: boolean;
  type: DRCEWatermarkType;
  content: string;       // text content, or alt text for image
  imageUrl: string | null;
  opacity: number;       // 0–1
  position: DRCEWatermarkPosition;
  rotation: number;      // degrees
  fontSize: number;
  color: string;
  scope: DRCEWatermarkScope;
}

// ─── Shapes ─────────────────────────────────────────────────────────────────────────────

export interface DRCERectShape {
  id: string;
  type: 'rect';
  x: number; y: number; w: number; h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  radius: number;
  rotation: number;
}

export interface DRCEEllipseShape {
  id: string;
  type: 'ellipse';
  x: number; y: number; w: number; h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  rotation: number;
}

/** Covers both plain lines and arrows (endArrow / startArrow flags). */
export interface DRCELineShape {
  id: string;
  type: 'line' | 'arrow';
  x1: number; y1: number;
  x2: number; y2: number;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  dashed: boolean;
  endArrow: boolean;
  startArrow: boolean;
  arrowSize: number;
}

export interface DRCETextShape {
  id: string;
  type: 'text';
  x: number; y: number; w: number; h: number;
  content: string;
  fontSize: number;
  color: string;
  background: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  rotation: number;
}

export interface DRCEPolygonShape {
  id: string; type: 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star';
  x: number; y: number; w: number; h: number;
  fill: string; stroke: string; strokeWidth: number; opacity: number; rotation: number;
}
export type DRCEShape = DRCERectShape | DRCEEllipseShape | DRCELineShape | DRCETextShape | DRCEPolygonShape;

// ─── Column (used by results_table section) ──────────────────────────────────

export interface DRCEColumnStyle {
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  background?: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface DRCEColumn {
  id: string;
  header: string;         // display text in <th>
  binding: string;        // dot-path into data context e.g. "result.grade"
  width: string;          // CSS width e.g. "25%", "60px"
  visible: boolean;
  order: number;
  align: 'left' | 'center' | 'right';
  style?: DRCEColumnStyle;
  contentEditable?: boolean;  // If true, cell can be edited inline (typically for initials)
}

// ─── Field (used by student_info and assessment sections) ────────────────────

export interface DRCEField {
  id: string;
  label: string;
  binding: string;        // dot-path into data context
  visible: boolean;
  order: number;
}

// ─── Comment Item (used by comments section) ─────────────────────────────────

export interface DRCECommentItem {
  id: string;
  label: string;          // e.g. "Class teacher comment:"
  binding: string;        // dot-path into data context
  visible: boolean;
  order: number;
}

// ─── Section Styles (per section type) ───────────────────────────────────────

export interface DRCEHeaderComponentBorder {
  enabled: boolean;
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted' | 'double';
  radius: number;
}

export interface DRCEHeaderComponentStyle {
  /** Position on horizontal axis: 'left', 'center', 'right', or 'auto' for default layout behavior */
  position?: 'left' | 'center' | 'right' | 'auto';
  /** Alignment within the component's space */
  align?: 'left' | 'center' | 'right';
  /** Border styling for this component */
  border?: DRCEHeaderComponentBorder;
  /** Padding within the component */
  padding?: string;
  /** Margin around the component */
  margin?: string;
  /** Background color for the component container */
  background?: string;
  /** Font size multiplier or absolute size */
  fontSize?: number;
  /** Text color */
  color?: string;
  /** Font weight */
  fontWeight?: string;
}

export interface DRCEHeaderStyle {
  layout: 'three-column' | 'centered' | 'left-logo' | 'flex-grid' | 'custom';
  paddingBottom: number;
  borderBottom: string;
  opacity: number;
  logoWidth: number;
  logoHeight: number;
  
  // ─── Component-level positioning & styling ────────────────────────────────
  
  /** Logo/badge component styling */
  logoStyle?: DRCEHeaderComponentStyle;
  /** School name component styling */
  nameStyle?: DRCEHeaderComponentStyle;
  /** Arabic name component styling */
  arabicNameStyle?: DRCEHeaderComponentStyle;
  /** Address component styling */
  addressStyle?: DRCEHeaderComponentStyle;
  /** Contact/phone component styling */
  contactStyle?: DRCEHeaderComponentStyle;
  /** Centre number component styling */
  centreNoStyle?: DRCEHeaderComponentStyle;
  /** Registration number component styling */
  registrationNoStyle?: DRCEHeaderComponentStyle;
  
  // ─── Component visibility toggles ──────────────────────────────────────────
  
  showLogo?: boolean;
  showName?: boolean;
  showArabicName?: boolean;
  showAddress?: boolean;
  showContact?: boolean;
  showCentreNo?: boolean;
  showRegistrationNo?: boolean;
  
  // ─── Header container border ──────────────────────────────────────────────
  
  headerBorder?: DRCEHeaderComponentBorder;
  
  // ─── Layout gap (spacing between flex items) ──────────────────────────────
  
  gap?: number;
}

export interface DRCEBannerStyle {
  backgroundColor: string;
  color: string;
  fontSize: number;
  fontWeight: string;
  textAlign: 'left' | 'center' | 'right';
  padding: string;
  letterSpacing: string;
  textTransform: 'uppercase' | 'none' | 'capitalize';
  borderRadius: number;
}

export interface DRCERibbonStyle {
  background: string;
  color: string;
  fontWeight: string;
  fontSize: number;
  padding: string;
  textAlign: 'left' | 'center' | 'right';
  width?: number;
  height?: number;
  chevronDepth?: number;
  tailDepth?: number;
  tailAngle?: number;
  strokeWidth?: number;
  strokeColor?: string;
  textOffsetY?: number;
  cornerRadius?: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  layerCount?: number;
  layerOffset?: number;
  svgScale?: number;
  rotation?: number;
}

export interface DRCEStudentInfoStyle {
  border: string;
  borderRadius: number;
  padding: string;
  background: string;
  labelColor: string;
  valueColor: string;
  valueFontWeight: string;
  valueFontSize: number;
  /** Show vertical barcode/QR in the leftmost column (default true) */
  showBarcode?: boolean;
  /** Show student photo next to the barcode (default true) */
  showPhoto?: boolean;
  /** Number of fields per row in the field-grid (default 4) */
  fieldsPerRow?: number;
  /** Rotation angle for the barcode SVG in degrees (default 0; 90 = vertical) */
  barcodeRotation?: number;
  /** Barcode column width in px (default 46) */
  barcodeWidth?: number;
  /** Barcode bar height in px (default 52) */
  barcodeHeight?: number;
  /** Spacing between barcode bars and label text in px */
  barcodeLabelSpacing?: number;
  /** Font size of barcode label in px */
  barcodeLabelFontSize?: number;
}

export interface DRCEResultsTableStyle {
  headerBackground: string;
  headerBorder: string;
  rowBorder: string;
  headerFontSize: number;
  rowFontSize: number;
  headerTextTransform: 'uppercase' | 'none' | 'capitalize';
  padding: number;
}

export interface DRCECommentsStyle {
  ribbonBackground: string;
  ribbonColor: string;
  ribbonFontSize?: number;
  textColor: string;
  textFontSize?: number;
  textFontStyle: 'italic' | 'normal';
}

export interface DRCEGradeTableStyle {
  headerBackground: string;
  border: string;
}

export interface DRCEGradeRow {
  label: string;
  min: number;
  max: number;
  remark: string;
}

export interface DRCESpacerStyle {
  height: number; // px
}

// ─── Comment Rules (auto-comment by marks range) ─────────────────────────────

export interface DRCECommentRule {
  id: string;
  minScore: number;       // inclusive lower bound (average subject score)
  maxScore: number;       // inclusive upper bound
  classTeacher: string;
  dos: string;
  headTeacher: string;
}

// ─── Teacher Mappings (subject+class → initials) ──────────────────────────────

export interface DRCETeacherMapping {
  id: string;
  subjectPattern: string;  // substring match, case-insensitive; '' = all subjects
  classPattern: string;    // substring match, case-insensitive; '' or 'all' = all classes
  initials: string;
  teacherName: string;
}

// ─── Section (base + discriminated union) ────────────────────────────────────

interface DRCESectionBase {
  id: string;
  type: DRCESectionType;
  visible: boolean;
  order: number;
}

export interface DRCEHeaderSection extends DRCESectionBase {
  type: 'header';
  style: DRCEHeaderStyle;
}

export interface DRCEBannerSection extends DRCESectionBase {
  type: 'banner';
  content: { text: string };
  style: DRCEBannerStyle;
}

export interface DRCEStudentInfoSection extends DRCESectionBase {
  type: 'student_info';
  fields: DRCEField[];
  style: DRCEStudentInfoStyle;
}

export interface DRCERibbonSection extends DRCESectionBase {
  type: 'ribbon';
  content: { text: string; shape: 'arrow-down' | 'flat' | 'chevron' };
  style: DRCERibbonStyle;
}

export interface DRCEResultsTableTotalsConfig {
  /** Whether to show a totals row at the end of the table */
  enabled: boolean;
  /** Label text to display in the first column */
  labelText: string;
  /** Whether to show total marks obtained */
  showTotalObtained: boolean;
  /** Whether to show total possible marks */
  showTotalPossible: boolean;
  /** Whether to show percentage */
  showPercentage: boolean;
  /** Whether to show average */
  showAverage: boolean;
  /** Whether to show grand grade */
  showGrandGrade: boolean;
  /** Column IDs to sum up for obtained marks (numeric columns) */
  sumColumnIds: string[];
  /** Style for the totals row */
  rowStyle?: DRCEColumnStyle;
}

export interface DRCEResultsTableSection extends DRCESectionBase {
  type: 'results_table';
  columns: DRCEColumn[];
  style: DRCEResultsTableStyle;
  /** Filter which subjects to show: 'all' (default), 'primary' (core only), 'secondary' (non-core only) */
  subjectFilter?: 'all' | 'primary' | 'secondary';
  /** Configuration for displaying totals/average rows */
  totalsConfig?: DRCEResultsTableTotalsConfig;
}

export interface DRCEAssessmentSection extends DRCESectionBase {
  type: 'assessment';
  fields: DRCEField[];
  style: Record<string, unknown>;
}

export interface DRCECommentsSection extends DRCESectionBase {
  type: 'comments';
  items: DRCECommentItem[];
  style: DRCECommentsStyle;
}

export interface DRCEGradeTableSection extends DRCESectionBase {
  type: 'grade_table';
  style: DRCEGradeTableStyle;
  grades: DRCEGradeRow[];
}

export interface DRCESpacerSection extends DRCESectionBase {
  type: 'spacer';
  style: DRCESpacerStyle;
}

export interface DRCEDividerSection extends DRCESectionBase {
  type: 'divider';
  style: { color: string; thickness: number; margin: string };
}

export interface DRCENextTermBeginsSection extends DRCESectionBase {
  type: 'next_term_begins';
  content: { text: string; customDate?: string };
  style: DRCENextTermBeginsStyle;
}

export type DRCENextTermBeginsStyle = {
  background: string;
  color: string;
  fontSize: number;
  fontWeight: string;
  textAlign: 'left' | 'center' | 'right';
  padding: string;
  borderRadius: number;
  borderColor?: string;
  borderWidth?: number;
  icon?: string;
};

/**
 * Phase C — composition container. Holds an ordered list of child sections
 * (including other containers, enabling nesting). C.1 supports the 'stack'
 * layout; C.2 will add 'row' | 'grid' | 'absolute'. Shapes-as-children land
 * in C.2 alongside the 'absolute' layout.
 */
export interface DRCEContainerStyle {
  /** Layout mode. C.1 ships 'stack' only; other modes registered in C.2. */
  layout?:        'stack' | 'row' | 'grid' | 'absolute';
  gap?:           number;          // px — between children
  padding?:       string;          // CSS shorthand
  background?:    string;
  border?:        string;
  borderRadius?:  number;
  align?:         'start' | 'center' | 'end' | 'stretch';
  justify?:       'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  /** For grid: CSS grid-template-columns / -rows. C.2. */
  gridTemplateColumns?: string;
  gridTemplateRows?:    string;
  /** For absolute layout: container becomes the positioning context. C.2. */
  width?:  number | string;
  height?: number | string;
}

export interface DRCEContainerSection extends DRCESectionBase {
  type:     'container';
  children: DRCESection[];
  style:    DRCEContainerStyle;
}

/**
 * Phase C.2 — a shape rendered as a section. This is the structural fix for
 * "shapes drift after save": inside an `absolute` container, a shape section
 * flows with the section tree instead of floating on the legacy overlay.
 * The top-level `shapes[]` array continues to work for backward compat.
 */
export interface DRCEShapeSection extends DRCESectionBase {
  type:  'shape';
  shape: DRCEShape;
  /** Pass-through style so the section wrapper can position the shape
   *  (left/top/width/height/zIndex) when inside an absolute container. */
  style: Record<string, unknown>;
}

/**
 * Phase E — header composability.
 *
 * One header element. Drop several inside a `container` (typically row with
 * justify: 'space-between') to author any header layout — including
 * multi-language, founder-photo, verification-QR — without editing the
 * engine or coupling to the legacy DRCEHeaderSection slot map (which keeps
 * working unchanged as a preset).
 */
export type DRCEHeaderBlockKind =
  | 'logo'
  | 'school_name'
  | 'arabic_name'
  | 'address'
  | 'contact'
  | 'center_no'
  | 'registration_no'
  | 'motto'
  | 'qr'             // verification / lookup QR
  | 'custom_text'    // arbitrary text (rendered through resolveExpression so {tokens} work)
  | 'custom_image';

export interface DRCEHeaderBlockStyle {
  fontSize?:     number;
  fontWeight?:   string;
  color?:        string;
  background?:   string;
  padding?:      string;
  align?:        'left' | 'center' | 'right';
  width?:        number | string;
  height?:       number | string;
  border?:       string;
  borderRadius?: number;
}

export interface DRCEHeaderBlockSection extends DRCESectionBase {
  type:  'header_block';
  kind:  DRCEHeaderBlockKind;
  /** For custom_text / motto override — supports expression tokens. */
  text?:     string;
  /** For custom_image. */
  imageUrl?: string;
  /** For qr — what to encode. Supports expression tokens. */
  qrValue?:  string;
  style?:    DRCEHeaderBlockStyle;
}

/**
 * Phase H — reference to a shared block in drce_blocks.
 *
 * Inlined at document load by the loader (resolveBlockRefs); the renderer
 * never sees a block_ref. If the referenced block is missing (deleted,
 * cross-school), the loader replaces the ref with a no-op spacer so the
 * document still renders.
 */
export interface DRCEBlockRefSection extends DRCESectionBase {
  type:     'block_ref';
  block_id: number;
}

export type DRCESection =
  | DRCEHeaderSection
  | DRCEBannerSection
  | DRCEStudentInfoSection
  | DRCERibbonSection
  | DRCEResultsTableSection
  | DRCEAssessmentSection
  | DRCECommentsSection
  | DRCEGradeTableSection
  | DRCESpacerSection
  | DRCEDividerSection
  | DRCENextTermBeginsSection
  | DRCEContainerSection
  | DRCEShapeSection
  | DRCEHeaderBlockSection
  | DRCEBlockRefSection;

// ─── Document Metadata ────────────────────────────────────────────────────────

export type DRCEReportType = 'end_of_term' | 'mid_term' | 'progress' | 'transcript';

export interface DRCEMeta {
  id: string;
  name: string;
  school_id: number | null;  // null = global/built-in
  version: number;
  created_at: string;
  updated_at: string;
  report_type: DRCEReportType;
  is_default: boolean;
  template_key: string | null;  // 'northgate_official', 'drais_default', etc.
  /**
   * Phase 2 — explicit category from dvcf_documents.template_category.
   * Optional in code only because pre-Phase-2 schema_json blobs predate it;
   * every row written through current APIs carries a value.
   */
  template_category?: import('./registry').TemplateCategory;
  /**
   * Phase H — parent document id for template inheritance. When set, the
   * loader merges the parent's full DRCEDocument with this child before
   * render: child sections with the same id REPLACE parent sections; new
   * child ids append. Parent theme/watermark/commentRules/teacherMappings
   * provide the baseline that the child overrides field-by-field.
   */
  parent_id?: number | null;
}

// ─── Root Document ────────────────────────────────────────────────────────────

export interface DRCEDocument {
  $schema: 'drce/v1';
  meta: DRCEMeta;
  theme: DRCETheme;
  watermark: DRCEWatermark;
  sections: DRCESection[];
  shapes: DRCEShape[];
  /** Auto-comment rules: match by average subject score range */
  commentRules?: DRCECommentRule[];
  /** Teacher initials: map subject+class pattern to initials */
  teacherMappings?: DRCETeacherMapping[];
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export type DRCEMutation =
  | { type: 'SET_THEME';           path: string; value: unknown }
  | { type: 'SET_SECTION_STYLE';   sectionId: string; path: string; value: unknown }
  | { type: 'SET_SECTION_PROP';    sectionId: string; path: string; value: unknown }
  | { type: 'SET_SECTION_CONTENT'; sectionId: string; path: string; value: unknown }
  | { type: 'TOGGLE_SECTION';      sectionId: string }
  | { type: 'REORDER_SECTIONS';    ids: string[] }
  | { type: 'ADD_SECTION';         section: DRCESection; afterId: string | null; parentContainerId?: string | null }
  /**
   * Phase C follow-up: move an existing section to a new location.
   *   - targetContainerId: null → top level; string → inside that container
   *   - position: 0-based index in the destination list; clamps to bounds
   * Source is found recursively; both moves within a list and cross-
   * container moves are supported. Re-numbers `order` everywhere it lands.
   */
  | { type: 'MOVE_SECTION';        sectionId: string; targetContainerId: string | null; position: number }
  | { type: 'DELETE_SECTION';      sectionId: string }
  | { type: 'ADD_COLUMN';          sectionId: string; column: DRCEColumn }
  | { type: 'DELETE_COLUMN';       sectionId: string; columnId: string }
  | { type: 'REORDER_COLUMNS';     sectionId: string; ids: string[] }
  | { type: 'SET_COLUMN_PROP';     sectionId: string; columnId: string; path: string; value: unknown }
  | { type: 'ADD_FIELD';           sectionId: string; field: DRCEField }
  | { type: 'DELETE_FIELD';        sectionId: string; fieldId: string }
  | { type: 'REORDER_FIELDS';      sectionId: string; ids: string[] }
  | { type: 'SET_FIELD_PROP';      sectionId: string; fieldId: string; path: string; value: unknown }
  | { type: 'ADD_COMMENT_ITEM';      sectionId: string; item: DRCECommentItem }
  | { type: 'DELETE_COMMENT_ITEM';   sectionId: string; itemId: string }
  | { type: 'REORDER_COMMENT_ITEMS'; sectionId: string; ids: string[] }
  | { type: 'SET_COMMENT_ITEM_PROP'; sectionId: string; itemId: string; path: string; value: unknown }
  | { type: 'SET_WATERMARK';       path: string; value: unknown }
  | { type: 'SET_GRADE_ROWS';      sectionId: string; grades: DRCEGradeRow[] }
  | { type: 'ADD_SHAPE';           shape: DRCEShape }
  | { type: 'UPDATE_SHAPE';        id: string; updates: Partial<DRCEShape> }
  | { type: 'DELETE_SHAPE';        id: string }
  | { type: 'SET_COMMENT_RULES';   rules: DRCECommentRule[] }
  | { type: 'SET_TEACHER_MAPPINGS'; mappings: DRCETeacherMapping[] };

// ─── Data Context (passed to renderer at print/preview time) ─────────────────

export interface DRCESubject {
  id: number;
  name: string;
  /** Configurable total marks for this subject (default 100) */
  totalMarks: number;
  /** 'primary' = core subject, 'secondary' = non-core/elective */
  subjectType?: 'primary' | 'secondary';
}

export interface DRCEResultRow {
  subjectName: string;
  midTermScore: number | null;
  endTermScore: number | null;
  total: number | null;
  grade: string;
  comment: string;
  initials: string;
  teacherName: string;
  /** 'primary' = core subject, 'secondary' = non-core/elective (default 'primary') */
  subjectType?: 'primary' | 'secondary';
  /** Subject configuration including total marks */
  subject?: DRCESubject;
}

export interface DRCEAssessmentData {
  classPosition: number | null;
  streamPosition: number | null;
  aggregates: number | null;
  division: string | null;
  totalStudents: number | null;
  /** Formatted position string e.g. "4 / 36" — used by student_info field bindings */
  position?: string | null;
}

export interface DRCECommentsData {
  classTeacher: string;
  dos: string;
  headTeacher: string;
}

export interface DRCEStudentData {
  fullName: string;
  firstName: string;
  lastName: string;
  gender: string;
  className: string;
  streamName: string;
  admissionNo: string;
  photoUrl: string | null;
  dateOfBirth: string | null;
}

export interface DRCEMetaContext {
  schoolName: string;
  schoolAddress: string;
  schoolContact: string;
  schoolEmail: string;
  centerNo: string;
  registrationNo: string;
  arabicName?: string | null;
  arabicAddress?: string | null;
  logoUrl?: string | null;
  term: string;
  year: string;
  reportTitle: string;
  nextTermBegins?: string;
  /**
   * Optional academic calendar enrichment (Phase B). Populated by the
   * snapshot adapter when the school's calendar can be inferred from
   * `terms` / `academic_years`. Computed fields ({next_term_begins},
   * {this_term_ends}) prefer these values; renderers that don't know
   * about this field continue to work unchanged.
   */
  calendar?: {
    next_term_starts_at?: string | null;
    this_term_ends_at?:   string | null;
    next_term_name?:      string | null;
    prev_term_name?:      string | null;
    year_rollover?:       boolean;
  };
}

export type Language = 'en' | 'ar';

export interface DRCEDataContext {
  student: DRCEStudentData;
  results: DRCEResultRow[];
  subjects: DRCESubject[];
  assessment: DRCEAssessmentData;
  comments: DRCECommentsData;
  meta: DRCEMetaContext;
  /** Current language for rendering: 'en' | 'ar' */
  language?: Language;
  /** Columns visible in results table (injected by section renderer) */
  columns?: Array<{ id: string; binding: string }>;
}

// ─── DB Row (as stored in dvcf_documents) ────────────────────────────────────

export interface DVCFDocumentRow {
  id: number;
  school_id: number | null;
  document_type: 'report_card' | 'id_card' | 'transcript';
  name: string;
  description: string;
  schema_json: string;
  schema_version: number;
  is_default: number;    // tinyint
  template_key: string | null;
  /**
   * Phase 2. Mirrors the dvcf_documents.template_category ENUM exactly.
   * Always present on rows fetched after the migration ran.
   */
  template_category: import('./registry').TemplateCategory;
  /** Phase H — parent template id (NULL when this document inherits from nothing). */
  parent_id?: number | null;
  created_at: string;
  updated_at: string;
}

/** Parse a raw DB row into a typed DRCEDocument */
export function parseDRCERow(row: DVCFDocumentRow): DRCEDocument {
  const doc = typeof row.schema_json === 'string'
    ? JSON.parse(row.schema_json) as DRCEDocument
    : row.schema_json as unknown as DRCEDocument;

  // Ensure meta fields from the DB row override what's in the JSON. The
  // template_category column is the single source of truth — never trust
  // schema_json's stored value.
  doc.meta = {
    ...doc.meta,
    id: String(row.id),
    name: row.name,
    school_id: row.school_id,
    is_default: Boolean(row.is_default),
    template_key: row.template_key,
    template_category: row.template_category,
    parent_id: row.parent_id ?? null,
  };

  // Defensive defaults — guard against malformed / legacy schema_json
  if (!Array.isArray(doc.sections)) doc.sections = [];
  if (!Array.isArray(doc.shapes))   doc.shapes   = [];
  if (!doc.watermark) {
    doc.watermark = {
      enabled: false, type: 'text', content: 'CONFIDENTIAL', imageUrl: null,
      opacity: 0.08, position: 'center', rotation: -30, fontSize: 72,
      color: '#000000', scope: 'page',
    };
  }
  if (!doc.theme) {
    doc.theme = {
      primaryColor: '#0000FF', secondaryColor: '#B22222', accentColor: '#999999',
      fontFamily: 'Arial, sans-serif', baseFontSize: 12, pagePadding: '16px 18px',
      pageBackground: '#ffffff',
      pageBorder: { enabled: false, color: '#cccccc', width: 1, style: 'solid', radius: 0 },
      pageSize: 'a4', orientation: 'portrait',
    };
  }

  // Normalize per-section arrays so renderers never receive null/undefined
  doc.sections = doc.sections.map(s => {
    const section = s as unknown as Record<string, unknown>;
    if (!Array.isArray(section.fields))  section.fields  = [];
    if (!Array.isArray(section.items))   section.items   = [];
    if (!Array.isArray(section.columns)) section.columns = [];
    if (!Array.isArray(section.rows))    section.rows    = [];
    
    // Ensure ribbon sections have valid shape property
    if (section.type === 'ribbon' && section.content) {
      const content = section.content as Record<string, unknown>;
      if (!content.shape || !['arrow-down', 'chevron', 'flat'].includes(content.shape as string)) {
        content.shape = 'arrow-down'; // Default shape for backwards compatibility
      }
    }
    
    return section as unknown as DRCESection;
  });

  return doc;
}
