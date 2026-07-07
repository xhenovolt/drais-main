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
  | 'block_ref'    // Phase H — reference to a shared block in drce_blocks
  | 'table'        // X4 — spreadsheet-style DataGrid with formulas + dataSource
  // ─── CAFE Phase 4 — competency-aware section types ──────────────────────
  | 'competency_table'   // Subjects × components grid with grade codes
  | 'descriptor_grid'    // Subjects × components grid showing descriptors
  | 'aoi_breakdown'      // Activity-of-Integration component breakdown
  | 'skills_block'       // Student-level generic skills (Communication, ICT, …)
  | 'project_outcomes'   // Student-level project portfolio outcomes
  | 'narrative_block'    // Free-form narrative paragraph bindable to any path
  | 'signature_block';   // Signed-by panel with one or more signatories

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

/**
 * Vector path shape — Phase F-vector. Output of the Pen Tool and the Custom
 * Polygon tool. Nodes (`commands`) round-trip cleanly via SVG path syntax
 * (`d` string) so renderers / PDFs / future external consumers can read the
 * path with zero schema knowledge.
 *
 * Legacy primitives (rect / ellipse / triangle / diamond / etc.) continue to
 * use their dedicated shapes; the loader does NOT auto-rewrite them into
 * paths — keeping their typed positioning model preserves all existing
 * resize / rotate behaviour. New shapes drawn with Pen / Polygon land as
 * `'path'` directly.
 */
export interface DRCEPathNode {
  /** Anchor point coordinates. */
  x: number; y: number;
  /** Bezier control handle relative to the anchor — first segment going IN. */
  cpInX?: number; cpInY?: number;
  /** Bezier control handle relative to the anchor — segment going OUT. */
  cpOutX?: number; cpOutY?: number;
}

export interface DRCEPathShape {
  id: string;
  type: 'path';
  nodes: DRCEPathNode[];
  /** Cached SVG `d` string. Computed on every node mutation; recomputed at
   *  render if absent. Storing it makes external/PDF consumers trivial. */
  d?: string;
  closed: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  rotation: number;
}

/**
 * P3 — Image shape primitive. Renders any URL (uploaded asset, bound data
 * source like `student.photoUrl`, or a remote logo). Lives in the same
 * `document.shapes[]` array as other shapes; the renderer treats it as a
 * peer of rect / ellipse / path so it inherits drag, resize, rotate,
 * opacity, z-order from the existing interaction layer.
 */
export interface DRCEImageShape {
  id: string;
  type: 'image';
  x: number; y: number; w: number; h: number;
  /** Resolved image URL. Set directly by upload, or computed at render
   *  time from `binding` (which takes precedence when present). */
  src: string;
  /** Optional binding path. When set, the renderer resolves it against
   *  the DRCEDataContext and uses the result as the src. Use cases:
   *    • `student.photoUrl` for live student portraits
   *    • `meta.logoUrl`     for the school crest
   *    • `student.custom.signature_url` for any bound custom field. */
  binding?: string;
  /** How the image fills its box. Default 'contain' (preserves ratio). */
  fit?: 'contain' | 'cover' | 'stretch';
  /** Crop expressed as fractions [0..1] of the original asset. All four
   *  default to 0 (no crop). The renderer maps these to SVG viewBox so the
   *  uncropped pixels are discarded losslessly. */
  cropLeft?:   number;
  cropTop?:    number;
  cropRight?:  number;
  cropBottom?: number;
  /** Alt text — surfaced into print output for accessibility / SEO. */
  alt?: string;
  opacity:  number;
  rotation: number;
}

/**
 * QR code shape primitive. Renders a square QR via qrcode.react.
 * `value` is the literal string encoded; when `binding` is set it
 * resolves at render time and overrides `value`. The renderer fills
 * the entire (x,y,w,h) box edge-to-edge — no inner whitespace,
 * trivial to resize.
 *
 * Use case: anti-forgery — encode a signed report-card URL so a
 * verifier can scan and reach an authoritative read-only view.
 */
export interface DRCEQRCodeShape {
  id: string;
  type: 'qrcode';
  x: number; y: number; w: number; h: number;
  /** Literal string to encode. Falls back to '' when missing. */
  value: string;
  /** Optional binding path that overrides `value` at render time. */
  binding?: string;
  /** Foreground (modules). */
  fg?: string;
  /** Background (quiet zone). */
  bg?: string;
  /** Error correction level (default 'M'). */
  level?: 'L' | 'M' | 'Q' | 'H';
  /** Include a margin INSIDE the SVG (default false — DRCE already controls outer spacing). */
  includeMargin?: boolean;
  opacity:  number;
  rotation: number;
}

/**
 * Barcode shape primitive. Renders a tight-fit pseudo-Code-128 SVG
 * — every bar fills the full (x,y,w,h) box edge-to-edge, no
 * preserveAspectRatio shenanigans. Differs from the InlineBarcode
 * inside StudentInfoSection which was fixed at 36 px wide; this one
 * is freely resizable.
 *
 * The underlying barcode pattern is the same heuristic used by
 * InlineBarcode (charCode % 10 → bar width) — visually scannable on a
 * dedicated scanner is NOT guaranteed but the value is rendered as a
 * label below the bars for unambiguous human read-out. For
 * scanner-grade barcodes, integrate a real Code128/EAN library.
 */
export interface DRCEBarcodeShape {
  id: string;
  type: 'barcode';
  x: number; y: number; w: number; h: number;
  /** Literal string to encode. Falls back to '' when missing. */
  value: string;
  /** Optional binding (e.g. 'student.admissionNo'). Overrides `value`. */
  binding?: string;
  fg?: string;
  bg?: string;
  /** Show the value as text below the bars. Default true. */
  showLabel?:    boolean;
  labelFontSize?: number;
  opacity:  number;
  rotation: number;
}

export type DRCEShape =
  | DRCERectShape | DRCEEllipseShape | DRCELineShape | DRCETextShape
  | DRCEPolygonShape | DRCEPathShape | DRCEImageShape
  | DRCEQRCodeShape | DRCEBarcodeShape;

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
  /**
   * P2 — Conditional visibility rule, evaluated per-student at render time.
   *   • null / undefined → unconditionally rendered (legacy behaviour).
   *   • A rule that evaluates false → section is skipped for THAT learner.
   * `visible: false` still hides for everyone, so the static toggle wins
   * over the dynamic rule. See src/lib/drce/visibility.ts.
   */
  visibilityRule?: import('./visibility').VisibilityRule | null;
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

/**
 * Signature block — for "signed by" panels at the foot of report cards.
 * Renders as a row of one or more signatories, each with:
 *   - optional signature image (uploaded, or bound from a person record)
 *   - signature line (always rendered so paper-signed reports work)
 *   - role label  (e.g. "HEADTEACHER", "CLASS TEACHER")
 *   - signatory name  (e.g. "Mr. Kalungi Steven")
 *   - optional date line / static date
 *
 * Static value vs binding:
 *   - `signatureImageUrl` is the literal URL fall-back; if `imageBinding`
 *     resolves to a non-empty string it wins. Same convention as the image
 *     shape so authors switch between fixed and bound signatures
 *     uniformly.
 *   - `dateValue` is a literal "1st October 2026"-style string. When
 *     empty AND `showDate` is true, the renderer falls back to a blank
 *     line for hand-signing.
 */
export interface DRCESignatory {
  id:                string;
  /** Role title above or below the line. Empty hides the label row. */
  roleLabel:         string;
  /** Signatory name, e.g. "Mr. Kalungi Steven". Empty hides the name row. */
  name:              string;
  /** Static signature image URL — overridden by imageBinding when set. */
  signatureImageUrl?: string;
  /** Optional binding path (e.g. 'meta.headteacherSignatureUrl'). */
  imageBinding?:     string;
  /** Literal "23 Oct 2026" date string; blank → unfilled date line. */
  dateValue?:        string;
  /** Show the date line under the signature. Default true. */
  showDate?:         boolean;
}

export interface DRCESignatureSectionStyle {
  /** How many signatories per row. Defaults to children.length (single row). */
  perRow?:        number;
  /** Space between signatories. */
  gap?:           number;
  /** Signature line color + thickness. */
  lineColor?:     string;
  lineThickness?: number;
  /** Height reserved for the signature image / signing area. */
  signatureHeight?: number;
  /** Image fit when signatureImageUrl is set. */
  imageFit?:      'contain' | 'cover' | 'stretch';
  /** Label font / colour. */
  labelColor?:    string;
  labelFontSize?: number;
  labelWeight?:   number;
  nameColor?:     string;
  nameFontSize?:  number;
  /** Outer padding around the whole block. */
  padding?:       string;
  /** Outer background — usually transparent or a very subtle wash. */
  background?:    string;
  /** Show a label like "Date:" next to the date value. */
  showDateLabel?: boolean;
  dateLabel?:     string;
}

export interface DRCESignatureSection extends DRCESectionBase {
  type:        'signature_block';
  signatories: DRCESignatory[];
  style:       DRCESignatureSectionStyle;
}

export interface DRCENextTermBeginsSection extends DRCESectionBase {
  type: 'next_term_begins';
  content: {
    text: string;
    customDate?: string;
    /** Where the date comes from. Missing = inferred (manual if customDate set,
     *  else auto). 'hidden' renders nothing. */
    source?: 'auto_from_terms' | 'manual' | 'hidden';
  };
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

// ─── Table (X4 — DataGrid with formulas, dataSource, merge) ───────────────────

export interface DRCETableColumn {
  id:     string;
  header: string;
  /** Optional Arabic header label. Rendered instead of `header` when the report
   *  language is Arabic (e.g. header 'Subject' + headerAr 'المادة'). */
  headerAr?: string;
  /** CSS width — '20%' or '120px'. */
  width:  string;
  align?: 'left' | 'center' | 'right';
  /** Default binding for every cell in this column when no per-cell override. */
  binding?: string;
  /** Display formatter applied through resolveExpression pipes (e.g. 'number:"#,##0.0"'). */
  format?:  string;
}

export interface DRCETableCellOverride {
  /** Static literal — wins over binding/formula. */
  value?:   string | number | boolean | null;
  /** Tokenisable expression — resolved through resolveExpression. */
  binding?: string;
  /** Formula expression — e.g. '=SUM(B2:B12)'. */
  formula?: string;
  /** Per-cell display formatter (overrides column.format). E.g. 'number:"#,##0.0"'. */
  format?:  string;
  /** Span this cell across N columns to the right. */
  mergeRight?: number;
  /** Span this cell down N rows. */
  mergeDown?:  number;
  /** Style overrides for this single cell. */
  style?: DRCEColumnStyle;
}

export interface DRCETableTotals {
  enabled: boolean;
  label?:  string;
  /** Column ids whose cells are summed. */
  sumColumnIds: string[];
}

export interface DRCETableStyle {
  headerBackground?:      string;
  headerBorder?:          string;
  rowBorder?:             string;
  headerFontSize?:        number;
  rowFontSize?:           number;
  headerTextTransform?:   'uppercase' | 'none' | 'capitalize';
  padding?:               number;
  stripe?:                string;   // alternating-row background
}

export interface DRCETableSection extends DRCESectionBase {
  type:    'table';
  /** Column definitions; left-to-right ordering. */
  columns: DRCETableColumn[];
  /**
   * Either an expression resolving to an array (the dataSource) — each
   * element becomes a row — OR an explicit row count for a static grid.
   * When dataSource is set, `staticRowCount` is ignored.
   *
   * Examples: 'results' · 'subjects' · 'meta.calendar.upcoming'
   */
  dataSource?:      string;
  /** For "blank spreadsheet" tables that don't iterate over a collection. */
  staticRowCount?:  number;
  /**
   * Sparse per-cell overrides. Key format: `${rowKey}:${columnId}`.
   * rowKey is the row index (0-based) for dataSource-driven tables, or
   * 'r0', 'r1', … for static tables. Cells without an override fall back
   * to `column.binding`.
   */
  cells?: Record<string, DRCETableCellOverride>;
  totals?: DRCETableTotals;
  style:   DRCETableStyle;
}

// ─── CAFE Phase 4 — competency-aware section types ──────────────────────────

/**
 * Subjects × components grid showing the grade code (or short label) per
 * cell. Reads `result.components[]` for each result. When components are
 * absent (snapshot generated before CAFE), the grid renders empty cells.
 */
export interface DRCECompetencyTableSection extends DRCESectionBase {
  type:  'competency_table';
  /** Optional whitelist of component codes to include — empty/missing
   *  means "include every component that appears in any result". */
  componentCodes?: string[];
  /** Show the rollup (weighted mean) column at the end. */
  showRollup?:    boolean;
  /** Show the per-row subject column on the left. */
  showSubject?:   boolean;
  style: {
    headerBackground?: string;
    headerBorder?:     string;
    rowBorder?:        string;
    headerFontSize?:   number;
    rowFontSize?:      number;
    padding?:          number;
    /** When true and a grade_mapping color exists, the cell background
     *  is tinted with that color. Off by default to stay neutral. */
    colorByGrade?:     boolean;
  };
}

/**
 * Like competency_table but shows the descriptor TEXT in each cell instead
 * of the grade code — for narrative-leaning competency reports.
 */
export interface DRCEDescriptorGridSection extends DRCESectionBase {
  type:  'descriptor_grid';
  componentCodes?: string[];
  showSubject?:   boolean;
  style: {
    headerBackground?: string;
    rowBorder?:        string;
    fontSize?:         number;
    padding?:          number;
  };
}

/**
 * Activity-of-Integration breakdown — a competency_table filtered to
 * components whose code starts with the configured prefix (default 'aoi').
 */
export interface DRCEAoIBreakdownSection extends DRCESectionBase {
  type:  'aoi_breakdown';
  /** Component code prefix to filter (default 'aoi'). */
  componentPrefix?: string;
  style: {
    headerBackground?: string;
    accentColor?:      string;
    fontSize?:         number;
  };
}

/**
 * Student-level generic skills (Communication, Collaboration, ICT, …).
 * Reads `student.genericSkills[]`. Storage lands in a future CAFE phase;
 * until then this section renders a placeholder row explaining what will
 * appear when data exists.
 */
export interface DRCESkillsBlockSection extends DRCESectionBase {
  type:  'skills_block';
  /** Optional title row above the skills list. */
  heading?: string;
  /** Whitelist of skill codes (Communication, Collaboration, …); empty =
   *  show all available. */
  skillCodes?: string[];
  style: {
    headerBackground?: string;
    rowBorder?:        string;
    fontSize?:         number;
  };
}

/**
 * Student-level project portfolio. Reads `student.projects[]`. Renders a
 * placeholder when no project data is present (Phase 5+ storage).
 */
export interface DRCEProjectOutcomesSection extends DRCESectionBase {
  type:  'project_outcomes';
  heading?: string;
  /** When true, render a thumbnail / link for each project's evidence
   *  attachment (Phase 5+). For now, render the descriptor text. */
  showEvidence?: boolean;
  style: {
    headerBackground?: string;
    accentColor?:      string;
    fontSize?:         number;
  };
}

/**
 * Free-form narrative paragraph — like a banner but multi-line and
 * bindable to any data path. Useful for headteacher remarks, programme
 * descriptions, or competency-narrative reports.
 */
export interface DRCENarrativeBlockSection extends DRCESectionBase {
  type:  'narrative_block';
  /** Text body. Supports the same {binding | format} grammar as banner. */
  content: { text: string };
  style: {
    background?: string;
    color?:      string;
    fontSize?:   number;
    fontStyle?:  'normal' | 'italic';
    textAlign?:  'left' | 'center' | 'right' | 'justify';
    padding?:    string;
    borderLeft?: string;
    lineHeight?: number;
  };
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
  | DRCEBlockRefSection
  | DRCETableSection
  // CAFE Phase 4
  | DRCECompetencyTableSection
  | DRCEDescriptorGridSection
  | DRCEAoIBreakdownSection
  | DRCESkillsBlockSection
  | DRCEProjectOutcomesSection
  | DRCENarrativeBlockSection
  | DRCESignatureSection;

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
  /**
   * P4 — workflow status. Optional so legacy schema_json blobs (which never
   * stored status) keep loading; the DB row's `status` column is the source
   * of truth at read time. Pure render paths ignore status.
   */
  status?: import('./workflow').TemplateStatus;
  /**
   * Round 1 — Canva/Office-style "what is this?" classifier.
   * Free-text on purpose so a school can introduce its own kinds
   * (`prefects_badge`, `tahfiz_certificate`) without a schema change.
   * Default 'report' for every legacy row. The kind is metadata only —
   * the renderer never branches on it; the editor surfaces it as a chip
   * and shows soft warnings when document settings look unusual for
   * the kind (e.g. portrait orientation on a certificate).
   */
  document_kind?: string;
}

// ─── Page (P5 — multi-page document model) ───────────────────────────────────

/**
 * A single page in a multi-page document. Used for certificates, transcripts,
 * long reports, anything that needs distinct header/footer/layout per page.
 *
 * When a document has `pages: DRCEPage[]`, the renderer iterates the pages
 * and the top-level `document.sections` is ignored (a one-shot migration
 * helper moves them into `pages[0]` the first time multi-page is enabled).
 * Documents without `pages` continue to render exactly as before — the page
 * model is opt-in per template.
 */
export interface DRCEPage {
  id: string;
  /** Display name in the page navigator, e.g. "Cover", "Page 1", "Transcript". */
  name: string;
  /** Sections that belong to this page. Identical model + mutation surface
   *  as the legacy top-level `sections` — every existing section type
   *  works inside a page without modification. */
  sections: DRCESection[];
  /** Optional per-page shape overlay. Top-level `document.shapes` still
   *  renders on EVERY page (use it for full-document watermarks); per-page
   *  shapes draw only on this page. */
  shapes?: DRCEShape[];
  /** Per-page theme override. Layered shallowly on top of `document.theme`
   *  — only the fields you set here change for this page. Most commonly
   *  used for page size / orientation overrides (a landscape cover, a
   *  portrait body), but every theme field is overridable. */
  themeOverride?: Partial<DRCETheme>;
  /** Per-page watermark override. `undefined` inherits the document's
   *  watermark; an explicit `{ enabled: false }` turns it off for this page. */
  watermarkOverride?: Partial<DRCEWatermark>;
  /** P2 — same conditional-visibility rule as sections. When the rule
   *  evaluates false for a given learner, the whole page is skipped on
   *  the print path. Powers "only print the transcript page for
   *  graduating students" use cases. */
  visibilityRule?: import('./visibility').VisibilityRule | null;
  /** CSS page-break policy applied between this page and the previous one. */
  pageBreakBefore?: 'auto' | 'always' | 'avoid';
  /**
   * Phase L3 — per-page HEADER section. Single full DRCESection (any
   * type — banner, header, container, table, …) rendered ABOVE
   * `sections[]` on this page. Different from doc-level
   * `runningHeader` which prints on every paper page via puppeteer's
   * headerTemplate: this slot renders once per DRCE page, in the
   * normal document flow. Use it for per-page titles, banners, and
   * decorative bars that the operator wants to compose with the
   * full section vocabulary (results tables, shapes, formulas).
   *
   * Doc-level `runningHeader` is the right tool for "Page X of Y" on
   * every paper page; `pageHeader` is the right tool for "Term 1
   * Marks — Page 1" decorative top-of-page.
   */
  pageHeader?: DRCESection;
  /** Phase L3 — per-page FOOTER section. Mirror of pageHeader,
   *  rendered BELOW `sections[]` on this page. */
  pageFooter?: DRCESection;
}

// ─── Root Document ────────────────────────────────────────────────────────────

/**
 * Recurring page header / footer. Repeats on EVERY physical paper
 * page a report card flows onto — distinct from a header SECTION
 * which appears once at the start of the body flow.
 *
 * The `text` field supports a small set of placeholders resolved at
 * render time:
 *   {schoolName}   from snapshot meta
 *   {termYear}     "Term 1 · 2026" composed from snapshot meta
 *   {term}         term name alone
 *   {year}         year name alone
 *   {type}         snapshot type (secular / theology / mixed)
 *   {pageNumber}   physical page index (1-based)
 *   {totalPages}   total physical pages in the print job
 *   {generatedAt}  formatted snapshot generation timestamp
 *
 * Per-learner placeholders (name, class, …) are NOT supported here
 * because puppeteer's PDF header template is global across pages.
 * Use a HeaderSection in the body for per-learner identification.
 */
export interface DRCERunningHeaderFooter {
  /** False hides this slot regardless of `text`. Default false. */
  show?:      boolean;
  /** Plain-string template with placeholders. HTML is escaped. */
  text:       string;
  align?:     'left' | 'center' | 'right';
  /** Font size in points (puppeteer header/footer template convention). */
  fontSize?:  number;
  color?:     string;
  fontFamily?: string;
  /** Reserved space (mm) at the corresponding paper edge. Larger
   *  values give the header/footer more room; smaller values pull
   *  the body closer to the edge. */
  reserveMm?: number;
}

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
  /**
   * P5 — multi-page mode. When present and non-empty the renderer iterates
   * the pages and the flat `sections` array is treated as legacy fallback
   * (kept so older snapshots / draft conversions never lose data). Absent
   * on every legacy document; the editor only writes here after the user
   * explicitly enables multi-page on a template.
   */
  pages?: DRCEPage[];
  /** Phase L2 — recurring header repeated on every physical paper page. */
  runningHeader?: DRCERunningHeaderFooter;
  /** Phase L2 — recurring footer repeated on every physical paper page. */
  runningFooter?: DRCERunningHeaderFooter;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export type DRCEMutation =
  | { type: 'SET_THEME';           path: string; value: unknown }
  | { type: 'SET_SECTION_STYLE';   sectionId: string; path: string; value: unknown }
  | { type: 'SET_SECTION_PROP';    sectionId: string; path: string; value: unknown }
  | { type: 'SET_SECTION_CONTENT'; sectionId: string; path: string; value: unknown }
  | { type: 'TOGGLE_SECTION';      sectionId: string }
  | { type: 'REORDER_SECTIONS';    ids: string[]; pageId?: string | null }
  | { type: 'ADD_SECTION';         section: DRCESection; afterId: string | null; parentContainerId?: string | null;
      /** P5 — when set, append into this page's section array instead of
       *  the document's top-level array. Editor's active-page state passes
       *  this through transparently; legacy callers omit it. */
      pageId?: string | null }
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
  | { type: 'SET_RUNNING_HEADER';  path: string; value: unknown }
  | { type: 'SET_RUNNING_FOOTER';  path: string; value: unknown }
  /**
   * Phase L3 — set / replace / clear a page-level header / footer
   * section. `section: null` clears the slot. Identified by pageId
   * because the slot lives on a DRCEPage, not the document.
   */
  | { type: 'SET_PAGE_HEADER';     pageId: string; section: DRCESection | null }
  | { type: 'SET_PAGE_FOOTER';     pageId: string; section: DRCESection | null }
  | { type: 'SET_GRADE_ROWS';      sectionId: string; grades: DRCEGradeRow[] }
  | { type: 'ADD_SHAPE';           shape: DRCEShape }
  | { type: 'UPDATE_SHAPE';        id: string; updates: Partial<DRCEShape> }
  | { type: 'DELETE_SHAPE';        id: string }
  | { type: 'SET_COMMENT_RULES';   rules: DRCECommentRule[] }
  | { type: 'SET_TEACHER_MAPPINGS'; mappings: DRCETeacherMapping[] }
  // ── P5 — multi-page mutations ─────────────────────────────────────────────
  | { type: 'ENABLE_MULTI_PAGE' }
  | { type: 'ADD_PAGE';            name?: string; afterId?: string | null }
  | { type: 'DELETE_PAGE';         pageId: string }
  | { type: 'REORDER_PAGES';       ids: string[] }
  | { type: 'SET_PAGE_PROP';       pageId: string; prop: 'name' | 'themeOverride' | 'watermarkOverride' | 'visibilityRule' | 'pageBreakBefore'; value: unknown };

// ─── Data Context (passed to renderer at print/preview time) ─────────────────

export interface DRCESubject {
  id: number;
  name: string;
  /** Configurable total marks for this subject (default 100) */
  totalMarks: number;
  /** 'primary' = core subject, 'secondary' = non-core/elective */
  subjectType?: 'primary' | 'secondary';
  /** Phase 7 — allocation classification frozen at snapshot generation. */
  department?: string;
  subjectGroup?: string;
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
  /** Phase 7 — allocation-derived bindings. `primaryTeacher` is the lead
   *  teacher's name; `teachers` lists every report-visible teacher, primary
   *  first; `department` / `subjectGroup` are the subject's classification;
   *  `subjectComment` mirrors the resolved per-subject comment. */
  primaryTeacher?: string;
  teachers?: string;
  department?: string;
  subjectGroup?: string;
  subjectComment?: string;
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
  /**
   * P1 — Custom field values for this student, keyed by the field `code`
   * defined in the per-school custom-fields catalog. DRCE bindings of the
   * form `student.custom.<code>` resolve through this map. Absent on
   * snapshots generated before P1 — fall back to `null` in templates.
   */
  custom?: Record<string, string | number | boolean | string[] | null>;
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
  /** P4 — workflow status from the dvcf_documents.status column. */
  status?: import('./workflow').TemplateStatus;
  /** Round 1 — Canva-style "what is this?" classifier (see DRCEMeta). */
  document_kind?: string;
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
    status: row.status ?? 'published',  // P4 — legacy rows default to published
    document_kind: row.document_kind ?? 'report',  // Round 1
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
