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
  | 'divider';

// ─── Theme ───────────────────────────────────────────────────────────────────

export interface DRCEPageBorder {
  enabled: boolean;
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted' | 'double';
  radius: number;
}

export interface DRCETheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  baseFontSize: number;
  pagePadding: string;
  pageBackground: string;
  pageBorder: DRCEPageBorder;
}

// ─── Watermark ───────────────────────────────────────────────────────────────

export type DRCEWatermarkType = 'text' | 'image';
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

export type DRCEShape = DRCERectShape | DRCEEllipseShape | DRCELineShape | DRCETextShape;

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

export interface DRCEHeaderStyle {
  layout: 'three-column' | 'centered' | 'left-logo';
  paddingBottom: number;
  borderBottom: string;
  opacity: number;
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
  textColor: string;
  textFontStyle: 'italic' | 'normal';
}

export interface DRCEGradeTableStyle {
  headerBackground: string;
  border: string;
}

export interface DRCESpacerStyle {
  height: number; // px
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

export interface DRCEResultsTableSection extends DRCESectionBase {
  type: 'results_table';
  columns: DRCEColumn[];
  style: DRCEResultsTableStyle;
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
}

export interface DRCESpacerSection extends DRCESectionBase {
  type: 'spacer';
  style: DRCESpacerStyle;
}

export interface DRCEDividerSection extends DRCESectionBase {
  type: 'divider';
  style: { color: string; thickness: number; margin: string };
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
  | DRCEDividerSection;

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
}

// ─── Root Document ────────────────────────────────────────────────────────────

export interface DRCEDocument {
  $schema: 'drce/v1';
  meta: DRCEMeta;
  theme: DRCETheme;
  watermark: DRCEWatermark;
  sections: DRCESection[];
  shapes: DRCEShape[];
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export type DRCEMutation =
  | { type: 'SET_THEME';           path: string; value: unknown }
  | { type: 'SET_SECTION_STYLE';   sectionId: string; path: string; value: unknown }
  | { type: 'SET_SECTION_CONTENT'; sectionId: string; path: string; value: unknown }
  | { type: 'TOGGLE_SECTION';      sectionId: string }
  | { type: 'REORDER_SECTIONS';    ids: string[] }
  | { type: 'ADD_SECTION';         section: DRCESection; afterId: string | null }
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
  | { type: 'ADD_SHAPE';           shape: DRCEShape }
  | { type: 'UPDATE_SHAPE';        id: string; updates: Partial<DRCEShape> }
  | { type: 'DELETE_SHAPE';        id: string };

// ─── Data Context (passed to renderer at print/preview time) ─────────────────

export interface DRCEResultRow {
  subjectName: string;
  midTermScore: number | null;
  endTermScore: number | null;
  total: number | null;
  grade: string;
  comment: string;
  initials: string;
  teacherName: string;
}

export interface DRCEAssessmentData {
  classPosition: number | null;
  streamPosition: number | null;
  aggregates: number | null;
  division: string | null;
  totalStudents: number | null;
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
  centerNo: string;
  registrationNo: string;
  arabicName: string | null;
  arabicAddress: string | null;
  logoUrl: string | null;
  term: string;
  year: string;
  reportTitle: string;
}

export interface DRCEDataContext {
  student: DRCEStudentData;
  results: DRCEResultRow[];
  assessment: DRCEAssessmentData;
  comments: DRCECommentsData;
  meta: DRCEMetaContext;
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
  created_at: string;
  updated_at: string;
}

/** Parse a raw DB row into a typed DRCEDocument */
export function parseDRCERow(row: DVCFDocumentRow): DRCEDocument {
  const doc = typeof row.schema_json === 'string'
    ? JSON.parse(row.schema_json) as DRCEDocument
    : row.schema_json as unknown as DRCEDocument;

  // Ensure meta fields from the DB row override what's in the JSON
  doc.meta = {
    ...doc.meta,
    id: String(row.id),
    name: row.name,
    school_id: row.school_id,
    is_default: Boolean(row.is_default),
    template_key: row.template_key,
  };

  return doc;
}
